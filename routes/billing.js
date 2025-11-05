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
      // AltText AI prices
      "price_1SMrxaJl9Rm418cMM4iikjlJ",  // Pro
      "price_1SMrxaJl9Rm418cMnJTShXSY",  // Agency
      "price_1SMrxbJl9Rm418cM0gkzZQZt",  // Credits
      // SEO AI Meta prices
      "price_1SQ6a5Jl9Rm418cMx77q8KB9",  // Pro £12.99/month
      "price_1SQ6aTJl9Rm418cMQz47wCZ2"   // Agency £49.99/month
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
 * Get subscription information (for Account Management)
 * GET /billing/subscription
 */
router.get('/subscription', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // If no subscription, return free plan info
    if (!user.stripeSubscriptionId) {
      return res.json({
        success: true,
        data: {
          plan: 'free',
          status: 'free',
          billingCycle: null,
          nextBillingDate: null,
          nextChargeAmount: null,
          currency: null,
          paymentMethod: null,
          cancelAtPeriodEnd: false,
          subscriptionId: null,
          currentPeriodEnd: null
        }
      });
    }

    // Fetch subscription from Stripe
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    let subscription;
    let paymentMethod = null;

    try {
      subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
        expand: ['default_payment_method']
      });

      // Get payment method details
      if (subscription.default_payment_method) {
        const pm = typeof subscription.default_payment_method === 'string'
          ? await stripe.paymentMethods.retrieve(subscription.default_payment_method)
          : subscription.default_payment_method;

        if (pm && pm.card) {
          paymentMethod = {
            last4: pm.card.last4,
            brand: pm.card.brand,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year
          };
        }
      }

      // Determine plan from subscription
      let plan = 'free';
      let billingCycle = null;
      let nextChargeAmount = null;
      let currency = null;

      if (subscription.items.data.length > 0) {
        const priceId = subscription.items.data[0].price.id;
        // Map Stripe price IDs to plans

        // AltText AI pricing
        if (priceId === 'price_1SMrxaJl9Rm418cMM4iikjlJ') {
          plan = 'pro';
          billingCycle = 'monthly';
          nextChargeAmount = 12.99;
          currency = 'GBP';
        } else if (priceId === 'price_1SMrxaJl9Rm418cMnJTShXSY') {
          plan = 'agency';
          billingCycle = 'monthly';
          nextChargeAmount = 49.99;
          currency = 'GBP';
        } else if (priceId === 'price_1SMrxbJl9Rm418cM0gkzZQZt') {
          plan = 'credits';
          billingCycle = null; // One-time payment
          nextChargeAmount = 9.99;
          currency = 'GBP';
        }
        // SEO AI Meta pricing
        else if (priceId === 'price_1SQ6a5Jl9Rm418cMx77q8KB9') {
          plan = 'pro';
          billingCycle = 'monthly';
          nextChargeAmount = 12.99;
          currency = 'GBP';
        } else if (priceId === 'price_1SQ6aTJl9Rm418cMQz47wCZ2') {
          plan = 'agency';
          billingCycle = 'monthly';
          nextChargeAmount = 49.99;
          currency = 'GBP';
        }
      }

      // Determine status
      let status = 'active';
      if (subscription.status === 'canceled') {
        status = 'cancelled';
      } else if (subscription.status === 'trialing') {
        status = 'trial';
      } else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
        status = 'past_due';
      }

      res.json({
        success: true,
        data: {
          plan,
          status,
          billingCycle,
          nextBillingDate: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
          nextChargeAmount,
          currency,
          paymentMethod,
          cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          subscriptionId: subscription.id,
          currentPeriodEnd: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null
        }
      });

    } catch (stripeError) {
      console.error('Stripe subscription fetch error:', stripeError);
      
      // If Stripe fails, return basic info from database
      res.json({
        success: true,
        data: {
          plan: user.plan || 'free',
          status: 'active',
          billingCycle: null,
          nextBillingDate: null,
          nextChargeAmount: null,
          currency: null,
          paymentMethod: null,
          cancelAtPeriodEnd: false,
          subscriptionId: user.stripeSubscriptionId,
          currentPeriodEnd: null
        }
      });
    }

  } catch (error) {
    console.error('Subscription info error:', error);
    res.status(500).json({
      error: 'Failed to get subscription information',
      code: 'SUBSCRIPTION_INFO_ERROR'
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
    const { service } = req.query;

    // SEO AI Meta plans
    if (service === 'seo-ai-meta') {
      const plans = [
        {
          id: 'free',
          name: 'Free',
          price: 0,
          currency: 'gbp',
          interval: 'month',
          posts: 5,
          features: [
            '5 AI-generated meta tags per month',
            'GPT-4-turbo model',
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
          posts: 100,
          priceId: "price_1SQ6a5Jl9Rm418cMx77q8KB9",
          features: [
            '100 AI-generated meta tags per month',
            'GPT-4-turbo model',
            'Bulk generation',
            'Priority support'
          ]
        },
        {
          id: 'agency',
          name: 'Agency',
          price: 49.99,
          currency: 'gbp',
          interval: 'month',
          posts: 1000,
          priceId: "price_1SQ6aTJl9Rm418cMQz47wCZ2",
          features: [
            '1000 AI-generated meta tags per month',
            'GPT-4-turbo model',
            'Bulk generation',
            'Priority support',
            'White-label options'
          ]
        }
      ];

      return res.json({
        success: true,
        plans
      });
    }

    // AltText AI plans (default)
    const plans = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'gbp',
        interval: 'month',
        images: 50,
        features: [
          '50 AI-generated alt texts per month',
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
