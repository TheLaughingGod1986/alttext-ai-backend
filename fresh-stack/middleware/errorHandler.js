/**
 * Standardized error handler.
 * Attach after routes.
 */

const logger = require('../lib/logger');

function errorHandler() {
  // eslint-disable-next-line no-unused-vars
  return function handler(err, req, res, _next) {
    const status = err.status || 500;
    const code = err.code || 'SERVER_ERROR';
    const message = err.message || 'Internal server error';
    const requestId = req.headers['x-request-id'] || req.id;

    logger.error('[error]', { code, status, message, stack: err.stack, requestId });

    return res.status(status).json({
      error: code.toLowerCase(),
      message,
      code,
      request_id: requestId || null
    });
  };
}

module.exports = errorHandler;
