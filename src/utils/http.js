/**
 * HTTP Response Utilities
 * Standardized error and success response helpers
 */

/**
 * Standard error response format
 * @typedef {Object} ErrorResponse
 * @property {boolean} ok - Always false for errors
 * @property {string} code - Machine-readable error code
 * @property {string} reason - Error category (e.g., 'validation_failed', 'authentication_required')
 * @property {string} message - Human-readable error message
 * @property {Object} [details] - Optional additional error details
 */

/**
 * Standard success response format
 * @typedef {Object} SuccessResponse
 * @property {boolean} ok - Always true for success
 * @property {*} [data] - Response data
 * @property {string} [message] - Optional success message
 */

/**
 * Send a standardized error response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} code - Machine-readable error code
 * @param {string} reason - Error category
 * @param {string} message - Human-readable error message
 * @param {Object} [details] - Optional additional error details
 */
function sendError(res, statusCode, code, reason, message, details = null) {
  const response = {
    ok: false,
    code,
    reason,
    message
  };

  if (details) {
    response.details = details;
  }

  return res.status(statusCode).json(response);
}

/**
 * Send a standardized success response
 * @param {Object} res - Express response object
 * @param {*} [data] - Response data
 * @param {string} [message] - Optional success message
 * @param {number} [statusCode=200] - HTTP status code
 */
function sendSuccess(res, data = null, message = null, statusCode = 200) {
  const response = {
    ok: true
  };

  if (data !== null) {
    response.data = data;
  }

  if (message) {
    response.message = message;
  }

  return res.status(statusCode).json(response);
}

/**
 * Common error response helpers
 */
const errors = {
  // 400 Bad Request
  validationFailed: (res, message = 'Validation failed', details = null) => {
    return sendError(res, 400, 'VALIDATION_ERROR', 'validation_failed', message, details);
  },

  missingField: (res, fieldName, code = null) => {
    const errorCode = code || 'MISSING_FIELD';
    return sendError(res, 400, errorCode, 'validation_failed', `${fieldName} is required`);
  },

  invalidInput: (res, message = 'Invalid input provided', details = null) => {
    // Extract code from details if provided, otherwise use default
    const code = (details && typeof details === 'object' && details.code) ? details.code : 'INVALID_INPUT';
    // Remove code from details if it exists (to avoid duplication)
    const cleanDetails = (details && typeof details === 'object' && details.code) 
      ? Object.fromEntries(Object.entries(details).filter(([key]) => key !== 'code'))
      : details;
    return sendError(res, 400, code, 'validation_failed', message, cleanDetails);
  },

  // 401 Unauthorized
  authenticationRequired: (res, message = 'Authentication required') => {
    return sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'authentication_required', message);
  },

  invalidToken: (res, message = 'Invalid or expired token') => {
    return sendError(res, 401, 'INVALID_TOKEN', 'authentication_required', message);
  },

  // 403 Forbidden
  forbidden: (res, message = 'Access forbidden', code = 'FORBIDDEN') => {
    return sendError(res, 403, code, 'authorization_failed', message);
  },

  noAccess: (res, message = 'No active subscription found. Please subscribe to continue.') => {
    return sendError(res, 403, 'NO_ACCESS', 'authorization_failed', message);
  },

  quotaExceeded: (res, message = 'Quota limit reached') => {
    return sendError(res, 403, 'QUOTA_EXCEEDED', 'quota_exceeded', message);
  },

  // 404 Not Found
  notFound: (res, resource = 'Resource', details = null) => {
    // Extract code from details if provided, otherwise use default
    const code = (details && typeof details === 'object' && details.code) ? details.code : 'NOT_FOUND';
    // Remove code from details if it exists (to avoid duplication)
    const cleanDetails = (details && typeof details === 'object' && details.code) 
      ? Object.fromEntries(Object.entries(details).filter(([key]) => key !== 'code'))
      : details;
    const message = (details && typeof details === 'object' && details.message) ? details.message : `${resource} not found`;
    return sendError(res, 404, code, 'resource_not_found', message, cleanDetails);
  },

  // 409 Conflict
  conflict: (res, message = 'Resource conflict', code = 'CONFLICT') => {
    return sendError(res, 409, code, 'resource_conflict', message);
  },

  // 429 Too Many Requests
  rateLimitExceeded: (res, message = 'Too many requests, please try again later', details = null) => {
    // Extract code from details if provided, otherwise use default
    const code = (details && typeof details === 'object' && details.code) ? details.code : 'RATE_LIMIT_EXCEEDED';
    // Remove code from details if it exists (to avoid duplication)
    const cleanDetails = (details && typeof details === 'object' && details.code) 
      ? Object.fromEntries(Object.entries(details).filter(([key]) => key !== 'code'))
      : details;
    return sendError(res, 429, code, 'rate_limit_exceeded', message, cleanDetails);
  },

  // 500 Internal Server Error
  internalError: (res, message = 'Internal server error', details = null) => {
    // Extract code from details if provided, otherwise use default
    const code = (details && typeof details === 'object' && details.code) ? details.code : 'INTERNAL_ERROR';
    // Remove code from details if it exists (to avoid duplication)
    const cleanDetails = (details && typeof details === 'object' && details.code) 
      ? Object.fromEntries(Object.entries(details).filter(([key]) => key !== 'code'))
      : details;
    return sendError(res, 500, code, 'server_error', message, cleanDetails);
  },

  // 502 Bad Gateway
  badGateway: (res, message = 'Bad gateway') => {
    return sendError(res, 502, 'BAD_GATEWAY', 'gateway_error', message);
  },

  // 503 Service Unavailable
  serviceUnavailable: (res, message = 'Service temporarily unavailable') => {
    return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'service_unavailable', message);
  },

  // 504 Gateway Timeout
  gatewayTimeout: (res, message = 'Gateway timeout', details = null) => {
    // Extract code from details if provided, otherwise use default
    const code = (details && typeof details === 'object' && details.code) ? details.code : 'GATEWAY_TIMEOUT';
    // Remove code from details if it exists (to avoid duplication)
    const cleanDetails = (details && typeof details === 'object' && details.code) 
      ? Object.fromEntries(Object.entries(details).filter(([key]) => key !== 'code'))
      : details;
    return sendError(res, 504, code, 'gateway_timeout', message, cleanDetails);
  },

  // Database Schema Errors
  databaseSchemaError: (res, message = 'Database schema error', details = null) => {
    return sendError(res, 500, 'DATABASE_SCHEMA_ERROR', 'database_error', message, details);
  }
};

module.exports = {
  sendError,
  sendSuccess,
  errors
};
