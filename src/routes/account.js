/**
 * Account Routes
 * API endpoints for user account data aggregation
 * Used by dashboard to display installations, plugins, and sites
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { accountEmailSchema } = require('../validation/accountSchemas');
const { getUserInstallations, getFullAccount } = require('../services/userAccountService');
const { getAccountSummary } = require('../services/accountService');
const logger = require('../utils/logger');
const { isTest } = require('../../config/loadEnv');
const { errors: httpErrors } = require('../utils/http');

const router = express.Router();

// Rate limiting for account endpoints (defensive check for test environment)
let accountRateLimiter;
if (rateLimit && typeof rateLimit === 'function') {
  try {
    accountRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 30, // Limit each IP to 30 requests per windowMs
      message: 'Too many account requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
  } catch (e) {
    // If rateLimit fails, continue without rate limiting
    accountRateLimiter = null;
  }
}

// Apply rate limiting to all account routes (defensive check for test environment)
// Skip rate limiting entirely in test environment to avoid middleware issues
if (!isTest() && accountRateLimiter && typeof accountRateLimiter === 'function') {
  router.use(accountRateLimiter);
}

/**
 * POST /account/overview
 * Returns full account data: installations, plugins, sites
 * Body: { email }
 */
router.post('/overview', async (req, res) => {
  try {
    const parsed = accountEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues || [];
      const firstIssue = issues[0];
      const errorMessage = firstIssue?.message || 'Validation failed';
      return httpErrors.validationFailed(res, errorMessage, parsed.error.flatten());
    }
    
    const { email } = parsed.data;
    const result = await getFullAccount(email);
    
    if (!result.success) {
      logger.error('[Account Routes] Failed to fetch account data', {
        error: result.error,
        email
      });
      return httpErrors.internalError(res, result.error || 'Failed to fetch account data');
    }
    
    return res.status(200).json({
      ok: true,
      data: result,
    });
  } catch (error) {
    logger.error('[Account Routes] Overview error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, error.message || 'Internal server error');
  }
});

/**
 * POST /account/summary
 * Returns unified account summary: installations, subscriptions, usage, plans
 * Body: { email }
 */
router.post('/summary', async (req, res) => {
  try {
    const parsed = accountEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues || [];
      const firstIssue = issues[0];
      const errorMessage = firstIssue?.message || 'Validation failed';
      return httpErrors.validationFailed(res, errorMessage, parsed.error.flatten());
    }
    
    const { email } = parsed.data;
    const result = await getAccountSummary(email);
    
    if (!result.ok) {
      logger.error('[Account Routes] Failed to fetch account summary', {
        error: result.error,
        email
      });
      return httpErrors.internalError(res, result.error || 'Failed to fetch account summary');
    }
    
    return res.status(200).json(result);
  } catch (error) {
    logger.error('[Account Routes] Summary error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, error.message || 'Internal server error');
  }
});

/**
 * POST /account/installations
 * Returns all installations for a user
 * Body: { email }
 */
router.post('/installations', async (req, res) => {
  try {
    const parsed = accountEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues || [];
      const firstIssue = issues[0];
      const errorMessage = firstIssue?.message || 'Validation failed';
      return httpErrors.validationFailed(res, errorMessage, parsed.error.flatten());
    }
    
    const { email } = parsed.data;
    const result = await getUserInstallations(email);
    
    if (!result.success) {
      logger.error('[Account Routes] Failed to fetch installations', {
        error: result.error,
        email
      });
      return httpErrors.internalError(res, result.error || 'Failed to fetch installations');
    }
    
    return res.status(200).json({
      ok: true,
      installations: result.installations,
    });
  } catch (error) {
    logger.error('[Account Routes] Installations error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, error.message || 'Internal server error');
  }
});

module.exports = router;

