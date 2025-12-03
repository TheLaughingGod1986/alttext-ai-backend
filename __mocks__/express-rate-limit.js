/**
 * Manual mock for express-rate-limit
 * This file is automatically used by Jest when express-rate-limit is required
 *
 * CRITICAL: This mock must ALWAYS return a valid middleware function
 * to prevent "Router.use() requires a middleware function but got a undefined" errors
 */

// Create the mock function that ALWAYS returns a valid, NEW middleware instance
function mockRateLimiter(options) {
  // Return a NEW middleware function instance every time
  // This prevents issues with Express rejecting reused middleware
  const middleware = (req, res, next) => {
    // Always call next() to continue the request
    if (typeof next === 'function') {
      next();
    }
  };

  // Add properties that express-rate-limit middleware might have
  middleware.resetKey = () => {};

  return middleware;
}

// Ensure the mock always returns a function, even if called incorrectly
mockRateLimiter.default = mockRateLimiter;
mockRateLimiter.rateLimit = mockRateLimiter;

// Export as both default and named export to handle all import styles
module.exports = mockRateLimiter;
module.exports.default = mockRateLimiter;
module.exports.rateLimit = mockRateLimiter;
