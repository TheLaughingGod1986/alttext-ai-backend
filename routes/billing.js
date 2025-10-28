/**
 * Billing routes for Stripe integration
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../auth/jwt');
const { createCheckoutSession, createCustomerPortalSession } = require('../stripe/checkout');
const { webhookMiddleware, webhookHandler, testWebhook } = require('../stripe/webhooks');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Create Stripe Checkout Session
 */
router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    const { priceId, successUrl, cancelUrl } = req.body;

    if (!priceId) {
      return res.status(400).json({
        error: 'Price ID is required',
        code: 'MISSING_PRICE_ID'
      });
    }

    // Validate price ID
    const validPrices = [
      "price_1SMrxaJl9Rm418cMM4iikjlJ",
      "price_1SMrxaJl9Rm418cMnJTShXSY",
      "price_1SMrxbJl9Rm418cM0gkzZQZt"
    ];

    if (!validPrices.includes(priceId)) {
      return res.status(400).json({
        error: 'Invalid price ID',
        code: 'INVALID_PRICE_ID'
      });
    }

    const session = await createCheckoutSession(
      req.user.id,
      priceId,
      successUrl || `${process.env.FRONTEND_URL}/success`,
      cancelUrl || `${process.env.FRONTEND_URL}/cancel`
    );

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      code: 'CHECKOUT_ERROR'
    });
  }
});

/**
 * Create Customer Portal Session
 */
router.post('/portal', authenticateToken, async (req, res) => {
  try {
    const { returnUrl } = req.body;

    const session = await createCustomerPortalSession(
      req.user.id,
      returnUrl || `${process.env.FRONTEND_URL}/dashboard`
    );

    res.json({
      success: true,
      url: session.url
    });

  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({
      error: 'Failed to create customer portal session',
      code: 'PORTAL_ERROR'
    });
  }
});

/**
 * Get user's billing info
 */
router.get('/info', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        tokensRemaining: true,
        credits: true,
        resetDate: true
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Get subscription details from Stripe if exists
    let subscription = null;
    if (user.stripeSubscriptionId) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      } catch (error) {
        console.warn('Failed to fetch subscription from Stripe:', error.message);
      }
    }

    res.json({
      success: true,
      billing: {
        plan: user.plan,
        hasSubscription: !!user.stripeSubscriptionId,
        subscription,
        tokensRemaining: user.tokensRemaining,
        credits: user.credits,
        resetDate: user.resetDate
      }
    });

  } catch (error) {
    console.error('Billing info error:', error);
    res.status(500).json({
      error: 'Failed to get billing info',
      code: 'BILLING_INFO_ERROR'
    });
  }
});

/**
 * Stripe webhook endpoint
 */
router.post('/webhook', webhookMiddleware, webhookHandler);

/**
 * Test webhook endpoint (development only)
 */
router.post('/webhook/test', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    await testWebhook(req, res);
  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({ error: 'Test webhook failed' });
  }
});

/**
 * Get available plans and pricing
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'gbp',
        interval: 'month',
        images: 10,
        features: [
          '10 AI-generated alt texts per month',
          'Basic quality scoring',
          'WordPress integration',
          'Email support'
        ]
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 12.99,
        currency: 'gbp',
        interval: 'month',
        images: 1000,
        priceId: "price_1SMrxaJl9Rm418cMM4iikjlJ",
        features: [
          '1000 AI-generated alt texts per month',
          'Advanced quality scoring',
          'Bulk processing',
          'Priority support',
          'API access'
        ]
      },
      {
        id: 'agency',
        name: 'Agency',
        price: 49.99,
        currency: 'gbp',
        interval: 'month',
        images: 10000,
        priceId: "price_1SMrxaJl9Rm418cMnJTShXSY",
        features: [
          '10000 AI-generated alt texts per month',
          'Advanced quality scoring',
          'Bulk processing',
          'Priority support',
          'API access',
          'White-label options'
        ]
      },
      {
        id: 'credits',
        name: 'Credit Pack',
        price: 9.99,
        currency: 'gbp',
        interval: 'one-time',
        images: 100,
        priceId: "price_1SMrxbJl9Rm418cM0gkzZQZt",
        features: [
          '100 AI-generated alt texts',
          'No expiration',
          'Use alongside any plan'
        ]
      }
    ];

    res.json({
      success: true,
      plans
    });

  } catch (error) {
    console.error('Plans error:', error);
    res.status(500).json({
      error: 'Failed to get plans',
      code: 'PLANS_ERROR'
    });
  }
});

module.exports = router;
