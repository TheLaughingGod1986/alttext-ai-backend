/**
 * Request ID Middleware
 * Generates unique request ID per request and attaches to response headers
 * Request ID is included in all logs for tracing
 */

const { randomBytes } = require('crypto');

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return randomBytes(16).toString('hex');
}

/**
 * Request ID middleware
 * Generates unique ID, attaches to request/response, and includes in logs
 */
function requestIdMiddleware(req, res, next) {
  // Generate or use existing request ID
  const requestId = req.headers['x-request-id'] || generateRequestId();
  
  // Attach to request
  req.requestId = requestId;
  
  // Attach to response header
  res.setHeader('X-Request-ID', requestId);
  
  // Make request ID available to logger via request context
  // In a production app, you'd use AsyncLocalStorage for this
  req.logContext = {
    requestId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    identityId: req.user?.identityId,
  };
  
  next();
}

module.exports = {
  requestIdMiddleware,
  generateRequestId,
};

