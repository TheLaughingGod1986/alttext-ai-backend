/**
 * Centralized Environment Loading
 * Loads environment variables from .env files based on NODE_ENV
 */

require('dotenv').config();

/**
 * Get environment variable with optional default
 */
function getEnv(key, defaultValue = null) {
  return process.env[key] || defaultValue;
}

/**
 * Require environment variable (throws if missing)
 */
function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Check if running in production
 */
function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
function isDevelopment() {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}

/**
 * Check if running in test
 */
function isTest() {
  return process.env.NODE_ENV === 'test';
}

module.exports = {
  getEnv,
  requireEnv,
  isProduction,
  isDevelopment,
  isTest
};

