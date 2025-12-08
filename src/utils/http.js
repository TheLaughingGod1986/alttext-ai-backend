/**
 * HTTP Response Utilities
 * Standardized response formatting for API routes
 */

/**
 * Send success response
 */
function sendSuccess(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    ...data
  });
}

/**
 * Send error response
 */
function sendError(res, error, code = 'ERROR', statusCode = 500) {
  return res.status(statusCode).json({
    success: false,
    error: typeof error === 'string' ? error : error.message || 'An error occurred',
    code
  });
}

/**
 * Send validation error response
 */
function sendValidationError(res, error, field = null) {
  return res.status(400).json({
    success: false,
    error: typeof error === 'string' ? error : error.message || 'Validation failed',
    code: 'VALIDATION_ERROR',
    field
  });
}

/**
 * Send not found error response
 */
function sendNotFound(res, resource = 'Resource') {
  return res.status(404).json({
    success: false,
    error: `${resource} not found`,
    code: 'NOT_FOUND'
  });
}

/**
 * Send unauthorized error response
 */
function sendUnauthorized(res, message = 'Authentication required') {
  return res.status(401).json({
    success: false,
    error: message,
    code: 'AUTH_REQUIRED'
  });
}

module.exports = {
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized
};

