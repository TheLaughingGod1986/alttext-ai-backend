/**
 * Require Subscription Middleware
 * Enforces subscription-based access control for AI generation endpoints
 * Returns standardized NO_ACCESS errors when access is denied
 */

const { evaluateAccess } = require('../services/accessControlService');
const errorCodes = require('../constants/errorCodes');

/**
 * Middleware to require active subscription or credits for AI actions
 * Must be used after authenticateToken middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function requireSubscription(req, res, next) {
  try {
    // Extract email from authenticated request
    const email = req.user?.email;

    // PRIORITY: Check for site-based authentication FIRST (even if email exists)
    // Site-based quota takes precedence for free tier users
    // This allows free tier sites to work even when user has JWT token but no subscription
    if (req.site && req.siteUsage) {
      // Site-based access - check if site has quota available
      const remaining = req.siteUsage.remaining || 0;
      const limit = req.siteUsage.limit || 0;
      
      // Debug logging
      console.log('[RequireSubscription] Site-based auth:', {
        siteHash: req.site?.site_hash,
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

    // Debug logging for missing site info
    if (!req.site || !req.siteUsage) {
      const siteHash = req.headers?.['x-site-hash'] || req.body?.siteHash;
      console.log('[RequireSubscription] Missing site info:', {
        hasSite: !!req.site,
        hasSiteUsage: !!req.siteUsage,
        siteHash,
        authMethod: req.authMethod,
        hasEmail: !!email
      });
    }

    if (!email) {
      // No email in token and no site-based auth - authentication required
      return res.status(401).json({
        ok: false,
        code: errorCodes.NO_ACCESS,
        reason: errorCodes.REASONS.NO_IDENTITY,
        message: 'Authentication required.',
      });
    }

    // Evaluate access for this user
    const result = await evaluateAccess(email, req.path);

    if (result.allowed) {
      // Access granted - proceed to next middleware/handler
      return next();
    }

    // Access denied - return standardized error
    return res.status(403).json({
      ok: false,
      code: result.code || errorCodes.NO_ACCESS,
      reason: result.reason,
      message: result.message,
    });
  } catch (error) {
    console.error('[RequireSubscription] Unexpected error:', error);
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

