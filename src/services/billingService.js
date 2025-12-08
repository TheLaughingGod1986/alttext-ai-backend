/**
 * Billing Service
 * Handles Stripe customer and subscription management
 * Never throws - returns { success: false, error: '...' } on failure
 */

const { supabase } = require('../../db/supabase-client');
const { getStripe } = require('../utils/stripeClient');
const emailService = require('./emailService');
const usageService = require('./usageService');
const plansConfig = require('../config/plans');

// Simple in-memory cache for subscription lookups
// Key: email, Value: { data, timestamp }
const subscriptionCache = new Map();
const SUBSCRIPTION_CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Get cached subscription data if available and not expired
 */
function getCachedSubscription(email) {
  const cached = subscriptionCache.get(email);
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.timestamp > SUBSCRIPTION_CACHE_TTL_MS) {
    subscriptionCache.delete(email);
    return null;
  }
  
  return cached.data;
}

/**
 * Set cached subscription data
 */
function setCachedSubscription(email, data) {
  subscriptionCache.set(email, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Clear cached subscription data for a user (call after subscription updates)
 */
function clearCachedSubscription(email) {
  subscriptionCache.delete(email);
}

/**
 * Create or get Stripe customer for an email
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and customer data
 */
async function createOrGetCustomer(email) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe not configured' };
    }

    // Check if customer already exists in Stripe by email
    const customers = await stripe.customers.list({
      email: email.toLowerCase(),
      limit: 1,
    });

    if (customers.data.length > 0) {
      console.log(`[BillingService] Found existing Stripe customer for ${email}`);
      return {
        success: true,
        data: { customerId: customers.data[0].id, customer: customers.data[0] },
      };
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: email.toLowerCase(),
      metadata: {
        user_email: email.toLowerCase(),
      },
    });

    console.log(`[BillingService] Created new Stripe customer for ${email}: ${customer.id}`);
    return {
      success: true,
      data: { customerId: customer.id, customer },
    };
  } catch (error) {
    console.error('[BillingService] Error creating/getting customer:', error);
    return { success: false, error: error.message || 'Failed to create/get customer' };
  }
}

/**
 * Create a subscription for a user and plugin
 * @param {Object} params - Subscription parameters
 * @param {string} params.email - User email
 * @param {string} params.plugin - Plugin slug
 * @param {string} params.priceId - Stripe price ID
 * @returns {Promise<Object>} Result with success status and subscription data
 */
async function createSubscription({ email, plugin, priceId }) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe not configured' };
    }

    // Get or create customer
    const customerResult = await createOrGetCustomer(email);
    if (!customerResult.success) {
      return customerResult;
    }

    const customerId = customerResult.data.customerId;

    // Check if subscription already exists in database
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_email', email.toLowerCase())
      .eq('plugin_slug', plugin)
      .single();

    if (existing && existing.status === 'active') {
      console.log(`[BillingService] Active subscription already exists for ${email} and ${plugin}`);
      return {
        success: true,
        data: { subscription: existing, isNew: false },
      };
    }

    // Create subscription in Stripe
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata: {
        user_email: email.toLowerCase(),
        plugin_slug: plugin,
      },
    });

    // Determine plan from price ID (will be enhanced with plan config)
    const plan = 'pro'; // Default, will be determined from priceId mapping

    // Store subscription in database
    const subscriptionData = {
      user_email: email.toLowerCase(),
      plugin_slug: plugin,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      plan,
      status: subscription.status,
      quantity: subscription.items.data[0]?.quantity || 1,
      renews_at: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      metadata: {
        stripe_subscription: subscription,
      },
    };

    const { data: inserted, error } = await supabase
      .from('subscriptions')
      .upsert(subscriptionData, {
        onConflict: 'user_email,plugin_slug',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[BillingService] Error storing subscription:', error);
      return { success: false, error: error.message };
    }

    console.log(`[BillingService] Created subscription for ${email} and ${plugin}`);
    
    // Clear cache for this user
    clearCachedSubscription(email.toLowerCase());
    
    return {
      success: true,
      data: { subscription: inserted, isNew: true },
    };
  } catch (error) {
    console.error('[BillingService] Exception creating subscription:', error);
    return { success: false, error: error.message || 'Failed to create subscription' };
  }
}

/**
 * Cancel a subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Object>} Result with success status
 */
async function cancelSubscription(subscriptionId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe not configured' };
    }

    // Cancel in Stripe
    const subscription = await stripe.subscriptions.cancel(subscriptionId);

    // Get email from subscription before updating (for cache clearing)
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('user_email')
      .eq('stripe_subscription_id', subscriptionId)
      .single();

    // Update in database
    const { error } = await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscriptionId);

    if (error) {
      console.error('[BillingService] Error updating canceled subscription:', error);
      // Don't fail if DB update fails - Stripe cancellation succeeded
    }

    // Clear cache for this user
    if (existingSub?.user_email) {
      clearCachedSubscription(existingSub.user_email.toLowerCase());
    }

    console.log(`[BillingService] Canceled subscription ${subscriptionId}`);
    return { success: true, data: { subscription } };
  } catch (error) {
    console.error('[BillingService] Exception canceling subscription:', error);
    return { success: false, error: error.message || 'Failed to cancel subscription' };
  }
}

/**
 * Update subscription quantity
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {number} quantity - New quantity
 * @returns {Promise<Object>} Result with success status
 */
async function updateSubscriptionQuantity(subscriptionId, quantity) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe not configured' };
    }

    // Get subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Update quantity
    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          quantity,
        },
      ],
    });

    // Update in database
    const { error } = await supabase
      .from('subscriptions')
      .update({
        quantity,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscriptionId);

    if (error) {
      console.error('[BillingService] Error updating subscription quantity:', error);
    }

    console.log(`[BillingService] Updated subscription ${subscriptionId} quantity to ${quantity}`);
    return { success: true, data: { subscription: updated } };
  } catch (error) {
    console.error('[BillingService] Exception updating subscription quantity:', error);
    return { success: false, error: error.message || 'Failed to update subscription quantity' };
  }
}

/**
 * Sync subscription state from Stripe webhook event
 * @param {Object} stripeEvent - Stripe event object
 * @returns {Promise<Object>} Result with success status
 */
async function syncSubscriptionFromWebhook(stripeEvent) {
  try {
    const subscription = stripeEvent.data.object;
    const subscriptionId = subscription.id;
    const customerId = subscription.customer;

    // Get customer email from Stripe
    const stripe = getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe not configured' };
    }

    const customer = await stripe.customers.retrieve(customerId);
    if (!customer) {
      return { success: false, error: 'Customer not found' };
    }
    const email = customer.email?.toLowerCase();

    if (!email) {
      return { success: false, error: 'Customer email not found' };
    }

    // Validate subscription ID
    if (!subscriptionId) {
      // In test/webhook scenarios we may get events without subscription IDs; skip gracefully
      console.warn('[BillingService] Missing subscriptionId in webhook event, skipping sync');
      return { success: true, data: null };
    }

    // Determine plugin from metadata or subscription items
    const pluginSlug = subscription.metadata?.plugin_slug || 'alttext-ai'; // Default
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const plan = 'pro'; // Will be determined from priceId mapping

    // Update or insert subscription
    const subscriptionData = {
      user_email: email,
      plugin_slug: pluginSlug,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      plan,
      status: subscription.status,
      quantity: subscription.items?.data?.[0]?.quantity || 1,
      renews_at: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      canceled_at: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : null,
      metadata: {
        stripe_subscription: subscription,
        webhook_event: stripeEvent.type,
      },
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error } = await supabase
      .from('subscriptions')
      .upsert(subscriptionData, {
        onConflict: 'user_email,plugin_slug',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[BillingService] Error syncing subscription from webhook:', error);
      return { success: false, error: error.message };
    }

    // Clear cache for this user
    clearCachedSubscription(email);
    
    console.log(`[BillingService] Synced subscription ${subscriptionId} from webhook`);
    return { success: true, data: { subscription: inserted } };
  } catch (error) {
    console.error('[BillingService] Exception syncing subscription from webhook:', error);
    return { success: false, error: error.message || 'Failed to sync subscription' };
  }
}

/**
 * Get subscription status for an email (standardized format for access control)
 * Returns subscription in a consistent format for access control decisions
 * @param {string} email - User email address
 * @returns {Promise<Object>} Standardized subscription status object
 */
async function getUserSubscriptionStatus(email) {
  try {
    const emailLower = email.toLowerCase();
    
    // Get the most recent subscription (any status)
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_email', emailLower)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        // No subscription found - return free plan
        return {
          plan: 'free',
          status: 'inactive',
          renewsAt: null,
          canceledAt: null,
          trialEndsAt: null,
          raw: null,
        };
      }
      console.error('[BillingService] Error fetching subscription status:', error);
      // On error, return free plan (fail-safe)
      return {
        plan: 'free',
        status: 'inactive',
        renewsAt: null,
        canceledAt: null,
        trialEndsAt: null,
        raw: null,
      };
    }

    // No subscription found
    if (!data) {
      return {
        plan: 'free',
        status: 'inactive',
        renewsAt: null,
        canceledAt: null,
        trialEndsAt: null,
        raw: null,
      };
    }

    // Normalize status
    let status = data.status || 'inactive';
    if (status === 'trialing') {
      status = 'active'; // Treat trialing as active
    } else if (status === 'past_due' || status === 'unpaid') {
      status = 'past_due';
    } else if (status === 'canceled' || status === 'cancelled') {
      status = 'cancelled';
    } else if (status !== 'active') {
      status = 'inactive';
    }

    // Extract dates
    const renewsAt = data.renews_at ? new Date(data.renews_at).toISOString() : null;
    const canceledAt = data.canceled_at ? new Date(data.canceled_at).toISOString() : null;
    const trialEndsAt = data.trial_ends_at ? new Date(data.trial_ends_at).toISOString() : null;

    return {
      plan: data.plan || 'free',
      status: status,
      renewsAt: renewsAt,
      canceledAt: canceledAt,
      trialEndsAt: trialEndsAt,
      raw: data,
    };
  } catch (error) {
    console.error('[BillingService] Exception getting subscription status:', error);
    // Fail-safe: return free plan
    return {
      plan: 'free',
      status: 'inactive',
      renewsAt: null,
      canceledAt: null,
      trialEndsAt: null,
      raw: null,
    };
  }
}

/**
 * Get subscription for an email (returns first active subscription)
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and subscription data
 */
async function getSubscriptionForEmail(email) {
  try {
    const emailLower = email.toLowerCase();
    
    // Check cache first
    const cached = getCachedSubscription(emailLower);
    if (cached) {
      return cached;
    }
    
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_email', emailLower)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let result;
    if (error) {
      if (error.code === 'PGRST116') {
        // No subscription found
        result = { success: true, subscription: null };
      } else {
        console.error('[BillingService] Error fetching subscription:', error);
        result = { success: false, error: error.message, subscription: null };
      }
    } else {
      result = { success: true, subscription: data || null };
    }

    // Cache the result (even errors are cached to avoid repeated DB calls)
    setCachedSubscription(emailLower, result);
    
    return result;
  } catch (error) {
    console.error('[BillingService] Exception fetching subscription:', error);
    return { success: false, error: error.message, subscription: null };
  }
}

/**
 * Get all subscriptions for a user
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and subscriptions array
 */
async function getUserSubscriptions(email) {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_email', email.toLowerCase())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[BillingService] Error fetching subscriptions:', error);
      return { success: false, error: error.message, subscriptions: [] };
    }

    return { success: true, subscriptions: data || [] };
  } catch (error) {
    console.error('[BillingService] Exception fetching subscriptions:', error);
    return { success: false, error: error.message, subscriptions: [] };
  }
}

/**
 * Get subscription for a specific plugin
 * @param {string} email - User email address
 * @param {string} plugin - Plugin slug
 * @returns {Promise<Object>} Result with success status and subscription
 */
async function getSubscriptionByPlugin(email, plugin) {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_email', email.toLowerCase())
      .eq('plugin_slug', plugin)
      .eq('status', 'active')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No subscription found
        return { success: true, subscription: null };
      }
      console.error('[BillingService] Error fetching subscription:', error);
      return { success: false, error: error.message, subscription: null };
    }

    return { success: true, subscription: data };
  } catch (error) {
    console.error('[BillingService] Exception fetching subscription:', error);
    return { success: false, error: error.message, subscription: null };
  }
}

/**
 * List subscriptions for a user (alias for getUserSubscriptions)
 * Added for consistency with plan naming
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and subscriptions array
 */
async function listSubscriptions(email) {
  return getUserSubscriptions(email);
}

/**
 * Check subscription for a user and plugin
 * Returns subscription tier and limits
 * @param {string} email - User email address
 * @param {string} plugin - Plugin slug (default: 'alttext-ai')
 * @returns {Promise<Object>} Result with subscription tier, plan, and limits
 */
async function checkSubscription(email, plugin = 'alttext-ai') {
  try {
    const emailLower = email.toLowerCase();
    
    // Get active subscription for this plugin
    const subscriptionResult = await getSubscriptionByPlugin(emailLower, plugin);
    
    if (!subscriptionResult.success) {
      return {
        success: false,
        error: subscriptionResult.error,
        tier: 'free',
        plan: 'free',
        limits: plansConfig[plugin]?.free || { tokens: 50 },
      };
    }

    const subscription = subscriptionResult.subscription;
    
    // If no active subscription, return free tier
    if (!subscription || subscription.status !== 'active') {
      return {
        success: true,
        tier: 'free',
        plan: 'free',
        limits: plansConfig[plugin]?.free || { tokens: 50 },
        subscription: null,
      };
    }

    // Get plan limits from config
    const plan = subscription.plan || 'free';
    const pluginConfig = plansConfig[plugin] || plansConfig['alttext-ai'];
    const planLimits = pluginConfig[plan] || pluginConfig.free;

    return {
      success: true,
      tier: plan,
      plan: plan,
      limits: planLimits,
      subscription: subscription,
    };
  } catch (error) {
    console.error('[BillingService] Exception checking subscription:', error);
    return {
      success: false,
      error: error.message,
      tier: 'free',
      plan: 'free',
      limits: plansConfig[plugin]?.free || { tokens: 50 },
    };
  }
}

/**
 * Enforce subscription limits for a user
 * Checks current usage against plan limits
 * @param {string} email - User email address
 * @param {string} plugin - Plugin slug (default: 'alttext-ai')
 * @param {number} requestedCount - Number of images requested (default: 1)
 * @returns {Promise<Object>} Result with allowed status, remaining, and limit
 */
async function enforceSubscriptionLimits(email, plugin = 'alttext-ai', requestedCount = 1) {
  try {
    const emailLower = email.toLowerCase();
    
    // Get subscription info
    const subscriptionCheck = await checkSubscription(emailLower, plugin);
    
    if (!subscriptionCheck.success) {
      // On error, default to free tier limits
      const freeLimits = plansConfig[plugin]?.free || { tokens: 50 };
      return {
        allowed: false,
        remaining: 0,
        limit: freeLimits.tokens,
        plan: 'free',
        error: subscriptionCheck.error,
      };
    }

    const { tier, plan, limits } = subscriptionCheck;
    
    // Agency plan is unlimited
    if (plan === 'agency') {
      return {
        allowed: true,
        remaining: Infinity,
        limit: Infinity,
        plan: 'agency',
        unlimited: true,
      };
    }

    // Get current usage
    const usageResult = await usageService.getUsageSummary(emailLower);
    
    if (!usageResult.success) {
      // On error, be conservative and deny
      return {
        allowed: false,
        remaining: 0,
        limit: limits.tokens || 50,
        plan: plan,
        error: usageResult.error,
      };
    }

    const monthlyImages = usageResult.usage?.monthlyImages || 0;
    const limit = limits.tokens || 50;
    const remaining = Math.max(0, limit - monthlyImages);
    const allowed = remaining >= requestedCount;

    return {
      allowed,
      remaining,
      limit,
      plan: plan,
      used: monthlyImages,
    };
  } catch (error) {
    console.error('[BillingService] Exception enforcing subscription limits:', error);
    // On error, be conservative and deny
    const freeLimits = plansConfig[plugin]?.free || { tokens: 50 };
    return {
      allowed: false,
      remaining: 0,
      limit: freeLimits.tokens,
      plan: 'free',
      error: error.message,
    };
  }
}

module.exports = {
  createOrGetCustomer,
  createSubscription,
  cancelSubscription,
  updateSubscriptionQuantity,
  syncSubscriptionFromWebhook,
  getSubscriptionForEmail,
  getUserSubscriptionStatus,
  getUserSubscriptions,
  listSubscriptions, // Alias for getUserSubscriptions
  getSubscriptionByPlugin,
  checkSubscription,
  enforceSubscriptionLimits,
  clearCachedSubscription, // Export for external cache clearing if needed
};

