/**
 * Backward Compatibility Email Routes
 * These routes wrap the new /email/* service internally to avoid breaking existing plugins
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { isTest } = require('../../config/loadEnv');

const router = express.Router();

// Rate limiting for compatibility routes (defensive check for test environment)
let compatibilityRateLimiter;
if (rateLimit && typeof rateLimit === 'function') {
  try {
    compatibilityRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // Limit each IP to 10 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
  } catch (e) {
    // If rateLimit fails, continue without rate limiting
    compatibilityRateLimiter = null;
  }
}

// Apply rate limiting to all compatibility routes (defensive check for test environment)
// Skip rate limiting entirely in test environment to avoid middleware issues
if (!isTest() && compatibilityRateLimiter && typeof compatibilityRateLimiter === 'function') {
  router.use(compatibilityRateLimiter);
}

/**
 * Zod schema for plugin register/wp-signup validation
 */
const pluginRegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  plugin: z.string().min(1, 'Plugin name is required'),
  site: z.string().url('Invalid site URL format').optional().or(z.literal('')),
  installId: z.string().optional(),
});

/**
 * POST /plugin/register
 * Backward compatibility route for plugin registration
 * Maps to: emailService.sendPluginSignup
 */
router.post('/plugin/register', async (req, res) => {
  try {
    // Validate input with Zod
    const validationResult = pluginRegisterSchema.safeParse(req.body);

    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstIssue = issues[0];
      const errorMessage = firstIssue?.message || 'Validation failed';
      return res.status(400).json({
        ok: false,
        error: errorMessage,
      });
    }

    const { email, plugin, site, installId } = validationResult.data;

    // Log request for analytics
    logger.info('[Compatibility Route] /plugin/register called', { email, plugin });

    // Map to emailService.sendPluginSignup
    const result = await emailService.sendPluginSignup({
      email,
      pluginName: plugin,
      siteUrl: site || undefined,
    });

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to send email',
      });
    }

    // Check for deduplication
    if (result.deduped) {
      return res.status(200).json({ ok: true, deduped: true });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('[Compatibility Route] /plugin/register error', {
      error: error.message,
      stack: error.stack
    });
    // Never break endpoint - return error response
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /wp-signup
 * Backward compatibility route for WordPress plugin signup (alias for /plugin/register)
 * Maps to: emailService.sendPluginSignup
 */
router.post('/wp-signup', async (req, res) => {
  try {
    // Validate input with Zod
    const validationResult = pluginRegisterSchema.safeParse(req.body);

    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstIssue = issues[0];
      const errorMessage = firstIssue?.message || 'Validation failed';
      return res.status(400).json({
        ok: false,
        error: errorMessage,
      });
    }

    const { email, plugin, site, installId } = validationResult.data;

    // Log request for analytics
    logger.info('[Compatibility Route] /wp-signup called', { email, plugin });

    // Map to emailService.sendPluginSignup
    const result = await emailService.sendPluginSignup({
      email,
      pluginName: plugin,
      siteUrl: site || undefined,
    });

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to send email',
      });
    }

    // Check for deduplication
    if (result.deduped) {
      return res.status(200).json({ ok: true, deduped: true });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('[Compatibility Route] /wp-signup error', {
      error: error.message,
      stack: error.stack
    });
    // Never break endpoint - return error response
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

/**
 * Zod schema for legacy waitlist validation
 */
const legacyWaitlistSchema = z.object({
  email: z.string().email('Invalid email format'),
  plugin: z.string().optional(),
  source: z.string().optional(),
});

/**
 * POST /legacy-waitlist
 * Backward compatibility route for waitlist signups
 * Maps to: emailService.sendWaitlistWelcome
 */
router.post('/legacy-waitlist', async (req, res) => {
  try {
    // Validate input with Zod
    const validationResult = legacyWaitlistSchema.safeParse(req.body);

    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstIssue = issues[0];
      const errorMessage = firstIssue?.message || 'Validation failed';
      return res.status(400).json({
        ok: false,
        error: errorMessage,
      });
    }

    const { email, plugin, source } = validationResult.data;

    // Log request for analytics
    logger.info('[Compatibility Route] /legacy-waitlist called', { email });

    // Map to emailService.sendWaitlistWelcome
    const result = await emailService.sendWaitlistWelcome({
      email,
      plugin,
      source,
    });

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to send email',
      });
    }

    // Check for deduplication
    if (result.deduped) {
      return res.status(200).json({ ok: true, deduped: true });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('[Compatibility Route] /legacy-waitlist error', {
      error: error.message,
      stack: error.stack
    });
    // Never break endpoint - return error response
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

/**
 * Zod schema for dashboard email validation
 */
const dashboardEmailSchema = z.object({
  email: z.string().email('Invalid email format'),
});

/**
 * POST /dashboard/email
 * Backward compatibility route for dashboard welcome emails
 * Maps to: emailService.sendDashboardWelcome
 */
router.post('/dashboard/email', async (req, res) => {
  try {
    // Validate input with Zod
    const validationResult = dashboardEmailSchema.safeParse(req.body);

    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstIssue = issues[0];
      const errorMessage = firstIssue?.message || 'Validation failed';
      return res.status(400).json({
        ok: false,
        error: errorMessage,
      });
    }

    const { email } = validationResult.data;

    // Log request for analytics
    logger.info('[Compatibility Route] /dashboard/email called', { email });

    // Map to emailService.sendDashboardWelcome
    const result = await emailService.sendDashboardWelcome({ email });

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to send email',
      });
    }

    // Check for deduplication
    if (result.deduped) {
      return res.status(200).json({ ok: true, deduped: true });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('[Compatibility Route] /dashboard/email error', {
      error: error.message,
      stack: error.stack
    });
    // Never break endpoint - return error response
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
});

module.exports = router;

