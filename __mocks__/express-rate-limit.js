/**
 * Manual mock for express-rate-limit
 * This file is automatically used by Jest when express-rate-limit is required
 *
 * CRITICAL: This mock must ALWAYS return a valid NO-OP middleware function
 * to prevent "Router.use() requires a middleware function but got a undefined" errors
 * AND to prevent actual rate limiting from occurring during tests (causing 429 errors)
 *
 * IMPORTANT: This mock is used when routes directly require('express-rate-limit')
 * It must return a factory function that returns a no-op middleware
 */

// Create the mock factory function that ALWAYS returns a valid, NO-OP middleware instance
function mockRateLimiter(options = {}) {
  // Log to verify mock is being used
  console.log('[MOCK] express-rate-limit mock is being used! Options:', Object.keys(options || {}));

  // Return a NEW middleware function instance every time
  // This prevents issues with Express rejecting reused middleware
  // CRITICAL: This middleware does NOTHING - no rate limiting at all
  const middleware = (req, res, next) => {
    // ALWAYS skip rate limiting in tests - just call next()
    if (typeof next === 'function') {
      next();
    }
  };

  // Add properties that express-rate-limit middleware might have
  // These are no-ops as well
  middleware.resetKey = () => {};
  middleware.getKey = () => 'test-key';

  return middleware;
}

// Ensure the mock always returns a function, even if called incorrectly
mockRateLimiter.default = mockRateLimiter;
mockRateLimiter.rateLimit = mockRateLimiter;

// Export as both default and named export to handle all import styles
module.exports = mockRateLimiter;
module.exports.default = mockRateLimiter;
module.exports.rateLimit = mockRateLimiter;
