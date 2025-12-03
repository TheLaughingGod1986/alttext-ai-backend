/**
 * Partner API Authentication Middleware
 * Validates API key from Authorization header and checks rate limits
 * Attaches req.partnerApiKey to request on success
 */

const partnerApiService = require('../services/partnerApiService');
const logger = require('../utils/logger');

/**
 * Partner API authentication middleware
 * Expects Authorization header: "Bearer opk_live_..."
 */
async function partnerApiAuth(req, res, next) {
  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        error: 'Missing or invalid Authorization header',
        message: 'Expected: Authorization: Bearer <api_key>',
      });
    }

    const apiKey = authHeader.substring(7).trim(); // Remove "Bearer " prefix

    // Validate API key
    const validationResult = await partnerApiService.validateApiKey(apiKey);
    if (!validationResult.success) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid API key',
        message: validationResult.error,
      });
    }

    // Check rate limit
    const rateLimitResult = await partnerApiService.checkRateLimit(
      validationResult.apiKeyId,
      validationResult.rateLimitPerMinute
    );

    if (!rateLimitResult.allowed) {
      const resetAt = new Date(rateLimitResult.resetAt);
      return res.status(429).json({
        ok: false,
        error: 'Rate limit exceeded',
        message: `Too many requests. Rate limit: ${validationResult.rateLimitPerMinute} requests/minute`,
        rateLimit: {
          limit: validationResult.rateLimitPerMinute,
          remaining: 0,
          resetAt: resetAt.toISOString(),
        },
      });
    }

    // Attach API key info to request
    req.partnerApiKey = {
      id: validationResult.apiKeyId,
      identityId: validationResult.identityId,
      name: validationResult.name,
      rateLimitPerMinute: validationResult.rateLimitPerMinute,
      rateLimitRemaining: rateLimitResult.remaining,
      rateLimitResetAt: new Date(rateLimitResult.resetAt).toISOString(),
    };

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', validationResult.rateLimitPerMinute.toString());
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetAt / 1000).toString());

    next();
  } catch (error) {
    logger.error('[PartnerApiAuth] Error in middleware', {
      error: error.message,
      stack: error.stack,
      path: req.path
    });
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
      message: 'Failed to authenticate API key',
    });
  }
}

/**
 * Middleware to log API usage after request completes
 * Should be used after the main route handler
 */
function logPartnerApiUsage(req, res, next) {
  const startTime = Date.now();
  const originalJson = res.json;

  // Override res.json to log after response is sent
  res.json = function (body) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log usage asynchronously (don't block response)
    if (req.partnerApiKey) {
      partnerApiService
        .logUsage(
          req.partnerApiKey.id,
          req.path,
          statusCode,
          responseTime,
          req.ip
        )
        .catch((error) => {
          logger.error('[PartnerApiAuth] Error logging usage', {
            error: error.message,
            stack: error.stack,
            apiKeyId: req.partnerApiKey?.id
          });
        });
    }

    // Call original json method
    return originalJson.call(this, body);
  };

  next();
}

module.exports = {
  partnerApiAuth,
  logPartnerApiUsage,
};

