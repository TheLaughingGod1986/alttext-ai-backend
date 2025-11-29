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

    if (!email) {
      // No email in token - authentication required
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

