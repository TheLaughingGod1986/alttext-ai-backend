/**
 * Subscription Check Middleware
 * Enforces subscription requirements before allowing API credit consumption
 * Returns 402 responses with standardized error codes if subscription checks fail
 * Falls back to credits check if no subscription exists
 */

const billingService = require('../services/billingService');
const usageService = require('../services/usageService');
const creditsService = require('../services/creditsService');
const eventService = require('../services/eventService');
const plansConfig = require('../config/plans');

/**
 * Middleware to check subscription status and quota
 * Only enforces subscription for authenticated users (req.user.email exists)
 * Allows unauthenticated requests to proceed (for site-based quota tracking)
 */
async function checkSubscription(req, res, next) {
  try {
    // Get user email from authenticated request
    // If no email, skip subscription check (allow site-based quota)
    const email = req.user?.email;
    if (!email) {
      // User not authenticated - allow to proceed for site-based quota
      return next();
    }

    const emailLower = email.toLowerCase();

    // Get service/plugin from request body or default to 'alttext-ai'
    const service = req.body?.service || 'alttext-ai';

    // Get subscription for email
    const subscriptionResult = await billingService.getSubscriptionForEmail(emailLower);
    
    if (!subscriptionResult.success) {
      // Error fetching subscription - try credits fallback
      return await checkCreditsFallback(req, res, next, emailLower);
    }

    const subscription = subscriptionResult.subscription;

    // No subscription found - check credits
    if (!subscription) {
      return await checkCreditsFallback(req, res, next, emailLower);
    }

    // Check if subscription is expired
    if (subscription.renews_at) {
      const renewsAt = new Date(subscription.renews_at);
      const now = new Date();
      
      if (renewsAt < now) {
        return res.status(402).json({
          ok: false,
          error: 'subscription_expired',
        });
      }
    }

    // Check subscription status
    if (subscription.status !== 'active') {
      // If status is not active, check credits as fallback
      return await checkCreditsFallback(req, res, next, emailLower);
    }

    // Get plan limits from config
    const plan = subscription.plan || 'free';
    const pluginConfig = plansConfig[service] || plansConfig['alttext-ai'];
    const planLimits = pluginConfig[plan] || pluginConfig.free;
    const limit = planLimits.tokens || 50;

    // Agency plan is unlimited
    if (plan === 'agency') {
      return next();
    }

    // Get usage summary
    const usageResult = await usageService.getUsageSummary(emailLower);
    
    if (!usageResult.success) {
      // On error fetching usage, be conservative and check credits
      return await checkCreditsFallback(req, res, next, emailLower);
    }

    const monthlyImages = usageResult.usage?.monthlyImages || 0;
    const remaining = Math.max(0, limit - monthlyImages);

    // Check if quota exceeded
    if (monthlyImages >= limit) {
      return res.status(402).json({
        ok: false,
        error: 'quota_exceeded',
        remaining: 0,
      });
    }

    // Subscription is valid and within quota
    return next();
  } catch (error) {
    console.error('[CheckSubscription] Exception in middleware:', error);
    // On exception, check credits as fallback
    const email = req.user?.email;
    if (email) {
      return await checkCreditsFallback(req, res, next, email.toLowerCase());
    }
    return res.status(500).json({
      ok: false,
      error: 'Subscription check failed',
    });
  }
}

/**
 * Check credits as fallback when no subscription exists
 * Uses event rollups to compute credit balance
 * Allows request if user has credits > 0 from events
 */
async function checkCreditsFallback(req, res, next, email) {
  try {
    // Get or create identity for credits
    const identityResult = await creditsService.getOrCreateIdentity(email);
    
    if (!identityResult.success) {
      // Can't create/get identity - require subscription
      return res.status(402).json({
        ok: false,
        error: 'subscription_required',
      });
    }

    // Check credit balance from events table (source of truth)
    const balanceResult = await eventService.getCreditBalance(identityResult.identityId);
    
    if (balanceResult.success && balanceResult.balance > 0) {
      // User has credits - set flag for credit deduction after successful generation
      req.useCredit = true;
      req.creditIdentityId = identityResult.identityId;
      // Allow request
      return next();
    }

    // No credits and no subscription - require subscription
    return res.status(402).json({
      ok: false,
      error: 'subscription_required',
    });
  } catch (error) {
    console.error('[CheckSubscription] Exception checking credits fallback:', error);
    // On error, require subscription
    return res.status(402).json({
      ok: false,
      error: 'subscription_required',
    });
  }
}

module.exports = checkSubscription;

