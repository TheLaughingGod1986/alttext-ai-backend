/**
 * Email API Routes
 * Handles subscriber management and email triggers for marketing automation
 */

const express = require('express');
const emailService = require('../services/emailService');
const { authenticateToken } = require('../auth/jwt');

const router = express.Router();

/**
 * Subscribe user to email list
 * POST /email/subscribe
 *
 * Body:
 * {
 *   "email": "user@example.com",
 *   "name": "John Doe",
 *   "plan": "free",
 *   "install_id": "wp_abc123",
 *   "wp_user_id": 1,
 *   "opt_in_date": "2024-01-01 12:00:00",
 *   "metadata": {}
 * }
 */
router.post('/subscribe', authenticateToken, async (req, res) => {
  try {
    const { email, name, plan, install_id, wp_user_id, opt_in_date, metadata } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log(`[Email API] Subscribe request: ${email} (plan: ${plan || 'free'})`);

    const result = await emailService.subscribe({
      email,
      name,
      plan: plan || 'free',
      install_id,
      wp_user_id,
      opt_in_date,
      metadata: metadata || {}
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Email API] Subscribe error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to subscribe user'
    });
  }
});

/**
 * Trigger email event
 * POST /email/trigger
 *
 * Body:
 * {
 *   "email": "user@example.com",
 *   "event_type": "welcome",
 *   "event_data": {
 *     "plan": "free",
 *     "used": 35,
 *     "limit": 50
 *   },
 *   "install_id": "wp_abc123"
 * }
 */
router.post('/trigger', authenticateToken, async (req, res) => {
  try {
    const { email, event_type, event_data, install_id } = req.body;

    if (!email || !event_type) {
      return res.status(400).json({
        success: false,
        error: 'Email and event_type are required'
      });
    }

    // Validate event_type
    const validEvents = ['welcome', 'usage_70', 'usage_100', 'upgrade', 'inactive_30d'];
    if (!validEvents.includes(event_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid event_type. Must be one of: ${validEvents.join(', ')}`
      });
    }

    console.log(`[Email API] Trigger ${event_type} for ${email}`);

    const result = await emailService.triggerEmail({
      email,
      event_type,
      event_data: event_data || {},
      install_id
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Email API] Trigger error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to trigger email'
    });
  }
});

/**
 * Unsubscribe user
 * POST /email/unsubscribe
 *
 * Body:
 * {
 *   "email": "user@example.com"
 * }
 */
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log(`[Email API] Unsubscribe request: ${email}`);

    const result = await emailService.unsubscribe(email);

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Email API] Unsubscribe error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to unsubscribe'
    });
  }
});

/**
 * Health check endpoint
 * GET /email/health
 */
router.get('/health', (req, res) => {
  const resendConfigured = !!emailService.resend;
  const audienceConfigured = !!emailService.audienceId;

  res.json({
    success: true,
    status: resendConfigured && audienceConfigured ? 'configured' : 'not_configured',
    message: resendConfigured && audienceConfigured
      ? 'Email service is ready'
      : 'Resend API key or Audience ID not configured',
    details: {
      resend_api_key: resendConfigured ? 'configured' : 'missing',
      audience_id: audienceConfigured ? 'configured' : 'missing',
      from_email: emailService.fromEmail
    }
  });
});

module.exports = router;
