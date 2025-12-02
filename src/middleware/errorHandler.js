/**
 * Global Error Handler Middleware
 * Catches all unhandled errors and returns standardized error responses
 * Hides stack traces in production for security
 */

const errorCodes = require('../constants/errorCodes');
const logger = require('../utils/logger');
const { detectSchemaError } = require('../../db/supabase-client');

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
    'DATABASE_SCHEMA_ERROR': 'database_error',
  };
  return reasonMap[code] || 'unknown_error';
}

/**
 * Error handler middleware
 * Should be registered last, after all routes
 */
function errorHandler(err, req, res, next) {
  // Check if this is a database schema error
  const schemaError = err.isSchemaError ? err.schemaErrorDetails : detectSchemaError(err.originalError || err);

  // Log full error details server-side
  if (schemaError) {
    logger.error('[ErrorHandler] Database schema error:', {
      type: schemaError.type,
      resource: schemaError.resource,
      code: schemaError.code,
      hint: schemaError.hint,
      originalMessage: schemaError.originalMessage,
      url: req.url,
      method: req.method,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
  } else {
    logger.error('[ErrorHandler] Unhandled error:', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
      timestamp: new Date().toISOString(),
    });
  }

  // Determine status code
  let statusCode = err.statusCode || err.status || 500;

  // Determine error message
  let errorMessage = 'Internal server error';
  let errorCode = 'INTERNAL_ERROR';
  let errorDetails = null;

  // Handle database schema errors
  if (schemaError) {
    statusCode = 500;
    errorCode = 'DATABASE_SCHEMA_ERROR';
    
    // Create user-friendly error message
    if (schemaError.type === 'missing_table') {
      errorMessage = schemaError.resource
        ? `Database table "${schemaError.resource}" does not exist. Please run database migrations.`
        : 'Database table does not exist. Please run database migrations.';
    } else if (schemaError.type === 'missing_column') {
      errorMessage = schemaError.resource
        ? `Database column "${schemaError.resource}" does not exist. Please run database migrations.`
        : 'Database column does not exist. Please run database migrations.';
    } else if (schemaError.type === 'permission_denied') {
      errorMessage = schemaError.resource
        ? `Permission denied for table "${schemaError.resource}". Please check database permissions.`
        : 'Database permission denied. Please check database permissions.';
    } else if (schemaError.type === 'syntax_error') {
      errorMessage = 'Database query syntax error. Please check the query.';
    } else {
      errorMessage = 'Database schema error. Please run database migrations.';
    }

    // Include helpful details
    errorDetails = {
      type: schemaError.type,
      resource: schemaError.resource,
      hint: schemaError.hint,
      code: schemaError.code
    };
  }
  // Handle specific error types
  else if (err.name === 'ValidationError') {
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

  // Include schema error details if available
  if (errorDetails) {
    errorResponse.details = errorDetails;
  }

  // Include stack trace in development only
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
    if (!errorDetails) {
      errorResponse.details = {
        url: req.url,
        method: req.method,
        statusCode,
      };
    } else {
      errorResponse.details = {
        ...errorResponse.details,
        url: req.url,
        method: req.method,
        statusCode,
      };
    }
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

