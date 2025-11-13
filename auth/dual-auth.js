/**
 * Dual Authentication Middleware
 * Supports both JWT token authentication and license key authentication
 */

const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('./jwt');

const prisma = new PrismaClient();

/**
 * Authenticate using either JWT token OR license key
 *
 * Priority order:
 * 1. Try JWT token from Authorization header (Bearer token)
 * 2. Try license key from X-License-Key header
 * 3. Try license key from request body
 *
 * On success, sets:
 * - req.user: User object (if JWT auth)
 * - req.organization: Organization object (always)
 * - req.authMethod: 'jwt' or 'license'
 */
async function dualAuthenticate(req, res, next) {
  // Try JWT authentication first
  const authHeader = req.headers['authorization'];
  const jwtToken = authHeader && authHeader.split(' ')[1];

  if (jwtToken) {
    try {
      const decoded = verifyToken(jwtToken);
      req.user = decoded;

      // Get user's primary organization (personal org or first org they're a member of)
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: decoded.id },
        include: {
          organization: true
        },
        orderBy: { role: 'asc' } // Owner first, then admin, then member
      });

      if (membership) {
        req.organization = membership.organization;
        req.authMethod = 'jwt';
        return next();
      }

      // User has JWT but no organization - might be using old system
      // Allow them to continue but without organization context
      req.authMethod = 'jwt';
      return next();

    } catch (error) {
      // JWT invalid, try license key next
    }
  }

  // Try license key authentication
  const licenseKey = req.headers['x-license-key'] || req.body?.licenseKey;

  if (licenseKey) {
    try {
      const organization = await prisma.organization.findUnique({
        where: { licenseKey }
      });

      if (!organization) {
        return res.status(401).json({
          error: 'Invalid license key',
          code: 'INVALID_LICENSE'
        });
      }

      req.organization = organization;
      req.authMethod = 'license';
      return next();

    } catch (error) {
      return res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR'
      });
    }
  }

  // No valid authentication provided
  return res.status(401).json({
    error: 'Authentication required. Provide either JWT token or license key.',
    code: 'MISSING_AUTH'
  });
}

/**
 * Optional dual authentication - doesn't fail if no auth provided
 */
async function optionalDualAuth(req, res, next) {
  // Try JWT authentication first
  const authHeader = req.headers['authorization'];
  const jwtToken = authHeader && authHeader.split(' ')[1];

  if (jwtToken) {
    try {
      const decoded = verifyToken(jwtToken);
      req.user = decoded;

      const membership = await prisma.organizationMember.findFirst({
        where: { userId: decoded.id },
        include: {
          organization: true
        },
        orderBy: { role: 'asc' }
      });

      if (membership) {
        req.organization = membership.organization;
        req.authMethod = 'jwt';
      }

      return next();

    } catch (error) {
      // JWT invalid, try license key next
    }
  }

  // Try license key authentication
  const licenseKey = req.headers['x-license-key'] || req.body?.licenseKey;

  if (licenseKey) {
    try {
      const organization = await prisma.organization.findUnique({
        where: { licenseKey }
      });

      if (organization) {
        req.organization = organization;
        req.authMethod = 'license';
      }

    } catch (error) {
      // Ignore errors in optional auth
    }
  }

  // Continue even if no auth provided
  next();
}

/**
 * Get organization from site hash (for site-based quota sharing)
 *
 * For Free/Pro plans: All users on the same WordPress site share quota
 * This middleware looks up the site and organization from the site hash
 */
async function authenticateBySiteHash(req, res, next) {
  const siteHash = req.headers['x-site-hash'] || req.body?.siteHash;

  if (!siteHash) {
    return res.status(400).json({
      error: 'Site hash required',
      code: 'MISSING_SITE_HASH'
    });
  }

  try {
    const site = await prisma.site.findUnique({
      where: { siteHash },
      include: {
        organization: true
      }
    });

    if (!site) {
      return res.status(404).json({
        error: 'Site not registered',
        code: 'SITE_NOT_FOUND'
      });
    }

    if (!site.isActive) {
      return res.status(403).json({
        error: 'Site has been deactivated',
        code: 'SITE_DEACTIVATED'
      });
    }

    // Update lastSeen
    await prisma.site.update({
      where: { id: site.id },
      data: { lastSeen: new Date() }
    });

    req.site = site;
    req.organization = site.organization;
    req.authMethod = 'site';

    next();

  } catch (error) {
    console.error('Error authenticating by site hash:', error);
    return res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Combined authentication: Try JWT/License first, fallback to site hash
 * This is the main middleware for /api/generate endpoint
 */
async function combinedAuth(req, res, next) {
  // Try dual auth first (JWT or license key)
  const authHeader = req.headers['authorization'];
  const jwtToken = authHeader && authHeader.split(' ')[1];
  const licenseKey = req.headers['x-license-key'] || req.body?.licenseKey;

  if (jwtToken || licenseKey) {
    return dualAuthenticate(req, res, next);
  }

  // Fallback to site hash authentication
  const siteHash = req.headers['x-site-hash'] || req.body?.siteHash;

  if (siteHash) {
    return authenticateBySiteHash(req, res, next);
  }

  // No authentication provided
  return res.status(401).json({
    error: 'Authentication required. Provide JWT token, license key, or site hash.',
    code: 'MISSING_AUTH'
  });
}

module.exports = {
  dualAuthenticate,
  optionalDualAuth,
  authenticateBySiteHash,
  combinedAuth
};
