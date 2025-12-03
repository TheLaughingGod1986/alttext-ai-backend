/**
 * Email Routes
 * Public email API endpoints for plugins and website
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { authenticateToken } = require('../../auth/jwt');
const emailService = require('../services/emailService');
const { validateEmail } = require('../validation/validators');
const { errors: httpErrors } = require('../utils/http');
const { isTest } = require('../../config/loadEnv');

const router = express.Router();

// Rate limiting for email endpoints (defensive check for test environment)
let emailRateLimiter;
if (rateLimit && typeof rateLimit === 'function') {
  try {
    emailRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // Limit each IP to 10 email requests per windowMs
      message: 'Too many email requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
  } catch (e) {
    // If rateLimit fails, continue without rate limiting
    emailRateLimiter = null;
  }
}

// Apply rate limiting to all email routes (defensive check for test environment)
// Skip rate limiting entirely in test environment to avoid middleware issues
if (!isTest() && emailRateLimiter && typeof emailRateLimiter === 'function') {
  router.use(emailRateLimiter);
}

/**
 * POST /email/waitlist
 * Body: { email, plugin, source }
 */
router.post('/waitlist', async (req, res) => {
  try {
    const { email, plugin, source } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return httpErrors.missingField(res, 'email');
    }

    if (!validateEmail(email)) {
      return httpErrors.invalidInput(res, 'Invalid email format');
    }

    // Send waitlist welcome email
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
    logger.error('[Email Routes] Waitlist email error', { error: error.message });
    res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * POST /email/dashboard-welcome
 * Body: { email }
 */
router.post('/dashboard-welcome', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return httpErrors.missingField(res, 'email');
    }

    if (!validateEmail(email)) {
      return httpErrors.invalidInput(res, 'Invalid email format');
    }

    // Send dashboard welcome email
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
    logger.error('[Email Routes] Dashboard welcome email error', { error: error.message });
    res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * Zod schema for plugin signup email validation
 * Supports both 'plugin'/'pluginName' and 'site'/'siteUrl' for backward compatibility
 * Includes optional metadata fields for installation tracking
 */
const pluginSignupEmailSchema = z.object({
  email: z.string().email('Invalid email format'),
  plugin: z.string().min(1, 'Plugin name is required').optional(),
  pluginName: z.string().min(1, 'Plugin name is required').optional(),
  site: z.string().url('Invalid site URL format').optional().or(z.literal('')),
  siteUrl: z.string().url('Invalid site URL format').optional().or(z.literal('')),
  // Metadata fields for installation tracking
  version: z.string().optional(),
  wpVersion: z.string().optional(),
  phpVersion: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  installSource: z.string().optional(),
}).refine(
  (data) => data.plugin || data.pluginName,
  { message: 'Plugin name is required (use "plugin" or "pluginName")' }
);

/**
 * POST /email/plugin-signup
 * Body: { email, plugin/pluginName, site/siteUrl? }
 */
router.post('/plugin-signup', async (req, res) => {
  try {
    // Validate input with Zod
    const validationResult = pluginSignupEmailSchema.safeParse(req.body);

    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstIssue = issues[0];
      const errorMessage = firstIssue?.message || 'Validation failed';
      return res.status(400).json({
        ok: false,
        error: errorMessage,
      });
    }

    const { email, plugin, pluginName, site, siteUrl, version, wpVersion, phpVersion, language, timezone, installSource } = validationResult.data;
    
    // Normalize plugin name (support both 'plugin' and 'pluginName')
    const normalizedPluginName = pluginName || plugin;
    
    // Normalize site URL (support both 'site' and 'siteUrl')
    const normalizedSiteUrl = siteUrl || site || undefined;

    // Send plugin signup email with metadata
    const result = await emailService.sendPluginSignup({
      email,
      pluginName: normalizedPluginName,
      siteUrl: normalizedSiteUrl,
      meta: {
        version,
        wpVersion,
        phpVersion,
        language,
        timezone,
        installSource,
      },
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
    logger.error('[Email Routes] Plugin signup email error', { error: error.message });
    res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * POST /email/license-activated
 * Body: { email, planName, siteUrl }
 */
router.post('/license-activated', authenticateToken, async (req, res) => {
  try {
    const { email, planName, siteUrl } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return httpErrors.missingField(res, 'email');
    }

    if (!validateEmail(email)) {
      return httpErrors.invalidInput(res, 'Invalid email format');
    }

    if (!planName || typeof planName !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Plan name is required',
      });
    }

    // Send license activated email
    const result = await emailService.sendLicenseActivated({
      email,
      planName,
      siteUrl,
    });

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to send email',
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('[Email Routes] License activated email error', { error: error.message });
    res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * POST /email/low-credit-warning
 * Body: { email, siteUrl, remainingCredits, pluginName }
 */
router.post('/low-credit-warning', async (req, res) => {
  try {
    const { email, siteUrl, remainingCredits, pluginName } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return httpErrors.missingField(res, 'email');
    }

    if (!validateEmail(email)) {
      return httpErrors.invalidInput(res, 'Invalid email format');
    }

    if (remainingCredits === undefined || typeof remainingCredits !== 'number') {
      return res.status(400).json({
        ok: false,
        error: 'Remaining credits is required and must be a number',
      });
    }

    // Send low credit warning email
    const result = await emailService.sendLowCreditWarning({
      email,
      siteUrl,
      remainingCredits,
      pluginName,
    });

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to send email',
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('[Email Routes] Low credit warning error', { error: error.message });
    res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * Zod schema for receipt email validation
 */
const receiptEmailSchema = z.object({
  email: z.string().email('Invalid email format'),
  amount: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? val : parsed;
      }
      return val;
    },
    z.number().positive('Amount must be a positive number')
  ),
  planName: z.string().min(1, 'Plan name is required'),
  invoiceUrl: z.string().optional(),
  pluginName: z.string().optional(),
});

/**
 * POST /email/receipt
 * Body: { email, amount, planName, invoiceUrl?, pluginName? }
 */
router.post('/receipt', authenticateToken, async (req, res) => {
  try {
    // Validate input with Zod
    const validationResult = receiptEmailSchema.safeParse(req.body);

    if (!validationResult.success) {
      // Zod uses 'issues' property for errors
      const issues = validationResult.error.issues || [];
      const firstIssue = issues[0];
      const errorMessage = firstIssue?.message || 'Validation failed';
      return res.status(400).json({
        ok: false,
        error: errorMessage,
      });
    }

    const { email, amount, planName, invoiceUrl, pluginName } = validationResult.data;

    // Send receipt email
    const result = await emailService.sendReceipt({
      email,
      amount,
      planName,
      invoiceUrl,
    });

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to send email',
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('[Email Routes] Receipt email error', { error: error.message });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
});

module.exports = router;
