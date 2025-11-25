/**
 * Email Routes
 * Centralized email API endpoints for plugins and website
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('../auth/jwt');
const emailService = require('../services/emailService');
const { validateEmailRequest } = require('../src/validation/email');

const router = express.Router();

// Rate limiting for email endpoints
const emailRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 email requests per windowMs
  message: 'Too many email requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all email routes
router.use(emailRateLimiter);

/**
 * POST /email/welcome
 * Trigger welcome email
 * Body: { email, name?, plugin?, metadata? }
 * Triggered by: Website signup and Plugin free user registration
 */
router.post('/welcome', async (req, res) => {
  try {
    const { email, name, plugin, metadata } = req.body;

    // Validate request
    const validation = validateEmailRequest('welcome', { email, name, plugin, metadata });
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validation.errors
      });
    }

    // Send welcome email
    const result = await emailService.sendWelcomeEmail({
      email,
      name,
      plugin,
      metadata
    });

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to send welcome email',
        code: 'EMAIL_SEND_ERROR',
        message: result.error || result.message
      });
    }

    res.json({
      success: true,
      message: 'Welcome email sent successfully',
      email_id: result.email_id
    });
  } catch (error) {
    console.error('[Email Routes] Welcome email error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /email/license/activated
 * License activation email
 * Body: { email, name?, licenseKey, plan, tokenLimit, tokensRemaining, siteUrl?, isAttached? }
 * Triggered when: License is created
 */
router.post('/license/activated', authenticateToken, async (req, res) => {
  try {
    const {
      email,
      name,
      licenseKey,
      plan,
      tokenLimit,
      tokensRemaining,
      siteUrl,
      isAttached
    } = req.body;

    // Validate request
    const validation = validateEmailRequest('license_activated', {
      email,
      name,
      licenseKey,
      plan,
      tokenLimit,
      tokensRemaining,
      siteUrl,
      isAttached
    });
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validation.errors
      });
    }

    // Send license activated email
    const result = await emailService.sendLicenseIssuedEmail({
      email,
      name,
      licenseKey,
      plan,
      tokenLimit,
      tokensRemaining,
      siteUrl,
      isAttached: isAttached || false
    });

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to send license activated email',
        code: 'EMAIL_SEND_ERROR',
        message: result.error || result.message
      });
    }

    res.json({
      success: true,
      message: 'License activated email sent successfully',
      email_id: result.email_id
    });
  } catch (error) {
    console.error('[Email Routes] License activated email error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /email/credits/low
 * Low credit warning
 * Body: { email, used, limit, plan, resetDate? }
 * Triggered via: Usage tracking (70% threshold)
 */
router.post('/credits/low', async (req, res) => {
  try {
    const { email, used, limit, plan, resetDate } = req.body;

    // Validate request
    const validation = validateEmailRequest('credits_low', {
      email,
      used,
      limit,
      plan,
      resetDate
    });
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validation.errors
      });
    }

    // Send low credit warning email
    const result = await emailService.sendLowCreditWarning({
      email,
      used,
      limit,
      plan: plan || 'free',
      resetDate
    });

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to send low credit warning',
        code: 'EMAIL_SEND_ERROR',
        message: result.error || result.message
      });
    }

    res.json({
      success: true,
      message: 'Low credit warning sent successfully',
      email_id: result.email_id
    });
  } catch (error) {
    console.error('[Email Routes] Low credit warning error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /email/receipt
 * Payment receipt
 * Body: { email, name?, amount, currency, plan, transactionId, date }
 * Triggered by: Stripe webhooks
 */
router.post('/receipt', authenticateToken, async (req, res) => {
  try {
    const { email, name, amount, currency, plan, transactionId, date } = req.body;

    // Validate request
    const validation = validateEmailRequest('receipt', {
      email,
      name,
      amount,
      currency,
      plan,
      transactionId,
      date
    });
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validation.errors
      });
    }

    // Send receipt email
    const result = await emailService.sendReceipt({
      email,
      name,
      amount,
      currency: currency || 'USD',
      plan,
      transactionId,
      date
    });

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to send receipt email',
        code: 'EMAIL_SEND_ERROR',
        message: result.error || result.message
      });
    }

    res.json({
      success: true,
      message: 'Receipt email sent successfully',
      email_id: result.email_id
    });
  } catch (error) {
    console.error('[Email Routes] Receipt email error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /email/plugin/signup
 * Plugin signup email
 * Body: { email, name?, plugin, installId? }
 * Triggered by: Plugin registration
 */
router.post('/plugin/signup', async (req, res) => {
  try {
    const { email, name, plugin, installId } = req.body;

    // Validate request
    const validation = validateEmailRequest('plugin_signup', {
      email,
      name,
      plugin,
      installId
    });
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validation.errors
      });
    }

    // Send plugin signup email
    const result = await emailService.sendPluginSignup({
      email,
      name,
      plugin,
      installId
    });

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to send plugin signup email',
        code: 'EMAIL_SEND_ERROR',
        message: result.error || result.message
      });
    }

    res.json({
      success: true,
      message: 'Plugin signup email sent successfully',
      email_id: result.email_id
    });
  } catch (error) {
    console.error('[Email Routes] Plugin signup email error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;

