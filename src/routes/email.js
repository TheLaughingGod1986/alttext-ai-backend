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
 * POST /email/waitlist
 * Body: { email, plugin, source }
 */
router.post('/waitlist', async (req, res) => {
  try {
    const { email, plugin, source } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Email is required',
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid email format',
      });
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

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Email Routes] Waitlist email error:', error);
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
      return res.status(400).json({
        ok: false,
        error: 'Email is required',
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid email format',
      });
    }

    // Send dashboard welcome email
    const result = await emailService.sendDashboardWelcome({ email });

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to send email',
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Email Routes] Dashboard welcome email error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * POST /email/plugin-signup
 * Body: { email, pluginName, siteUrl }
 */
router.post('/plugin-signup', async (req, res) => {
  try {
    const { email, pluginName, siteUrl } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Email is required',
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid email format',
      });
    }

    if (!pluginName || typeof pluginName !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Plugin name is required',
      });
    }

    // Send plugin signup email
    const result = await emailService.sendPluginSignup({
      email,
      pluginName,
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
    console.error('[Email Routes] Plugin signup email error:', error);
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
      return res.status(400).json({
        ok: false,
        error: 'Email is required',
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid email format',
      });
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
    console.error('[Email Routes] License activated email error:', error);
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
      return res.status(400).json({
        ok: false,
        error: 'Email is required',
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid email format',
      });
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
    console.error('[Email Routes] Low credit warning error:', error);
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
      const firstError = validationResult.error.errors[0];
      return res.status(400).json({
        ok: false,
        error: firstError.message || 'Validation failed',
      });
    }

    const { email, amount, planName, invoiceUrl, pluginName } = validationResult.data;

  // Send receipt email
  const result = await emailService.sendReceipt({
    email,
    amount,
    plan: planName,
  });

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to send email',
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Email Routes] Receipt email error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
});

module.exports = router;
