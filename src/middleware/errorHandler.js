/**
 * Global Error Handler Middleware
 * Catches all unhandled errors and returns standardized error responses
 * Hides stack traces in production for security
 */

const errorCodes = require('../constants/errorCodes');

/**
 * Map error codes to reasons
 */
function getReasonForCode(code) {
  const reasonMap = {
    'VALIDATION_ERROR': 'validation_failed',
    'UNAUTHORIZED': 'authentication_required',
    'CORS_ERROR': 'cors_violation',
    'NOT_FOUND': 'resource_not_found',
    'INTERNAL_ERROR': 'server_error',
    'NO_ACCESS': 'access_denied',
  };
  return reasonMap[code] || 'unknown_error';
}

/**
 * Error handler middleware
 * Should be registered last, after all routes
 */
function errorHandler(err, req, res, next) {
  // Log full error details server-side
  console.error('[ErrorHandler] Unhandled error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
  });

  // Determine status code
  let statusCode = err.statusCode || err.status || 500;

  // Determine error message
  let errorMessage = 'Internal server error';
  let errorCode = 'INTERNAL_ERROR';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorMessage = err.message || 'Validation failed';
    errorCode = 'VALIDATION_ERROR';
  } else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorMessage = 'Unauthorized';
    errorCode = 'UNAUTHORIZED';
  } else if (err.message && err.message.includes('Not allowed by CORS')) {
    statusCode = 403;
    errorMessage = 'CORS policy violation';
    errorCode = 'CORS_ERROR';
  } else if (err.message) {
    // Use error message if provided (but sanitize in production)
    if (process.env.NODE_ENV === 'production') {
      // In production, only show generic messages for 500 errors
      if (statusCode >= 500) {
        errorMessage = 'Internal server error';
      } else {
        errorMessage = err.message;
      }
    } else {
      // In development, show full error messages
      errorMessage = err.message;
    }
  }

  // Build error response with unified format
  const errorResponse = {
    ok: false,
    code: errorCode,
    reason: getReasonForCode(errorCode),
    message: errorMessage,
  };

  // Include stack trace in development only
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
    errorResponse.details = {
      url: req.url,
      method: req.method,
      statusCode,
    };
  }

  // Include request ID if available
  if (req.requestId) {
    errorResponse.requestId = req.requestId;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * 404 handler for unknown routes
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    code: 'NOT_FOUND',
    reason: 'resource_not_found',
    message: `Route ${req.method} ${req.path} not found`,
    requestId: req.requestId || null,
  });
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors and pass to error handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};

