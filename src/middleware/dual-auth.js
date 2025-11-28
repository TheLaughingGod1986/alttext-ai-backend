/**
 * Dual Authentication Middleware
 * Supports both JWT token authentication and license key authentication
 * Also supports site-based authentication via X-Site-Hash for quota tracking
 */

const { supabase } = require('../../db/supabase-client');
const { verifyToken } = require('../../auth/jwt');
const siteService = require('../services/siteService');

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
      const { data: memberships, error: membershipError } = await supabase
        .from('organization_members')
        .select('organizationId, role')
        .eq('userId', decoded.id)
        .order('role', { ascending: true }) // Owner first, then admin, then member
        .limit(1);

      if (!membershipError && memberships && memberships.length > 0) {
        const membership = memberships[0];
        const { data: organization, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', membership.organizationId)
          .single();

        if (!orgError && organization) {
          req.organization = organization;
          req.authMethod = 'jwt';
          return next();
        }
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
      const { data: organization, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('license_key', licenseKey)
        .single();

      if (orgError || !organization) {
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

      const { data: memberships, error: membershipError } = await supabase
        .from('organization_members')
        .select('organizationId, role')
        .eq('userId', decoded.id)
        .order('role', { ascending: true })
        .limit(1);

      if (!membershipError && memberships && memberships.length > 0) {
        const membership = memberships[0];
        const { data: organization, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', membership.organizationId)
          .single();

        if (!orgError && organization) {
          req.organization = organization;
          req.authMethod = 'jwt';
        }
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
      const { data: organization, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('license_key', licenseKey)
        .single();

      if (!orgError && organization) {
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
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('site_hash', siteHash)
      .single();

    if (siteError || !site) {
      return res.status(404).json({
        error: 'Site not registered',
        code: 'SITE_NOT_FOUND'
      });
    }

    // Get organization if site has one
    let organization = null;
    if (site.organizationId) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', site.organizationId)
        .single();

      if (!orgError && org) {
        organization = org;
      }
    }

    // Check if site is active (if isActive field exists)
    if (site.isActive === false) {
      return res.status(403).json({
        error: 'Site has been deactivated',
        code: 'SITE_DEACTIVATED'
      });
    }

    // Update lastSeen if field exists
    if (site.lastSeen !== undefined) {
      await supabase
        .from('sites')
        .update({ lastSeen: new Date().toISOString() })
        .eq('site_hash', siteHash);
    }

    req.site = site;
    req.organization = organization;
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
 * Authenticate by site hash for quota tracking
 * This allows requests to proceed even without JWT/license key (for free tier)
 * Sets req.site with site data including quota info
 */
async function authenticateBySiteHashForQuota(req, res, next) {
  const siteHash = req.headers['x-site-hash'] || req.body?.siteHash;

  if (!siteHash) {
    return res.status(400).json({
      error: 'Site hash required',
      code: 'MISSING_SITE_HASH'
    });
  }

  try {
    // Get or create site (will create with free plan if doesn't exist)
    const site = await siteService.getOrCreateSite(siteHash, req.headers['x-site-url'] || req.body?.siteUrl);

    // Get site usage/quota info
    const usage = await siteService.getSiteUsage(siteHash);

    // Get license if exists
    const license = await siteService.getSiteLicense(siteHash);

    // Set request properties
    req.site = site;
    req.siteUsage = usage;
    req.siteLicense = license;
    req.authMethod = 'site-hash';

    // If license exists, also set organization
    if (license && site.license_key) {
      // Try to get organization from license
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('license_key', site.license_key)
        .single();

      if (org) {
        req.organization = org;
      }
    }

    next();

  } catch (error) {
    console.error('Error authenticating by site hash for quota:', error);
    return res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR',
      message: error.message
    });
  }
}

/**
 * Combined authentication: Try JWT/License first, fallback to site hash
 * This is the main middleware for /api/generate endpoint
 * Updated to prioritize X-Site-Hash for quota tracking
 */
async function combinedAuth(req, res, next) {
  // Check for X-Site-Hash first (required for quota tracking)
  const siteHash = req.headers['x-site-hash'] || req.body?.siteHash;

  if (siteHash) {
    // Use site hash authentication for quota tracking
    // This allows free tier sites to work without JWT/license
    return authenticateBySiteHashForQuota(req, res, next);
  }

  // Fallback to dual auth (JWT or license key)
  const authHeader = req.headers['authorization'];
  const jwtToken = authHeader && authHeader.split(' ')[1];
  const licenseKey = req.headers['x-license-key'] || req.body?.licenseKey;

  if (jwtToken || licenseKey) {
    return dualAuthenticate(req, res, next);
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
  authenticateBySiteHashForQuota,
  combinedAuth
};
