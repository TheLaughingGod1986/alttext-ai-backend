/**
 * Require Subscription Middleware
 * Enforces subscription-based access control for AI generation endpoints
 * Returns standardized NO_ACCESS errors when access is denied
 * Supports multiple authentication methods: JWT, License Key, Site Hash
 */

const { evaluateAccess } = require('../services/accessControlService');
const errorCodes = require('../constants/errorCodes');
const logger = require('../utils/logger');

/**
 * Middleware to require active subscription or credits for AI actions
 * Must be used after authenticateToken middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function requireSubscription(req, res, next) {
  try {
    // Extract authentication info
    const email = req.user?.email;
    const hasLicenseKey = !!(req.organization || req.license || req.licenseKey);
    const authMethod = req.authMethod || 'unknown';

    // Log authentication state for debugging
    logger.info('[RequireSubscription] Authentication check', {
      hasEmail: !!email,
      hasLicenseKey,
      hasOrganization: !!req.organization,
      hasLicense: !!req.license,
      authMethod,
      hasSite: !!req.site,
      hasSiteUsage: !!req.siteUsage
    });

    // PRIORITY 1: Check for license key authentication
    // License keys provide direct access (they're already validated by dualAuthenticate)
    if (hasLicenseKey) {
      logger.info('[RequireSubscription] License key authentication detected', {
        organizationId: req.organization?.id,
        licenseId: req.license?.id,
        licenseKey: req.licenseKey ? `${req.licenseKey.substring(0, 8)}...` : 'none'
      });

      // If site hash is provided, check site quota
      if (req.site && req.siteUsage) {
        const remaining = req.siteUsage.remaining || 0;
        logger.info('[RequireSubscription] License key with site quota check', {
          remaining,
          limit: req.siteUsage.limit || 0
        });

        if (remaining > 0) {
          // License key + site has quota - allow access
          return next();
        }

        // License key but site has no quota - deny
        return res.status(403).json({
          ok: false,
          code: errorCodes.NO_ACCESS,
          reason: errorCodes.REASONS.NO_CREDITS,
          message: 'No credits remaining for this site. Please upgrade or wait for monthly reset.',
        });
      }

      // License key without site hash - allow access (license keys provide direct access)
      logger.info('[RequireSubscription] License key authentication - allowing access');
      return next();
    }

    // PRIORITY 2: Check for site-based authentication (for free tier)
    // Site-based quota takes precedence for free tier users
    // This allows free tier sites to work even when user has JWT token but no subscription
    if (req.site && req.siteUsage) {
      // Site-based access - check if site has quota available
      const remaining = req.siteUsage.remaining || 0;
      const limit = req.siteUsage.limit || 0;
      
      logger.info('[RequireSubscription] Site-based auth', {
        siteHash: req.site?.site_hash ? `${req.site.site_hash.substring(0, 8)}...` : 'none',
        remaining,
        limit,
        hasQuota: remaining > 0,
        hasEmail: !!email
      });
      
      // Only allow if there's remaining quota (not just if limit exists)
      if (remaining > 0) {
        // Site has quota available - allow access (even if user has no subscription)
        return next();
      }
      
      // Site has no quota - deny access
      return res.status(403).json({
        ok: false,
        code: errorCodes.NO_ACCESS,
        reason: errorCodes.REASONS.NO_CREDITS,
        message: 'No credits remaining for this site. Please upgrade or wait for monthly reset.',
      });
    }

    // PRIORITY 3: Check for JWT authentication (user email)
    if (!email) {
      // No email, no license key, no site hash - authentication required
      logger.warn('[RequireSubscription] No authentication provided', {
        hasSite: !!req.site,
        hasSiteUsage: !!req.siteUsage,
        siteHash: req.headers?.['x-site-hash'] || req.body?.siteHash || 'none',
        authMethod
      });

      return res.status(401).json({
        ok: false,
        code: errorCodes.NO_ACCESS,
        reason: errorCodes.REASONS.NO_IDENTITY,
        message: 'Authentication required. Provide JWT token, license key, or site hash.',
      });
    }

    // Evaluate access for this user (JWT authentication)
    logger.info('[RequireSubscription] Evaluating access for user', { email });
    const result = await evaluateAccess(email, req.path);

    if (result.allowed) {
      // Access granted - proceed to next middleware/handler
      logger.info('[RequireSubscription] Access granted for user', { email });
      return next();
    }

    // Access denied - return standardized error
    logger.warn('[RequireSubscription] Access denied for user', {
      email,
      reason: result.reason,
      code: result.code
    });

    return res.status(403).json({
      ok: false,
      code: result.code || errorCodes.NO_ACCESS,
      reason: result.reason,
      message: result.message,
    });
  } catch (error) {
    logger.error('[RequireSubscription] Unexpected error', {
      error: error.message,
      stack: error.stack
    });
    // On unexpected error, deny access (fail-safe)
    return res.status(500).json({
      ok: false,
      code: 'SERVER_ERROR',
      reason: 'server_error',
      message: 'Unexpected error.',
    });
  }
}

module.exports = requireSubscription;

