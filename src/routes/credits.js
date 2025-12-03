/**
 * Credits Routes
 * API endpoints for credit management and purchases
 */

const express = require('express');
const { authenticateToken } = require('../../auth/jwt');
const creditsService = require('../services/creditsService');
const { createCreditPackCheckoutSession } = require('../stripe/checkout');
const { getStripe } = require('../utils/stripeClient');
const rateLimit = require('express-rate-limit');
const creditPacks = require('../data/creditPacks');
const { z } = require('zod');
const logger = require('../utils/logger');
const { getEnv, requireEnv } = require('../../config/loadEnv');

const router = express.Router();

// Rate limiting for credits endpoints (defensive check for test environment)
let creditsRateLimiter;
if (rateLimit && typeof rateLimit === 'function') {
  try {
    creditsRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per window
      message: 'Too many requests, please try again later.',
    });
  } catch (e) {
    creditsRateLimiter = null;
  }
}
// Fallback: no-op middleware if rateLimit is not available
if (!creditsRateLimiter || typeof creditsRateLimiter !== 'function') {
  creditsRateLimiter = (req, res, next) => next();
}

// Validation schemas
const purchaseSchema = z.object({
  priceId: z.string().min(1).optional(),
  packSize: z.enum(['50', '200', '1000']).optional(),
  email: z.string().email().optional(),
}).refine(
  (data) => data.priceId || data.packSize,
  {
    message: 'Either priceId or packSize is required',
  }
);

const checkoutSessionSchema = z.object({
  packId: z.string().min(1),
});

/**
 * GET /credits/packs
 * Returns available credit packs
 */
router.get('/packs', authenticateToken, creditsRateLimiter, async (req, res) => {
  try {
    return res.json({ ok: true, packs: creditPacks });
  } catch (error) {
    logger.error('[Credits Routes] GET /credits/packs error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, 'Failed to get credit packs');
  }
});

/**
 * GET /credits/balance
 * Returns current credit balance for authenticated user
 */
router.get('/balance', authenticateToken, creditsRateLimiter, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return httpErrors.validationFailed(res, 'User email not found in token');
    }

    const balanceResult = await creditsService.getBalanceByEmail(email);

    if (!balanceResult.success) {
      logger.error('[Credits Routes] Failed to get balance', { error: balanceResult.error, email });
      return httpErrors.internalError(res, balanceResult.error || 'Failed to get balance');
    }

    return res.json({
      ok: true,
      credits: balanceResult.balance || 0,
    });
  } catch (error) {
    logger.error('[Credits Routes] GET /credits/balance error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, 'Failed to get credit balance');
  }
});

/**
 * GET /credits/transactions
 * Returns credit transaction history for authenticated user
 * Supports pagination via query params: page (default: 1), limit (default: 50)
 */
router.get('/transactions', authenticateToken, creditsRateLimiter, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return httpErrors.validationFailed(res, 'User email not found in token');
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100 per page

    const transactionsResult = await creditsService.getTransactionsByEmail(email, page, limit);

    if (!transactionsResult.success) {
      logger.error('[Credits Routes] Failed to get transactions', { error: transactionsResult.error, email });
      return httpErrors.internalError(res, transactionsResult.error || 'Failed to get transactions');
    }

    return res.json({
      ok: true,
      transactions: transactionsResult.transactions || [],
      pagination: transactionsResult.pagination || {
        page: 1,
        limit: 50,
        total: 0,
        pages: 0,
      },
    });
  } catch (error) {
    logger.error('[Credits Routes] GET /credits/transactions error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, 'Failed to get transaction history');
  }
});

/**
 * POST /credits/checkout-session
 * Creates Stripe Checkout Session for credit pack purchase
 * Body: { packId: "pack_500" }
 */
router.post('/checkout-session', authenticateToken, creditsRateLimiter, async (req, res) => {
  try {
    // Validate request payload with Zod
    const validation = checkoutSessionSchema.safeParse(req.body);

    if (!validation.success) {
      return httpErrors.validationFailed(res, 'Request validation failed', validation.error.flatten());
    }

    const { packId } = validation.data;

    // Find pack in creditPacks array
    const pack = creditPacks.find(p => p.id === packId);
    if (!pack) {
      return httpErrors.invalidInput(res, 'Invalid pack');
    }

    // Get identityId from token or get/create from email
    let identityId = req.user?.identityId || req.user?.id;
    if (!identityId && req.user?.email) {
      const identityResult = await creditsService.getOrCreateIdentity(req.user.email);
      if (identityResult.success) {
        identityId = identityResult.identityId;
      }
    }

    if (!identityId) {
      return httpErrors.validationFailed(res, 'Unable to determine user identity');
    }

    const stripe = getStripe();
    if (!stripe) {
      logger.error('[Credits Routes] Stripe not configured');
      return httpErrors.serviceUnavailable(res, 'Stripe not configured');
    }

    // Build success and cancel URLs
    const frontendUrl = getEnv('FRONTEND_URL', getEnv('FRONTEND_DASHBOARD_URL', 'http://localhost:3000'));
    const successUrl = `${frontendUrl}/credits/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/credits/cancel`;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `${pack.credits} Credits`,
            },
            unit_amount: pack.price,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        identityId: identityId,
        credits: pack.credits.toString(),
      },
    });

    return res.json({ ok: true, url: session.url });
  } catch (error) {
    logger.error('[Credits Routes] POST /credits/checkout-session error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, error.message || 'Failed to create checkout session');
  }
});

/**
 * POST /credits/webhook
 * Handles Stripe confirmation webhook
 * Requires raw body (must be registered before express.json() middleware)
 */
router.post('/webhook', async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      logger.error('[Credits Webhook] Stripe not configured');
      return httpErrors.serviceUnavailable(res, 'Stripe not configured');
    }

    const webhookSecret = requireEnv('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      logger.error('[Credits Webhook] Stripe webhook secret not configured');
      return httpErrors.serviceUnavailable(res, 'Stripe webhook secret not configured');
    }

    // Validate webhook signature
    let event;
    try {
      const signature = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      logger.error('[Credits Webhook] Signature verification failed', {
        error: err.message,
        stack: err.stack
      });
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const identityId = session.metadata?.identityId;
      const credits = parseInt(session.metadata?.credits, 10);

      if (!identityId) {
        logger.error('[Credits Webhook] No identityId found in session metadata', { sessionId: session.id });
        return httpErrors.validationFailed(res, 'identityId not found in session metadata');
      }

      if (!credits || credits <= 0) {
        logger.error('[Credits Webhook] Invalid credits amount in session metadata', {
          credits,
          sessionId: session.id
        });
        return httpErrors.invalidInput(res, 'Invalid credits amount');
      }

      // Add credits (addCredits already records the transaction)
      // addCredits signature: (identityId, amount, stripePaymentIntentId)
      const addResult = await creditsService.addCredits(identityId, credits, session.id);

      if (!addResult.success) {
        logger.error('[Credits Webhook] Failed to add credits', {
          error: addResult.error,
          identityId,
          credits,
          sessionId: session.id
        });
        return httpErrors.internalError(res, 'Failed to add credits');
      }

      logger.info('[Credits Webhook] Added credits', {
        credits,
        identityId,
        newBalance: addResult.newBalance,
        sessionId: session.id
      });
    }

    return res.json({ received: true });
  } catch (error) {
    logger.error('[Credits Webhook] Error processing webhook', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, 'Webhook processing failed');
  }
});

/**
 * POST /credits/purchase/webhook
 * Stripe webhook endpoint for credit pack purchases
 * Requires raw body (must be registered before express.json() middleware)
 */
router.post('/purchase/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;

    // Handle checkout.session.completed event
    if (type === 'checkout.session.completed') {
      const session = data.object;
      const email = session.customer_details?.email;
      const credits = session.metadata?.credits ? parseInt(session.metadata.credits) : null;

      if (!email) {
        logger.error('[Credits Webhook] No email found in checkout session', { sessionId: session.id });
        return httpErrors.validationFailed(res, 'Email not found in session');
      }

      if (!credits || credits <= 0) {
        logger.error('[Credits Webhook] Invalid credits amount in session metadata', {
          credits,
          email,
          sessionId: session.id
        });
        return httpErrors.invalidInput(res, 'Invalid credits amount');
      }

      // Add credits to user's account
      const addResult = await creditsService.addCreditsByEmail(
        email,
        credits,
        'purchase',
        session.id
      );

      if (!addResult.success) {
        logger.error('[Credits Webhook] Failed to add credits', {
          error: addResult.error,
          email,
          credits,
          sessionId: session.id
        });
        return httpErrors.internalError(res, 'Failed to add credits');
      }

      logger.info('[Credits Webhook] Added credits', {
        credits,
        email,
        newBalance: addResult.newBalance,
        sessionId: session.id
      });
      
      return res.json({
        ok: true,
        message: 'Credits added successfully',
        credits: credits,
        newBalance: addResult.newBalance,
      });
    }

    // For other event types, return success (we only care about checkout.session.completed)
    return res.json({ ok: true, message: 'Event type not handled' });
  } catch (error) {
    logger.error('[Credits Webhook] Error processing webhook', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, 'Webhook processing failed');
  }
});

/**
 * POST /credits/create-payment
 * Creates Stripe checkout session for credit pack purchase
 * Body: { packId: "pack_50" | "pack_200" | "pack_500" | "pack_1000", email: string }
 * Returns: { ok: true, clientSecret: null, sessionId: string, url: string }
 */
router.post('/create-payment', authenticateToken, creditsRateLimiter, async (req, res) => {
  try {
    const { packId, email: bodyEmail } = req.body;
    const email = bodyEmail || req.user?.email;

    if (!email) {
      return httpErrors.missingField(res, 'email');
    }

    if (!packId) {
      return httpErrors.missingField(res, 'packId');
    }

    // Map packId to packSize and credits
    // packId format: "pack_50", "pack_200", "pack_500", "pack_1000"
    const packIdMap = {
      'pack_50': { packSize: '50', credits: 50 },
      'pack_200': { packSize: '200', credits: 200 },
      'pack_500': { packSize: '500', credits: 500 },
      'pack_1000': { packSize: '1000', credits: 1000 },
    };

    const pack = packIdMap[packId];
    if (!pack) {
      return httpErrors.invalidInput(res, `Invalid packId. Must be one of: pack_50, pack_200, pack_500, pack_1000`);
    }

    // Map packSize to price ID
    const packSizeMap = {
      '50': {
        priceId: getEnv('CREDIT_PACK_50_PRICE_ID'),
        credits: 50,
      },
      '200': {
        priceId: getEnv('CREDIT_PACK_200_PRICE_ID'),
        credits: 200,
      },
      '500': {
        priceId: getEnv('CREDIT_PACK_500_PRICE_ID'),
        credits: 500,
      },
      '1000': {
        priceId: getEnv('CREDIT_PACK_1000_PRICE_ID'),
        credits: 1000,
      },
    };

    // Note: pack_500 may not be available if CREDIT_PACK_500_PRICE_ID is not configured

    const packConfig = packSizeMap[pack.packSize];
    if (!packConfig || !packConfig.priceId) {
      logger.error('[Credits Routes] Credit pack price ID not configured', { packSize: pack.packSize });
      return httpErrors.serviceUnavailable(res, `Credit pack price ID not configured for pack ${pack.packSize}`);
    }

    // Build success and cancel URLs
    const frontendUrl = getEnv('FRONTEND_URL', getEnv('FRONTEND_DASHBOARD_URL', 'http://localhost:3000'));
    const successUrl = `${frontendUrl}/credits/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/credits/cancel`;

    // Create checkout session
    const session = await createCreditPackCheckoutSession(
      email,
      packConfig.priceId,
      packConfig.credits,
      successUrl,
      cancelUrl
    );

    return res.json({
      ok: true,
      clientSecret: null, // Checkout Sessions don't have clientSecret
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    logger.error('[Credits Routes] POST /credits/create-payment error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, error.message || 'Failed to create checkout session');
  }
});

/**
 * POST /credits/purchase
 * Creates Stripe checkout session for credit pack purchase
 * Body: { priceId: string } or { packSize: "50" | "200" | "1000" }
 */
router.post('/purchase', authenticateToken, creditsRateLimiter, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return httpErrors.validationFailed(res, 'User email not found in token');
    }

    // Validate request payload with Zod
    const validation = purchaseSchema.safeParse(req.body);

    if (!validation.success) {
      return httpErrors.validationFailed(res, 'Request validation failed', validation.error.flatten());
    }

    const { priceId, packSize } = validation.data;

    // Map pack size to price ID if packSize is provided
    let actualPriceId = priceId;
    let credits = 0;

    if (packSize) {
      // Map pack size to price ID and credits amount
      const packMap = {
        '50': {
          priceId: getEnv('CREDIT_PACK_50_PRICE_ID'),
          credits: 50,
        },
        '200': {
          priceId: getEnv('CREDIT_PACK_200_PRICE_ID'),
          credits: 200,
        },
        '1000': {
          priceId: getEnv('CREDIT_PACK_1000_PRICE_ID'),
          credits: 1000,
        },
      };

      const pack = packMap[packSize];
      if (!pack || !pack.priceId) {
        return httpErrors.invalidInput(res, `Invalid pack size. Must be one of: 50, 200, 1000`);
      }

      actualPriceId = pack.priceId;
      credits = pack.credits;
    } else if (priceId) {
      // If priceId is provided, we need to determine credits from priceId
      // For now, we'll require packSize or extract from metadata
      // This is a fallback - ideally packSize should be provided
      return httpErrors.invalidInput(res, 'Either priceId or packSize must be provided. packSize is recommended.');
    } else {
      return httpErrors.invalidInput(res, 'Either priceId or packSize must be provided');
    }

    if (!actualPriceId) {
      logger.error('[Credits Routes] Credit pack price ID not configured');
      return httpErrors.serviceUnavailable(res, 'Credit pack price ID not configured');
    }

    // Build success and cancel URLs
    const frontendUrl = getEnv('FRONTEND_URL', getEnv('FRONTEND_DASHBOARD_URL', 'http://localhost:3000'));
    const successUrl = `${frontendUrl}/credits/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/credits/cancel`;

    // Create checkout session
    const session = await createCreditPackCheckoutSession(
      email,
      actualPriceId,
      credits,
      successUrl,
      cancelUrl
    );

    return res.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
      credits: credits,
    });
  } catch (error) {
    logger.error('[Credits Routes] POST /credits/purchase error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, error.message || 'Failed to create checkout session');
  }
});

/**
 * POST /credits/confirm
 * Confirms a credit purchase after checkout completion
 * Can be called by client after redirect or by webhook
 * Body: { sessionId: string }
 */
router.post('/confirm', authenticateToken, creditsRateLimiter, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return httpErrors.missingField(res, 'sessionId');
    }

    const stripe = getStripe();
    if (!stripe) {
      logger.error('[Credits Routes] Stripe not configured');
      return httpErrors.serviceUnavailable(res, 'Stripe not configured');
    }

    // Retrieve checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify payment succeeded
    if (session.payment_status !== 'paid') {
      return httpErrors.invalidInput(res, `Payment not completed. Status: ${session.payment_status}`);
    }

    // Get email from session
    const email = session.customer_details?.email || session.metadata?.user_email;
    if (!email) {
      return httpErrors.validationFailed(res, 'Email not found in checkout session');
    }

    // Get credits amount from metadata
    const credits = session.metadata?.credits ? parseInt(session.metadata.credits) : null;
    if (!credits || credits <= 0) {
      return httpErrors.invalidInput(res, 'Invalid credits amount in session metadata');
    }

    // Check if credits were already added (idempotency check)
    // We can check by looking for a transaction with this session ID
    const identityResult = await creditsService.getOrCreateIdentity(email.toLowerCase());
    if (!identityResult.success) {
      logger.error('[Credits Confirm] Failed to get/create identity', { error: identityResult.error, email });
      return httpErrors.internalError(res, 'Failed to get/create identity');
    }

    // Check for existing transaction with this session ID
    const { supabase } = require('../../db/supabase-client');
    const { data: existingTransaction } = await supabase
      .from('credits_transactions')
      .select('id')
      .eq('identity_id', identityResult.identityId)
      .eq('stripe_payment_intent_id', sessionId)
      .eq('transaction_type', 'purchase')
      .maybeSingle();

    if (existingTransaction) {
      // Credits already added, return success
      const balanceResult = await creditsService.getBalance(identityResult.identityId);
      return res.json({
        ok: true,
        message: 'Credits already added',
        credits: credits,
        balance: balanceResult.success ? balanceResult.balance : 0,
      });
    }

    // Add credits to user's account
    const addResult = await creditsService.addCreditsByEmail(
      email.toLowerCase(),
      credits,
      'purchase',
      sessionId
    );

    if (!addResult.success) {
      logger.error('[Credits Confirm] Failed to add credits', {
        error: addResult.error,
        email: email.toLowerCase(),
        credits,
        sessionId
      });
      return httpErrors.internalError(res, 'Failed to add credits');
    }

    logger.info('[Credits Confirm] Added credits', {
      credits,
      email: email.toLowerCase(),
      newBalance: addResult.newBalance,
      sessionId
    });

    return res.json({
      ok: true,
      message: 'Credits added successfully',
      credits: credits,
      balance: addResult.newBalance,
    });
  } catch (error) {
    logger.error('[Credits Routes] POST /credits/confirm error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, error.message || 'Failed to confirm credit purchase');
  }
});

module.exports = router;

