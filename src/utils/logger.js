/**
 * Standardized Logger
 * Provides consistent logging API across the application
 * Supports structured JSON logging for log aggregation services
 */

const { getEnv } = require('../../config/loadEnv');

/**
 * Log levels
 */
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

/**
 * Get current log level from environment
 */
function getLogLevel() {
  const level = getEnv('LOG_LEVEL', 'INFO');
  return LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
}

/**
 * Check if JSON logging is enabled
 */
function useJsonFormat() {
  try {
    const { isProduction } = require('../../config/loadEnv');
    return getEnv('LOG_FORMAT') === 'json' || (typeof isProduction === 'function' ? isProduction() : process.env.NODE_ENV === 'production');
  } catch (err) {
    return getEnv('LOG_FORMAT') === 'json' || process.env.NODE_ENV === 'production';
  }
}

const currentLogLevel = getLogLevel();

/**
 * Get request context from global scope (set by middleware)
 */
function getRequestContext() {
  // Request context is stored in AsyncLocalStorage in production
  // For now, we'll use a simple approach with thread-local storage simulation
  // In a real app, you'd use AsyncLocalStorage or cls-hooked
  return {};
}

/**
 * Format log message as structured JSON
 */
function formatJsonMessage(level, message, meta = {}, context = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...context,
    ...meta,
  };

  // Remove undefined values
  Object.keys(logEntry).forEach((key) => {
    if (logEntry[key] === undefined) {
      delete logEntry[key];
    }
  });

  return JSON.stringify(logEntry);
}

/**
 * Format log message with metadata (human-readable)
 */
function formatMessage(level, message, meta = {}, context = {}) {
  const timestamp = new Date().toISOString();
  const contextStr = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}]${contextStr} ${message}${metaStr}`;
}

/**
 * Core logging function
 */
function log(level, message, meta = {}) {
  const context = getRequestContext();
  
  if (useJsonFormat()) {
    const jsonMessage = formatJsonMessage(level, message, meta, context);
    if (level === 'ERROR') {
      console.error(jsonMessage);
    } else if (level === 'WARN') {
      console.warn(jsonMessage);
    } else {
      console.log(jsonMessage);
    }
  } else {
    const formattedMessage = formatMessage(level, message, meta, context);
    if (level === 'ERROR') {
      console.error(formattedMessage);
    } else if (level === 'WARN') {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
  }
}

/**
 * Error logger
 */
function error(message, meta = {}) {
  if (currentLogLevel >= LOG_LEVELS.ERROR) {
    log('ERROR', message, meta);
  }
}

/**
 * Warning logger
 */
function warn(message, meta = {}) {
  if (currentLogLevel >= LOG_LEVELS.WARN) {
    log('WARN', message, meta);
  }
}

/**
 * Info logger
 */
function info(message, meta = {}) {
  if (currentLogLevel >= LOG_LEVELS.INFO) {
    log('INFO', message, meta);
  }
}

/**
 * Debug logger
 */
function debug(message, meta = {}) {
  if (currentLogLevel >= LOG_LEVELS.DEBUG) {
    log('DEBUG', message, meta);
  }
}

/**
 * Create a child logger with persistent context
 * Useful for request-scoped logging
 */
function child(defaultContext = {}) {
  return {
    error: (message, meta = {}) => error(message, { ...defaultContext, ...meta }),
    warn: (message, meta = {}) => warn(message, { ...defaultContext, ...meta }),
    info: (message, meta = {}) => info(message, { ...defaultContext, ...meta }),
    debug: (message, meta = {}) => debug(message, { ...defaultContext, ...meta }),
  };
}

module.exports = {
  error,
  warn,
  info,
  debug,
  child,
};

