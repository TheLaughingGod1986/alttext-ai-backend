/**
 * Standardized Logger
 * Provides consistent logging API across the application
 */

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
  const level = process.env.LOG_LEVEL || 'INFO';
  return LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
}

const currentLogLevel = getLogLevel();

/**
 * Format log message with metadata
 */
function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

/**
 * Error logger
 */
function error(message, meta = {}) {
  if (currentLogLevel >= LOG_LEVELS.ERROR) {
    console.error(formatMessage('ERROR', message, meta));
  }
}

/**
 * Warning logger
 */
function warn(message, meta = {}) {
  if (currentLogLevel >= LOG_LEVELS.WARN) {
    console.warn(formatMessage('WARN', message, meta));
  }
}

/**
 * Info logger
 */
function info(message, meta = {}) {
  if (currentLogLevel >= LOG_LEVELS.INFO) {
    console.log(formatMessage('INFO', message, meta));
  }
}

/**
 * Debug logger
 */
function debug(message, meta = {}) {
  if (currentLogLevel >= LOG_LEVELS.DEBUG) {
    console.log(formatMessage('DEBUG', message, meta));
  }
}

module.exports = {
  error,
  warn,
  info,
  debug
};

