/**
 * Rate Limiter Middleware Factory
 * Creates reusable rate limit middleware with different configurations
 */

const rateLimit = require('express-rate-limit');

/**
 * Create a rate limiter with custom configuration
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum number of requests per window
 * @param {string} options.message - Error message
 * @param {Function} options.keyGenerator - Custom key generator function
 * @returns {Function} Express middleware
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // 100 requests default
    message = 'Too many requests, please try again later.',
    keyGenerator = (req) => req.ip, // Default: limit by IP
    ...restOptions
  } = options;

  return rateLimit({
    windowMs,
    max,
    message,
    keyGenerator,
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    ...restOptions,
  });
}

/**
 * Rate limiter by IP address
 */
function rateLimitByIp(windowMs = 15 * 60 * 1000, max = 100, message) {
  return createRateLimiter({
    windowMs,
    max,
    message: message || `Too many requests from this IP. Limit: ${max} requests per ${windowMs / 1000 / 60} minutes.`,
  });
}

/**
 * Rate limiter by user ID (requires authentication)
 */
function rateLimitByUser(windowMs = 15 * 60 * 1000, max = 100, message) {
  return createRateLimiter({
    windowMs,
    max,
    message: message || `Too many requests. Limit: ${max} requests per ${windowMs / 1000 / 60} minutes.`,
    keyGenerator: (req) => {
      // Use user ID if authenticated, fall back to IP
      return req.user?.id || req.user?.identityId || req.ip;
    },
    skip: (req) => {
      // Skip if not authenticated (let IP limiter handle it)
      return !req.user;
    },
  });
}

/**
 * Rate limiter by identity ID (requires authentication)
 */
function rateLimitByIdentity(windowMs = 15 * 60 * 1000, max = 100, message) {
  return createRateLimiter({
    windowMs,
    max,
    message: message || `Too many requests. Limit: ${max} requests per ${windowMs / 1000 / 60} minutes.`,
    keyGenerator: (req) => {
      return req.user?.identityId || req.user?.id || req.ip;
    },
    skip: (req) => {
      return !req.user;
    },
  });
}

/**
 * Strict rate limiter for sensitive endpoints (e.g., billing)
 */
function strictRateLimit(max = 10, windowMs = 15 * 60 * 1000) {
  return createRateLimiter({
    windowMs,
    max,
    message: 'Too many requests. Please try again later.',
  });
}

module.exports = {
  createRateLimiter,
  rateLimitByIp,
  rateLimitByUser,
  rateLimitByIdentity,
  strictRateLimit,
};

