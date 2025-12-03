/**
 * Manual mock for express-rate-limit
 * This file is automatically used by Jest when express-rate-limit is required
 */

// Return a function that always returns a valid middleware function
const mockMiddleware = (req, res, next) => {
  // Always call next() to continue the request
  if (typeof next === 'function') {
    next();
  }
};

// Create the mock function that always returns a valid middleware
function mockRateLimiter(options) {
  // Always return a valid middleware function, no matter what
  return mockMiddleware;
}

// Ensure the mock always returns a function, even if called incorrectly
mockRateLimiter.default = mockRateLimiter;

// Export as both default and named export
module.exports = mockRateLimiter;
module.exports.default = mockRateLimiter;

