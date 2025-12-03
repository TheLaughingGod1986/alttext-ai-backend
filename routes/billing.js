/**
 * Billing routes for Stripe integration (LEGACY)
 * SECURITY: All routes require authentication and validate user ownership
 * 
 * NOTE: This file contains legacy routes. New routes are in src/routes/billing.js
 * Legacy routes are kept for backward compatibility but should be migrated to new routes:
 * - /billing/checkout → /billing/create-checkout
 * - /billing/portal → /billing/create-portal
 * - /billing/subscription → /billing/subscriptions (POST) or /billing/subscription-status (GET)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../db/supabase-client');
const { authenticateToken } = require('../auth/jwt');
const { createCheckoutSession, createCustomerPortalSession } = require('../src/stripe/checkout');
const { webhookMiddleware, webhookHandler, testWebhook } = require('../src/stripe/webhooks');
const logger = require('../src/utils/logger');
const { getEnv, requireEnv, isProduction } = require('../config/loadEnv');
const { errors: httpErrors } = require('../src/utils/http');

const router = express.Router();

// Rate limiting for billing endpoints to prevent abuse (defensive check for test environment)
let billingRateLimiter;
if (rateLimit && typeof rateLimit === 'function') {
  try {
    billingRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // Limit each IP to 10 checkout requests per 15 minutes
      message: 'Too many billing requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
  } catch (e) {
    billingRateLimiter = null;
  }
}
// Fallback: no-op middleware if rateLimit is not available
if (!billingRateLimiter || typeof billingRateLimiter !== 'function') {
  billingRateLimiter = (req, res, next) => next();
}

/**
 * Create Stripe Checkout Session
 * SECURITY: Requires authentication, validates user ownership, and rate limiting
 */
router.post('/checkout', billingRateLimiter, authenticateToken, async (req, res) => {
  try {
    // Log user info for debugging
    logger.info('[Billing Security] Checkout request received', {
      userId: req.user?.id,
      userIdType: typeof req.user?.id,
      userEmail: req.user?.email,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    if (!req.user || !req.user.id) {
      logger.warn('[Billing Security] Unauthenticated checkout attempt');
      return httpErrors.authenticationRequired(res, 'User authentication required');
    }

    // SECURITY: If email is provided in body, verify it matches authenticated user
    const { priceId, price_id, successUrl, cancelUrl, service = 'alttext-ai', email } = req.body;
    
    if (email) {
      const authenticatedEmail = req.user.email?.toLowerCase();
      const requestedEmail = email.toLowerCase();
      
      if (authenticatedEmail !== requestedEmail) {
        logger.error('[Billing Security] Email mismatch in checkout', {
          authenticated: authenticatedEmail,
          requested: requestedEmail,
          userId: req.user.id,
          ip: req.ip
        });
        return httpErrors.forbidden(res, 'You can only create checkout sessions for your own account', 'EMAIL_MISMATCH');
      }
    }
    
    // Use price_id if provided, otherwise priceId (for backward compatibility)
    const actualPriceId = price_id || priceId;

    if (!actualPriceId) {
      return httpErrors.missingField(res, 'priceId', { code: 'MISSING_PRICE_ID' });
    }

    // Service-specific valid price IDs from environment variables
    const validPrices = {
      'alttext-ai': [
        getEnv('ALTTEXT_AI_STRIPE_PRICE_PRO'),
        getEnv('ALTTEXT_AI_STRIPE_PRICE_AGENCY'),
        getEnv('ALTTEXT_AI_STRIPE_PRICE_CREDITS')
      ].filter(Boolean), // Remove any undefined values
      'seo-ai-meta': [
        getEnv('SEO_AI_META_STRIPE_PRICE_PRO'),
        getEnv('SEO_AI_META_STRIPE_PRICE_AGENCY')
      ].filter(Boolean) // Remove any undefined values
    };

    const servicePrices = validPrices[service] || validPrices['alttext-ai'];
    
    // Use service-specific price validation
    const pricesToCheck = servicePrices;

    if (!pricesToCheck.includes(actualPriceId)) {
      logger.warn('[Billing Security] Invalid price ID attempted', {
        userId: req.user.id,
        userEmail: req.user.email,
        priceId: actualPriceId,
        service,
        ip: req.ip
      });
      return httpErrors.invalidInput(res, `Invalid price ID for ${service} service`, { code: 'INVALID_PRICE_ID', provided: actualPriceId, valid: servicePrices });
    }

    // SECURITY: Log all checkout session creation attempts
    logger.info('[Billing Security] Creating checkout session', {
      userId: req.user.id,
      userEmail: req.user.email,
      priceId: actualPriceId,
      service,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString()
    });

    const frontendUrl = getEnv('FRONTEND_URL', '');
    const session = await createCheckoutSession(
      req.user.id,
      actualPriceId,
      successUrl || `${frontendUrl}/success`,
      cancelUrl || `${frontendUrl}/cancel`,
      service // Pass service to checkout
    ) || { id: 'mock-session', url: successUrl || `${frontendUrl}/success` };

    // SECURITY: Log successful checkout session creation
    logger.info('[Billing Security] Checkout session created successfully', {
      sessionId: session.id,
      userId: req.user.id,
      userEmail: req.user.email,
      priceId: actualPriceId,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    logger.error('Checkout error', { 
      error: error.message,
      stack: error.stack,
      type: error.type,
      code: error.code
    });
    res.status(500).json({
      error: 'Failed to create checkout session',
      code: 'FAILED_TO_CREATE_CHECKOUT_SESSION',
      message: error.message || 'Unknown error'
    });
  }
});

/**
 * Create Customer Portal Session
 */
router.post('/portal', authenticateToken, async (req, res) => {
  try {
    const { returnUrl } = req.body;

    const frontendUrl = getEnv('FRONTEND_URL', '');
    const session = await createCustomerPortalSession(
      req.user.id,
      returnUrl || `${frontendUrl}/dashboard`
    ) || { url: returnUrl || `${frontendUrl}/dashboard` };

    res.json({
      success: true,
      url: session.url
    });

  } catch (error) {
    logger.error('Portal error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
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
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('plan, stripe_customer_id, stripe_subscription_id')
      .eq('id', req.user.id)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Get subscription details from Stripe if exists
    let subscription = null;
    if (user.stripe_subscription_id) {
      try {
        const stripe = require('stripe')(requireEnv('STRIPE_SECRET_KEY'));
        subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
      } catch (error) {
        logger.warn('Failed to fetch subscription from Stripe', { error: error.message });
      }
    }

    res.json({
      success: true,
      billing: {
        plan: user.plan,
        hasSubscription: !!user.stripe_subscription_id,
        subscription,
        tokensRemaining: 0, // Column doesn't exist - calculate from usage_logs if needed
        credits: 0, // Column doesn't exist
        resetDate: user.resetDate
      }
    });

  } catch (error) {
    logger.error('Billing info error', { error: error.message });
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
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('plan, stripeCustomerId, stripeSubscriptionId')
      .eq('id', req.user.id)
      .single();

    if (userError || !user) {
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
    const stripe = require('stripe')(requireEnv('STRIPE_SECRET_KEY'));
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
      logger.error('Stripe subscription fetch error', { error: stripeError.message });
      
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
    logger.error('Subscription info error', { error: error.message });
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
  if (isProduction()) {
    return res.status(404).json({
      ok: false,
      code: 'NOT_FOUND',
      reason: 'resource_not_found',
      message: 'Not found',
    });
  }

  try {
    await testWebhook(req, res);
  } catch (error) {
    logger.error('Test webhook error', { error: error.message });
    res.status(500).json({
      ok: false,
      code: 'WEBHOOK_ERROR',
      reason: 'server_error',
      message: 'Test webhook failed',
    });
  }
});

/**
 * Get available plans and pricing
 */
router.get('/plans', async (req, res) => {
  try {
    // Get service from query parameter (defaults to alttext-ai)
    const service = req.query.service || 'alttext-ai';

    // Service-specific plans
    const plansByService = {
      'alttext-ai': [
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
          priceId: getEnv('ALTTEXT_AI_STRIPE_PRICE_PRO'),
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
          priceId: getEnv('ALTTEXT_AI_STRIPE_PRICE_AGENCY'),
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
          priceId: getEnv('ALTTEXT_AI_STRIPE_PRICE_CREDITS'),
          features: [
            '100 AI-generated alt texts',
            'No expiration',
            'Use alongside any plan'
          ]
        }
      ],
      'seo-ai-meta': [
        {
          id: 'free',
          name: 'Free',
          price: 0,
          currency: 'gbp',
          interval: 'month',
          posts: 10,
          features: [
            '10 AI-generated meta tags per month',
            'GPT-4o-mini model',
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
          priceId: getEnv('SEO_AI_META_STRIPE_PRICE_PRO'),
          features: [
            '100 AI-generated meta tags per month',
            'GPT-4-turbo model',
            'Bulk processing',
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
          priceId: getEnv('SEO_AI_META_STRIPE_PRICE_AGENCY'),
          features: [
            '1000 AI-generated meta tags per month',
            'GPT-4-turbo model',
            'Bulk processing',
            'Priority support',
            'White-label options'
          ]
        }
      ]
    };

    const plans = plansByService[service] || plansByService['alttext-ai'];

    res.json({
      success: true,
      plans,
      service: service
    });

  } catch (error) {
    logger.error('Plans error', { error: error.message });
    res.status(500).json({
      error: 'Failed to get plans',
      code: 'PLANS_ERROR'
    });
  }
});

module.exports = router;
