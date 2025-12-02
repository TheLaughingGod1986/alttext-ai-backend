/**
 * Dual Authentication Middleware
 * Supports both JWT token authentication and license key authentication
 * Also supports site-based authentication via X-Site-Hash for quota tracking
 */

const { supabase } = require('../../db/supabase-client');
const { verifyToken } = require('../../auth/jwt');
const siteService = require('../services/siteService');
const logger = require('../utils/logger');

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
  const siteHash = req.headers['x-site-hash'] || req.body?.siteHash;

  if (licenseKey) {
    try {
      // Trim whitespace from license key
      const trimmedLicenseKey = licenseKey.trim();
      
      // Log the validation attempt
      logger.info('[DualAuth] Validating license key', {
        keyPreview: `${trimmedLicenseKey.substring(0, 8)}...${trimmedLicenseKey.substring(trimmedLicenseKey.length - 4)}`,
        keyLength: trimmedLicenseKey.length,
        hasSiteHash: !!siteHash,
        siteHash: siteHash ? `${siteHash.substring(0, 8)}...` : 'none'
      });

      // First, try to find in organizations table
      let organization = null;
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('license_key', trimmedLicenseKey)
        .single();

      if (!orgError && orgData) {
        organization = orgData;
        logger.info('[DualAuth] Found organization by license key', {
          orgId: organization.id,
          orgName: organization.name,
          plan: organization.plan
        });
      }

      // If not found in organizations, try licenses table
      let license = null;
      if (!organization) {
        const { data: licenseData, error: licenseError } = await supabase
          .from('licenses')
          .select('*')
          .eq('license_key', trimmedLicenseKey)
          .single();

        if (!licenseError && licenseData) {
          license = licenseData;
          logger.info('[DualAuth] Found license by license key', {
            licenseId: license.id,
            licenseKey: `${license.license_key.substring(0, 8)}...`,
            status: license.status
          });
        }
      }

      // If neither found, return error
      if (!organization && !license) {
        logger.error('[DualAuth] License key not found in database', {
          keyPreview: `${trimmedLicenseKey.substring(0, 8)}...${trimmedLicenseKey.substring(trimmedLicenseKey.length - 4)}`,
          checkedOrganizations: true,
          checkedLicenses: true
        });
        return res.status(401).json({
          error: 'License key not found in database',
          code: 'LICENSE_NOT_FOUND',
          reason: 'license_not_found',
          message: 'The provided license key does not exist in our system'
        });
      }

      // If site hash is provided, verify license is associated with this site
      if (siteHash) {
        const trimmedSiteHash = siteHash.trim();
        
        // Check if site exists and has this license key
        const { data: site, error: siteError } = await supabase
          .from('sites')
          .select('license_key, organizationId')
          .eq('site_hash', trimmedSiteHash)
          .single();

        if (siteError || !site) {
          logger.warn('[DualAuth] Site not found for site hash', {
            siteHash: `${trimmedSiteHash.substring(0, 8)}...`,
            licenseKey: `${trimmedLicenseKey.substring(0, 8)}...`
          });
          // Don't fail here - site might be created later
        } else {
          // Verify license key matches site's license key
          if (site.license_key && site.license_key !== trimmedLicenseKey) {
            logger.error('[DualAuth] License key mismatch with site', {
              providedKey: `${trimmedLicenseKey.substring(0, 8)}...`,
              siteKey: site.license_key ? `${site.license_key.substring(0, 8)}...` : 'none',
              siteHash: `${trimmedSiteHash.substring(0, 8)}...`
            });
            return res.status(403).json({
              error: 'License key is not associated with this site',
              code: 'LICENSE_SITE_MISMATCH',
              reason: 'license_site_mismatch',
              message: 'The provided license key is not associated with the site hash provided'
            });
          }

          // If site has organizationId, verify it matches
          if (organization && site.organizationId && site.organizationId !== organization.id) {
            logger.error('[DualAuth] Organization mismatch with site', {
              licenseOrgId: organization.id,
              siteOrgId: site.organizationId,
              siteHash: `${trimmedSiteHash.substring(0, 8)}...`
            });
            return res.status(403).json({
              error: 'License key organization does not match site organization',
              code: 'LICENSE_ORG_MISMATCH',
              reason: 'license_org_mismatch',
              message: 'The license key belongs to a different organization than the site'
            });
          }

          logger.info('[DualAuth] License key validated and associated with site', {
            siteHash: `${trimmedSiteHash.substring(0, 8)}...`,
            licenseKey: `${trimmedLicenseKey.substring(0, 8)}...`,
            hasOrganization: !!organization,
            hasLicense: !!license
          });
        }
      }

      // Set request properties
      if (organization) {
        req.organization = organization;
      }
      if (license) {
        req.license = license;
      }
      req.authMethod = 'license';
      req.licenseKey = trimmedLicenseKey;
      
      return next();

    } catch (error) {
      logger.error('[DualAuth] License key validation error', {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR',
        reason: 'server_error',
        message: error.message
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
      // Trim whitespace from license key
      const trimmedLicenseKey = licenseKey.trim();
      
      // First, try to find in organizations table
      let organization = null;
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('license_key', trimmedLicenseKey)
        .single();

      if (!orgError && orgData) {
        organization = orgData;
      }

      // If not found in organizations, try licenses table
      let license = null;
      if (!organization) {
        const { data: licenseData, error: licenseError } = await supabase
          .from('licenses')
          .select('*')
          .eq('license_key', trimmedLicenseKey)
          .single();

        if (!licenseError && licenseData) {
          license = licenseData;
        }
      }

      // Set request properties if found
      if (organization) {
        req.organization = organization;
        req.authMethod = 'license';
        req.licenseKey = trimmedLicenseKey;
      }
      if (license) {
        req.license = license;
        req.authMethod = 'license';
        req.licenseKey = trimmedLicenseKey;
      }

    } catch (error) {
      // Ignore errors in optional auth
      logger.warn('[OptionalDualAuth] License key validation error (ignored)', { error: error.message });
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
    logger.error('Error authenticating by site hash', { error: error.message, stack: error.stack });
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

    // Debug logging for site and license
    logger.info('[AuthenticateBySiteHashForQuota] Site authentication', {
      siteHash: siteHash.substring(0, 8) + '...',
      siteId: site?.id,
      siteLicenseKey: site?.license_key ? `${site.license_key.substring(0, 8)}...` : 'none',
      hasLicense: !!license,
      licenseKey: license?.license_key ? `${license.license_key.substring(0, 8)}...` : 'none',
      quotaRemaining: usage?.remaining || 0,
      quotaLimit: usage?.limit || 0,
      plan: usage?.plan || 'unknown'
    });

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
    logger.error('Error authenticating by site hash for quota', { error: error.message, stack: error.stack });
    return res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR',
      message: error.message
    });
  }
}

/**
 * Combined authentication: Try JWT/License first, then set up site hash for quota tracking
 * This is the main middleware for /api/generate endpoint
 * Updated to handle both JWT/license auth AND site hash for quota tracking
 */
async function combinedAuth(req, res, next) {
  // First, try JWT or license key authentication (to set req.user or req.organization)
  const authHeader = req.headers['authorization'];
  const jwtToken = authHeader && authHeader.split(' ')[1];
  const licenseKey = req.headers['x-license-key'] || req.body?.licenseKey;
  const siteHash = req.headers['x-site-hash'] || req.body?.siteHash;

  // Debug logging for request authentication
  logger.info('[CombinedAuth] Request authentication', {
    hasJWT: !!jwtToken,
    hasLicenseKey: !!licenseKey,
    licenseKeySource: req.headers['x-license-key'] ? 'header-X-License-Key' : (req.body?.licenseKey ? 'body-licenseKey' : 'none'),
    licenseKeyPreview: licenseKey ? `${licenseKey.substring(0, 8)}...${licenseKey.substring(licenseKey.length - 4)}` : 'none',
    hasSiteHash: !!siteHash,
    siteHash: siteHash || 'none',
    path: req.path,
    method: req.method
  });

  // If JWT or license key is provided, authenticate with that first
  if (jwtToken || licenseKey) {
    // Authenticate with JWT/license first (sets req.user or req.organization)
    // Use a flag to track if we should continue after dualAuthenticate
    let jwtAuthSucceeded = false;
    
    dualAuthenticate(req, res, (err) => {
      if (err) {
        // JWT/license auth failed - error response already sent
        return;
      }
      
      jwtAuthSucceeded = true;
      
      // After JWT/license auth succeeds, also set up site hash for quota tracking if provided
      if (siteHash) {
        authenticateBySiteHashForQuota(req, res, (err2) => {
          if (err2) {
            // If site hash setup fails, continue anyway (JWT auth succeeded)
            // Site hash is mainly for quota tracking, not required if JWT auth worked
            logger.warn('[CombinedAuth] Site hash setup failed, but JWT auth succeeded', { error: err2.message });
          }
          // Continue to next middleware regardless
          next();
        });
      } else {
        // No site hash, proceed to next middleware
        next();
      }
    });
    
    // Return early - the callback will handle next()
    return;
  }

  // No JWT/license, but check for site hash (for free tier)
  if (siteHash) {
    // Use site hash authentication for quota tracking
    // This allows free tier sites to work without JWT/license
    return authenticateBySiteHashForQuota(req, res, next);
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
