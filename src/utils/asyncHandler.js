/**
 * Async Handler Utility
 * Wraps async route handlers to automatically catch errors and pass them to error handler middleware
 * 
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => {
 *     // Your async code here
 *     // Errors will be automatically caught and passed to error handler
 *   }));
 */

/**
 * Wrap an async route handler to automatically catch errors
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;

