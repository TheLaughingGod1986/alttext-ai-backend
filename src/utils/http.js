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
    message: typeof error === 'string' ? error : error.message || 'An error occurred',
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
    message: typeof error === 'string' ? error : error.message || 'Validation failed',
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
    message: `${resource} not found`,
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
    message,
    code: 'AUTH_REQUIRED'
  });
}

/**
 * Build standardized error body
 */
function buildErrorBody(message, code, details = {}) {
  return {
    success: false,
    error: message,
    message,
    code,
    ...details,
  };
}

/**
 * Comprehensive error helpers used across the app
 */
const errors = {
  authenticationRequired(res, message = 'Authentication required', details = {}) {
    return res.status(401).json(buildErrorBody(message, details.code || 'AUTH_REQUIRED', details));
  },
  forbidden(res, message = 'Forbidden', details = {}) {
    return res.status(403).json(buildErrorBody(message, details.code || 'FORBIDDEN', details));
  },
  missingField(res, field = 'field', details = {}) {
    return res.status(400).json(buildErrorBody(typeof field === 'string' ? `${field} is required` : 'Missing field', details.code || 'MISSING_FIELD', details));
  },
  validationFailed(res, message = 'Validation failed', details = {}) {
    return res.status(400).json(buildErrorBody(message, details.code || 'VALIDATION_ERROR', { details }));
  },
  notFound(res, message = 'Not found', details = {}) {
    return res.status(404).json(buildErrorBody(message, details.code || 'NOT_FOUND', details));
  },
  rateLimitExceeded(res, message = 'Too many requests', details = {}) {
    return res.status(429).json(buildErrorBody(message, details.code || 'RATE_LIMIT_EXCEEDED', details));
  },
  gatewayTimeout(res, message = 'Gateway timeout', details = {}) {
    return res.status(504).json(buildErrorBody(message, details.code || 'TIMEOUT', details));
  },
  internalError(res, message = 'Internal server error', details = {}) {
    return res.status(500).json(buildErrorBody(message, details.code || 'INTERNAL_ERROR', details));
  }
};

module.exports = {
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized,
  errors,
  // direct exports for backward compatibility
  authenticationRequired: errors.authenticationRequired,
  forbidden: errors.forbidden,
  missingField: errors.missingField,
  validationFailed: errors.validationFailed,
  notFound: errors.notFound,
  rateLimitExceeded: errors.rateLimitExceeded,
  gatewayTimeout: errors.gatewayTimeout,
  internalError: errors.internalError,
  buildErrorBody,
};

