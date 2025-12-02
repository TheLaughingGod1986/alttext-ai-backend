/**
 * Billing Routes (Public Endpoints)
 * Uses billingService for subscription management
 */

const express = require('express');
const { authenticateToken } = require('../../auth/jwt');
const billingService = require('../services/billingService');
const { errors: httpErrors } = require('../utils/http');
const logger = require('../utils/logger');
// Optional: creditsService may not exist in all environments
let creditsService;
try {
  creditsService = require('../services/creditsService');
} catch (e) {
  // creditsService not available, will handle gracefully in routes that use it
  creditsService = null;
}
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

const addCreditsSchema = z.object({
  email: z.string().email(),
  amount: z.number().int().positive(),
  plugin: z.string().optional(),
});

const spendCreditsSchema = z.object({
  identityId: z.string().uuid(),
  amount: z.number().int().positive().optional().default(1),
  metadata: z.record(z.any()).optional(),
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
      logger.warn('[Billing Security] Email mismatch', { authenticated: authenticatedEmail, requested: requestedEmail, userId: req.user.id });
      return res.status(403).json({
        ok: false,
        error: 'You can only create checkout sessions for your own email address',
      });
    }

    // Get or create customer
    const customerResult = await billingService.createOrGetCustomer(email);
    if (!customerResult || !customerResult.success) {
      return res.status(500).json({
        ok: false,
        error: customerResult?.error || 'Failed to create or get customer',
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
    logger.error('[Billing Routes] Error creating checkout', { error: error.message });
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
      logger.warn('[Billing Security] Email mismatch', { authenticated: authenticatedEmail, requested: requestedEmail, userId: req.user.id });
      return res.status(403).json({
        ok: false,
        error: 'You can only access the billing portal for your own email address',
      });
    }

    // Get or create customer
    const customerResult = await billingService.createOrGetCustomer(email);
    if (!customerResult || !customerResult.success) {
      return res.status(500).json({
        ok: false,
        error: customerResult?.error || 'Failed to create or get customer',
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
    logger.error('[Billing Routes] Error creating portal', { error: error.message });
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
      logger.warn('[Billing Security] Email mismatch', { authenticated: authenticatedEmail, requested: requestedEmail, userId: req.user.id });
      return res.status(403).json({
        ok: false,
        error: 'You can only view subscriptions for your own email address',
      });
    }

    // Get subscriptions
    const result = await billingService.getUserSubscriptions(email);
    if (!result || !result.success) {
      return res.status(500).json({
        ok: false,
        error: result?.error || 'Failed to fetch subscriptions',
        subscriptions: [],
      });
    }

    return res.status(200).json({
      ok: true,
      subscriptions: result.subscriptions || [],
    });
  } catch (error) {
    logger.error('[Billing Routes] Error fetching subscriptions', { error: error.message });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch subscriptions',
      subscriptions: [],
    });
  }
});

/**
 * GET /billing/subscription-status
 * Get current subscription status, usage, and limits for a plugin
 * SECURITY: Requires authentication
 * Query params: plugin (optional, default: 'alttext-ai')
 */
router.get('/subscription-status', billingRateLimiter, authenticateToken, async (req, res) => {
  try {
    // Require authentication
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const email = req.user.email.toLowerCase();
    const plugin = req.query.plugin || 'alttext-ai';

    // Get subscription info
    const subscriptionCheck = await billingService.checkSubscription(email, plugin);
    
    if (!subscriptionCheck.success) {
      return res.status(500).json({
        ok: false,
        error: subscriptionCheck.error || 'Failed to check subscription',
        tier: 'free',
        plan: 'free',
        limits: subscriptionCheck.limits,
      });
    }

    // Get usage summary
    const usageService = require('../services/usageService');
    const usageResult = await usageService.getUsageSummary(email);

    const monthlyImages = usageResult.success ? (usageResult.usage?.monthlyImages || 0) : 0;
    const limit = subscriptionCheck.limits?.tokens || 50;
    const remaining = subscriptionCheck.tier === 'agency' 
      ? Infinity 
      : Math.max(0, limit - monthlyImages);

    return res.status(200).json({
      ok: true,
      tier: subscriptionCheck.tier,
      plan: subscriptionCheck.plan,
      subscription: subscriptionCheck.subscription,
      usage: {
        used: monthlyImages,
        limit: subscriptionCheck.tier === 'agency' ? Infinity : limit,
        remaining: remaining,
      },
      limits: subscriptionCheck.limits,
      unlimited: subscriptionCheck.tier === 'agency',
    });
  } catch (error) {
    logger.error('[Billing Routes] Error fetching subscription status', { error: error.message });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch subscription status',
    });
  }
});

/**
 * POST /billing/credits/add
 * Create Stripe checkout session for credit purchase
 * SECURITY: Requires authentication and verifies email ownership
 */
router.post('/credits/add', billingRateLimiter, authenticateToken, async (req, res) => {
  try {
    // Require authentication
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    // Validate input
    const parsed = addCreditsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || 'Validation failed',
      });
    }

    const { email, amount, plugin = 'alttext-ai' } = parsed.data;

    // SECURITY: Verify that the authenticated user's email matches the requested email
    const authenticatedEmail = req.user.email.toLowerCase();
    const requestedEmail = email.toLowerCase();
    
    if (authenticatedEmail !== requestedEmail) {
      logger.warn('[Billing Security] Email mismatch', { authenticated: authenticatedEmail, requested: requestedEmail, userId: req.user.id });
      return res.status(403).json({
        ok: false,
        error: 'You can only purchase credits for your own email address',
      });
    }

    // Get or create customer
    const customerResult = await billingService.createOrGetCustomer(email);
    if (!customerResult || !customerResult.success) {
      return res.status(500).json({
        ok: false,
        error: customerResult?.error || 'Failed to create or get customer',
      });
    }

    const customerId = customerResult.data.customerId;

    // Get Stripe client
    const stripe = getStripe();
    if (!stripe) {
      return res.status(500).json({
        ok: false,
        error: 'Stripe not configured',
      });
    }

    // Get credit price ID from environment (default to STRIPE_PRICE_CREDITS)
    const creditPriceId = process.env.STRIPE_PRICE_CREDITS || process.env.ALTTEXT_AI_STRIPE_PRICE_CREDITS;
    if (!creditPriceId) {
      return res.status(500).json({
        ok: false,
        error: 'Credit price not configured',
      });
    }

    // Create checkout session for one-time payment (credits)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: creditPriceId,
          quantity: amount,
        },
      ],
      mode: 'payment', // One-time payment for credits
      success_url: `${process.env.FRONTEND_DASHBOARD_URL || process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/credits/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_DASHBOARD_URL || process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/credits/cancel`,
      metadata: {
        user_email: email.toLowerCase(),
        plugin_slug: plugin,
        type: 'credits',
        amount: amount.toString(),
      },
    });

    return res.status(200).json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    logger.error('[Billing Routes] Error creating credit checkout', { error: error.message });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to create credit checkout session',
    });
  }
});

/**
 * POST /billing/credits/spend
 * Internal endpoint to deduct credits on generation
 * SECURITY: Requires authentication or internal system access
 */
router.post('/credits/spend', billingRateLimiter, authenticateToken, async (req, res) => {
  try {
    // Validate input
    const parsed = spendCreditsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || 'Validation failed',
      });
    }

    const { identityId, amount = 1, metadata = {} } = parsed.data;

    // SECURITY: Verify that the authenticated user owns this identity
    // Get identity by identityId and verify email matches authenticated user
    const { supabase } = require('../../db/supabase-client');
    const { data: identity, error: identityError } = await supabase
      .from('identities')
      .select('email')
      .eq('id', identityId)
      .single();

    if (identityError || !identity) {
      return res.status(404).json({
        ok: false,
        error: 'Identity not found',
      });
    }

    // Verify email ownership
    if (req.user && req.user.email) {
      const authenticatedEmail = req.user.email.toLowerCase();
      const identityEmail = identity.email.toLowerCase();
      
      if (authenticatedEmail !== identityEmail) {
        logger.warn('[Billing Security] Email mismatch for credit spend', { authenticated: authenticatedEmail, identity: identityEmail, identityId });
        return res.status(403).json({
          ok: false,
          error: 'You can only spend credits for your own account',
        });
      }
    }

    // Spend credits
    if (!creditsService) {
      return res.status(503).json({
        ok: false,
        error: 'Credits service not available',
      });
    }
    const result = await creditsService.spendCredits(identityId, amount, metadata);

    if (!result.success) {
      if (result.error === 'INSUFFICIENT_CREDITS') {
        return res.status(402).json({
          ok: false,
          error: 'Insufficient credits',
          currentBalance: result.currentBalance,
          requested: result.requested,
        });
      }
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    return res.status(200).json({
      ok: true,
      remainingBalance: result.remainingBalance,
      transactionId: result.transactionId,
    });
  } catch (error) {
    logger.error('[Billing Routes] Error spending credits', { error: error.message });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to spend credits',
    });
  }
});

/**
 * GET /billing/credits/balance
 * Get current credit balance for authenticated user
 * SECURITY: Requires authentication
 */
router.get('/credits/balance', billingRateLimiter, authenticateToken, async (req, res) => {
  try {
    // Require authentication
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const email = req.user.email.toLowerCase();

    // Get or create identity
    if (!creditsService) {
      return res.status(503).json({
        ok: false,
        error: 'Credits service not available',
      });
    }
    const identityResult = await creditsService.getOrCreateIdentity(email);
    if (!identityResult.success) {
      return res.status(500).json({
        ok: false,
        error: identityResult.error,
        balance: 0,
      });
    }

    // Get balance
    const balanceResult = await creditsService.getBalance(identityResult.identityId);
    if (!balanceResult.success) {
      return res.status(500).json({
        ok: false,
        error: balanceResult.error,
        balance: 0,
      });
    }

    return res.status(200).json({
      ok: true,
      balance: balanceResult.balance,
      identityId: identityResult.identityId,
    });
  } catch (error) {
    logger.error('[Billing Routes] Error getting credit balance', { error: error.message });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get credit balance',
      balance: 0,
    });
  }
});

/**
 * GET /billing/credits/transactions
 * Get paginated credit transaction history
 * SECURITY: Requires authentication
 * Query params: page (default: 1), limit (default: 50)
 */
router.get('/credits/transactions', billingRateLimiter, authenticateToken, async (req, res) => {
  try {
    // Require authentication
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const email = req.user.email.toLowerCase();
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100 per page

    // Get or create identity
    if (!creditsService) {
      return res.status(503).json({
        ok: false,
        error: 'Credits service not available',
      });
    }
    const identityResult = await creditsService.getOrCreateIdentity(email);
    if (!identityResult.success) {
      return res.status(500).json({
        ok: false,
        error: identityResult.error,
        transactions: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
    }

    // Get transaction history
    const historyResult = await creditsService.getTransactionHistory(
      identityResult.identityId,
      page,
      limit
    );

    if (!historyResult.success) {
      return res.status(500).json({
        ok: false,
        error: historyResult.error,
        transactions: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
    }

    return res.status(200).json({
      ok: true,
      transactions: historyResult.transactions,
      pagination: historyResult.pagination,
    });
  } catch (error) {
    logger.error('[Billing Routes] Error getting credit transactions', { error: error.message });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get credit transactions',
      transactions: [],
      pagination: { page: 1, limit: 50, total: 0, pages: 0 },
    });
  }
});

/**
 * GET /billing/history
 * Get billing history (invoices and transactions) for the authenticated user
 */
router.get('/history', billingRateLimiter, authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    
    if (!email) {
      return res.status(400).json({
        ok: false,
        error: 'User email not found in token',
      });
    }

    // Get subscription to find Stripe customer ID
    const subscriptionResult = await billingService.getSubscriptionForEmail(email);
    
    let invoices = [];
    let transactions = [];

    // Get invoices from Stripe if customer exists
    if (subscriptionResult.success && subscriptionResult.subscription?.stripe_customer_id) {
      const stripe = getStripe();
      if (stripe) {
        try {
          const stripeInvoices = await stripe.invoices.list({
            customer: subscriptionResult.subscription.stripe_customer_id,
            limit: 100,
          });
          invoices = stripeInvoices.data || [];
        } catch (stripeError) {
          logger.error('[Billing Routes] Error fetching Stripe invoices', { error: stripeError.message });
        }
      }
    }

    // Get credit transactions
    if (creditsService) {
      try {
        const identityResult = await creditsService.getOrCreateIdentity(email);
        if (identityResult.success && identityResult.identityId) {
          const historyResult = await creditsService.getTransactionHistory(identityResult.identityId, 1, 100);
          if (historyResult.success) {
            transactions = historyResult.transactions || [];
          }
        }
      } catch (transError) {
        logger.error('[Billing Routes] Error fetching transactions', { error: transError.message });
      }
    }

    return res.status(200).json({
      ok: true,
      invoices: invoices,
      transactions: transactions,
    });
  } catch (error) {
    logger.error('[Billing Routes] Error getting billing history', { error: error.message });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get billing history',
      invoices: [],
      transactions: [],
    });
  }
});

module.exports = router;

