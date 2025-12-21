/**
 * Application-wide constants
 * Single source of truth for plan limits and other shared values
 */

const PLAN_LIMITS = {
  free: {
    credits: 50,
    maxSites: 1,
    rateLimit: 60 // requests per minute
  },
  pro: {
    credits: 1000,
    maxSites: 1,
    rateLimit: 120
  },
  agency: {
    credits: 10000,
    maxSites: null, // null = unlimited
    rateLimit: 240
  }
};

// Rate limits for authentication endpoints (per IP)
const AUTH_RATE_LIMITS = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 5 // 5 attempts per 15 minutes
};

// Cache TTL values
const CACHE_TTL = {
  ALT_TEXT_RESULT: 60 * 60 * 24 * 7, // 7 days in seconds
  RATE_LIMIT_WINDOW: 60_000, // 1 minute in milliseconds
  DASHBOARD_SESSION: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
};

// Magic numbers
const OPENAI_MAX_TOKENS = 50;
const OPENAI_REQUEST_TIMEOUT = 60000; // 60 seconds

// Quota warning threshold
const QUOTA_WARNING_THRESHOLD = 0.9; // 90%

module.exports = {
  PLAN_LIMITS,
  AUTH_RATE_LIMITS,
  CACHE_TTL,
  OPENAI_MAX_TOKENS,
  OPENAI_REQUEST_TIMEOUT,
  QUOTA_WARNING_THRESHOLD
};
