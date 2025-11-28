/**
 * Billing Routes (Public Endpoints)
 * Uses billingService for subscription management
 */

const express = require('express');
const { authenticateToken } = require('../../auth/jwt');
const billingService = require('../services/billingService');
const { getStripe } = require('../utils/stripeClient');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for billing endpoints
const billingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: 'Too many billing requests, please try again later.',
});

// Validation schemas
const createCheckoutSchema = z.object({
  email: z.string().email(),
  plugin: z.string().min(1),
  priceId: z.string().min(1),
});

const createPortalSchema = z.object({
  email: z.string().email(),
});

const subscriptionsSchema = z.object({
  email: z.string().email(),
});

/**
 * POST /billing/create-checkout
 * Create Stripe Checkout Session
 * SECURITY: Requires authentication and verifies email ownership
 */
router.post('/create-checkout', billingRateLimiter, authenticateToken, async (req, res) => {
  try {
    // Require authentication
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    // Validate input
    const parsed = createCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || 'Validation failed',
      });
    }

    const { email, plugin, priceId } = parsed.data;

    // SECURITY: Verify that the authenticated user's email matches the requested email
    const authenticatedEmail = req.user.email.toLowerCase();
    const requestedEmail = email.toLowerCase();
    
    if (authenticatedEmail !== requestedEmail) {
      console.warn(`[Billing Security] Email mismatch: authenticated=${authenticatedEmail}, requested=${requestedEmail}, userId=${req.user.id}`);
      return res.status(403).json({
        ok: false,
        error: 'You can only create checkout sessions for your own email address',
      });
    }

    // Get or create customer
    const customerResult = await billingService.createOrGetCustomer(email);
    if (!customerResult.success) {
      return res.status(500).json({
        ok: false,
        error: customerResult.error,
      });
    }

    const customerId = customerResult.data.customerId;

    // Create checkout session
    const stripe = getStripe();
    if (!stripe) {
      return res.status(500).json({
        ok: false,
        error: 'Stripe not configured',
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_DASHBOARD_URL || process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_DASHBOARD_URL || process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/cancel`,
      metadata: {
        user_email: email.toLowerCase(),
        plugin_slug: plugin,
      },
    });

    return res.status(200).json({
      ok: true,
      url: session.url,
    });
  } catch (error) {
    console.error('[Billing Routes] Error creating checkout:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to create checkout session',
    });
  }
});

/**
 * POST /billing/create-portal
 * Create Stripe Customer Portal Session
 * SECURITY: Requires authentication and verifies email ownership
 */
router.post('/create-portal', billingRateLimiter, authenticateToken, async (req, res) => {
  try {
    // Require authentication
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    // Validate input
    const parsed = createPortalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || 'Validation failed',
      });
    }

    const { email } = parsed.data;

    // SECURITY: Verify that the authenticated user's email matches the requested email
    const authenticatedEmail = req.user.email.toLowerCase();
    const requestedEmail = email.toLowerCase();
    
    if (authenticatedEmail !== requestedEmail) {
      console.warn(`[Billing Security] Email mismatch: authenticated=${authenticatedEmail}, requested=${requestedEmail}, userId=${req.user.id}`);
      return res.status(403).json({
        ok: false,
        error: 'You can only access the billing portal for your own email address',
      });
    }

    // Get or create customer
    const customerResult = await billingService.createOrGetCustomer(email);
    if (!customerResult.success) {
      return res.status(500).json({
        ok: false,
        error: customerResult.error,
      });
    }

    const customerId = customerResult.data.customerId;

    // Create portal session
    const stripe = getStripe();
    if (!stripe) {
      return res.status(500).json({
        ok: false,
        error: 'Stripe not configured',
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_DASHBOARD_URL || process.env.FRONTEND_URL || 'http://localhost:3000'}/billing`,
    });

    return res.status(200).json({
      ok: true,
      url: session.url,
    });
  } catch (error) {
    console.error('[Billing Routes] Error creating portal:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to create portal session',
    });
  }
});

/**
 * POST /billing/subscriptions
 * Get user's subscriptions
 * SECURITY: Requires authentication and verifies email ownership
 */
router.post('/subscriptions', billingRateLimiter, authenticateToken, async (req, res) => {
  try {
    // Require authentication
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    // Validate input
    const parsed = subscriptionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || 'Validation failed',
      });
    }

    const { email } = parsed.data;

    // SECURITY: Verify that the authenticated user's email matches the requested email
    const authenticatedEmail = req.user.email.toLowerCase();
    const requestedEmail = email.toLowerCase();
    
    if (authenticatedEmail !== requestedEmail) {
      console.warn(`[Billing Security] Email mismatch: authenticated=${authenticatedEmail}, requested=${requestedEmail}, userId=${req.user.id}`);
      return res.status(403).json({
        ok: false,
        error: 'You can only view subscriptions for your own email address',
      });
    }

    // Get subscriptions
    const result = await billingService.getUserSubscriptions(email);
    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error,
        subscriptions: [],
      });
    }

    return res.status(200).json({
      ok: true,
      subscriptions: result.subscriptions || [],
    });
  } catch (error) {
    console.error('[Billing Routes] Error fetching subscriptions:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch subscriptions',
      subscriptions: [],
    });
  }
});

module.exports = router;

