/**
 * Dashboard Routes
 * API endpoints for user dashboard data
 * Provides /me and /dashboard endpoints for frontend dashboard
 */

const express = require('express');
const { authenticateToken } = require('../../auth/jwt');
const { supabase } = require('../../db/supabase-client');
const { getIdentityDashboard } = require('../services/identityService');
const { getAnalyticsData } = require('../services/dashboardService');
const billingService = require('../services/billingService');
const creditsService = require('../services/creditsService');
const plansConfig = require('../config/plans');
const { errors: httpErrors } = require('../utils/http');
const logger = require('../utils/logger');

const router = express.Router();

// Simple in-memory cache for dashboard data
// Key: email, Value: { data, timestamp }
const dashboardCache = new Map();
const CACHE_TTL_MS = 45 * 1000; // 45 seconds (between 30-60 seconds as requested)

/**
 * Get cached dashboard data if available and not expired
 */
function getCachedDashboard(email) {
  const cached = dashboardCache.get(email);
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL_MS) {
    dashboardCache.delete(email);
    return null;
  }
  
  return cached.data;
}

/**
 * Set cached dashboard data
 */
function setCachedDashboard(email, data) {
  dashboardCache.set(email, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Clear cached dashboard data for a user (call after updates)
 */
function clearCachedDashboard(email) {
  dashboardCache.delete(email);
}

/**
 * GET /me
 * Returns minimal user session data with subscription summary
 * Returns email and plugin from JWT payload (identity layer)
 * Must always return HTTP 200 to prevent blank dashboard
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    
    if (!email) {
      return res.status(200).json({
        ok: true,
        user: {
          email: null,
          plugin: req.user.plugin || null,
        },
        subscription: null,
      });
    }

    // Get subscription for email
    const subscriptionResult = await billingService.getSubscriptionForEmail(email);
    
    let subscriptionData = null;
    if (subscriptionResult.success && subscriptionResult.subscription) {
      const subscription = subscriptionResult.subscription;
      const plan = subscription.plan || 'free';
      
      // Get plan limits from config (default to alttext-ai if plugin not specified)
      const plugin = req.user.plugin || 'alttext-ai';
      const pluginConfig = plansConfig[plugin] || plansConfig['alttext-ai'];
      const planLimits = pluginConfig[plan] || pluginConfig.free;
      const limit = planLimits.tokens || 50;

      subscriptionData = {
        plan: plan,
        limit: limit,
        renewsAt: subscription.renews_at || null,
        status: subscription.status || 'inactive',
      };
    }

    return res.status(200).json({
      ok: true,
      user: {
        email: email,
        plugin: req.user.plugin || null,
      },
      subscription: subscriptionData,
    });
  } catch (error) {
    logger.error('[Dashboard] GET /me error', { error: error.message });
    // Always return 200 to prevent blank dashboard
    return res.status(200).json({
      ok: true,
      user: {
        email: req.user.email || null,
        plugin: req.user.plugin || null,
      },
      subscription: null,
    });
  }
});

/**
 * GET /dashboard
 * Returns aggregated dashboard payload (installations + usage + subscription)
 * Uses identityService.getIdentityDashboard for identity layer integration
 * Cached for 45 seconds to reduce database load
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;

    if (!email) {
      return httpErrors.validationFailed(res, 'User email not found in token');
    }

    // Check cache first
    const cached = getCachedDashboard(email);
    if (cached) {
      return res.status(200).json(cached);
    }

    const payload = await getIdentityDashboard(email);

    // Get subscription status and quota information
    const subscriptionResult = await billingService.getSubscriptionForEmail(email);
    let subscriptionStatus = 'none';
    let quotaRemaining = 0;
    let quotaUsed = 0;

    let subscriptionData = null;
    if (subscriptionResult.success && subscriptionResult.subscription) {
      const subscription = subscriptionResult.subscription;
      
      // Check if subscription is expired
      if (subscription.renews_at) {
        const renewsAt = new Date(subscription.renews_at);
        const now = new Date();
        if (renewsAt < now) {
          subscriptionStatus = 'expired';
        } else {
          subscriptionStatus = subscription.status === 'active' ? 'active' : 'inactive';
        }
      } else {
        subscriptionStatus = subscription.status === 'active' ? 'active' : 'inactive';
      }

      // Get plan limits
      const plan = subscription.plan || 'free';
      const plugin = req.user.plugin || 'alttext-ai';
      const pluginConfig = plansConfig[plugin] || plansConfig['alttext-ai'];
      const planLimits = pluginConfig[plan] || pluginConfig.free;
      const limit = planLimits.tokens || 50;

      // Get usage
      const monthlyImages = payload.usage?.monthlyImages || 0;
      quotaUsed = monthlyImages;
      quotaRemaining = Math.max(0, limit - monthlyImages);

      // Build enhanced subscription data with renewal info
      // Check if metadata contains full Stripe subscription object
      const stripeSubscription = subscription.metadata?.stripe_subscription || null;
      const currentPeriodStart = stripeSubscription?.current_period_start 
        ? new Date(stripeSubscription.current_period_start * 1000).toISOString()
        : null;

      subscriptionData = {
        ...subscription,
        next_renewal: subscription.renews_at || null,
        // Use current_period_start from Stripe as last payment date (approximation)
        // Or use created_at if current_period_start not available
        last_payment: currentPeriodStart || subscription.created_at || null,
      };
    }

    // Get credits balance
    const creditsResult = await creditsService.getBalanceByEmail(email);
    const creditsBalance = creditsResult.success ? (creditsResult.balance || 0) : 0;

    // Get recent purchases (last 5 credit transactions of type 'purchase')
    let recentPurchases = [];
    try {
      const transactionsResult = await creditsService.getTransactionsByEmail(email, 1, 5);
      if (transactionsResult.success && transactionsResult.transactions) {
        recentPurchases = transactionsResult.transactions
          .filter(t => t.transaction_type === 'purchase')
          .slice(0, 5)
          .map(t => ({
            id: t.id,
            amount: t.amount,
            created_at: t.created_at,
            balance_after: t.balance_after,
            transaction_type: t.transaction_type,
          }));
      }
    } catch (err) {
      logger.error('[Dashboard] Error fetching recent purchases', { error: err.message });
      // Continue without recent purchases
    }

    // Get recent events (last 20 events) - optional
    let recentEvents = [];
    try {
      const identityResult = await creditsService.getOrCreateIdentity(email);
      if (identityResult.success && identityResult.identityId) {
        const { supabase } = require('../../db/supabase-client');
        const { data: events } = await supabase
          .from('events')
          .select('id, event_type, created_at, metadata, credits_delta')
          .eq('identity_id', identityResult.identityId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (events) {
          recentEvents = events.map(e => ({
            id: e.id,
            event_type: e.event_type,
            created_at: e.created_at,
            credits_delta: e.credits_delta,
            metadata: e.metadata || {},
          }));
        }
      }
    } catch (err) {
      logger.error('[Dashboard] Error fetching recent events', { error: err.message });
      // Continue without recent events
    }

    const response = {
      ok: true,
      ...payload,
      subscription: subscriptionData || payload.subscription,
      subscriptionStatus,
      quotaRemaining,
      quotaUsed,
      credits: {
        balance: creditsBalance,
        recentPurchases: recentPurchases,
      },
      recentEvents: recentEvents,
    };

    // Cache the response
    setCachedDashboard(email, response);

    return res.status(200).json(response);
  } catch (err) {
    logger.error('[Dashboard] GET /dashboard error', { error: err.message, stack: err.stack });
    return httpErrors.internalError(res, 'Failed to load dashboard', { code: 'DASHBOARD_ERROR' });
  }
});

/**
 * GET /dashboard/analytics
 * Returns chart-ready analytics data
 * Supports time-series data for last 30 days, 7 days, or 1 day
 */
router.get('/dashboard/analytics', authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;

    if (!email) {
      return httpErrors.validationFailed(res, 'User email not found in token');
    }

    // Get time range from query param (default: 30d)
    const timeRange = req.query.range || '30d';
    const validRanges = ['1d', '7d', '30d'];
    const finalRange = validRanges.includes(timeRange) ? timeRange : '30d';

    const analyticsData = await getAnalyticsData(email, finalRange);

    return res.status(200).json({
      ok: true,
      ...analyticsData,
    });
  } catch (err) {
    logger.error('[Dashboard] GET /dashboard/analytics error', { error: err.message, stack: err.stack });
    return httpErrors.internalError(res, 'Failed to load analytics data');
  }
});

/**
 * GET /me/licenses
 * Get all licenses for the authenticated user
 */
router.get('/me/licenses', authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    
    if (!email) {
      return httpErrors.missingField(res, 'User email');
    }

    // Get licenses linked to user_id first
    let licenses = [];
    try {
      const { data: userLicenses, error: userLicensesError } = await supabase
        .from('licenses')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

      if (!userLicensesError && userLicenses) {
        licenses = userLicenses;
      }

      // Also get licenses from sites linked to user's email via plugin_identities
      const { data: identities, error: identityError } = await supabase
        .from('plugin_identities')
        .select('site_url')
        .eq('email', email.toLowerCase());

      if (!identityError && identities && identities.length > 0) {
        const siteUrls = identities.map(i => i.site_url).filter(Boolean);
        if (siteUrls.length > 0) {
          const { data: sites, error: sitesError } = await supabase
            .from('sites')
            .select('license_key')
            .in('site_url', siteUrls)
            .not('license_key', 'is', null);

          if (!sitesError && sites && sites.length > 0) {
            const licenseKeys = [...new Set(sites.map(s => s.license_key).filter(Boolean))];
            if (licenseKeys.length > 0) {
              const { data: siteLicenses, error: siteLicensesError } = await supabase
                .from('licenses')
                .select('*')
                .in('license_key', licenseKeys)
                .order('created_at', { ascending: false });

              if (!siteLicensesError && siteLicenses) {
                // Merge and deduplicate by license_key
                const existingKeys = new Set(licenses.map(l => l.license_key));
                const newLicenses = siteLicenses.filter(l => !existingKeys.has(l.license_key));
                licenses = [...licenses, ...newLicenses];
              }
            }
          }
        }
      }
    } catch (err) {
      // Log error but return empty array instead of 500
      logger.error('[Dashboard] Error fetching licenses', {
        error: err.message,
        stack: err.stack
      });
    }

    return res.status(200).json({
      ok: true,
      licenses: licenses || [],
    });
  } catch (err) {
    logger.error('[Dashboard] GET /me/licenses error', {
      error: err.message,
      stack: err.stack
    });
    // Return empty array instead of 500 error for graceful degradation
    return res.status(200).json({
      ok: true,
      licenses: [],
    });
  }
});

/**
 * GET /me/sites
 * Get all sites for the authenticated user
 */
router.get('/me/sites', authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    
    if (!email) {
      return httpErrors.missingField(res, 'User email');
    }

    // Get sites linked to user via plugin_identities
    let sites = [];
    try {
      const { data: identities, error: identityError } = await supabase
        .from('plugin_identities')
        .select('site_url')
        .eq('email', email.toLowerCase());

      if (!identityError && identities) {
        // Get unique site URLs and fetch site data
        const siteUrls = [...new Set((identities || []).map(i => i.site_url).filter(Boolean))];
        
        if (siteUrls.length > 0) {
          const { data: sitesData, error: sitesError } = await supabase
            .from('sites')
            .select('*')
            .in('site_url', siteUrls)
            .order('created_at', { ascending: false });

          if (!sitesError && sitesData) {
            sites = sitesData || [];
          }
        }
      }
    } catch (err) {
      // Log error but return empty array instead of 500
      logger.error('[Dashboard] Error fetching sites', { error: err.message });
    }

    return res.status(200).json({
      ok: true,
      sites: sites,
    });
  } catch (err) {
    logger.error('[Dashboard] GET /me/sites error', { error: err.message });
    // Return empty array instead of 500 error for graceful degradation
    return res.status(200).json({
      ok: true,
      sites: [],
    });
  }
});

/**
 * GET /me/subscriptions
 * Get all subscriptions for the authenticated user
 */
router.get('/me/subscriptions', authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    
    if (!email) {
      return httpErrors.missingField(res, 'User email');
    }

    let subscriptions = [];
    try {
      const subscriptionResult = await billingService.getSubscriptionForEmail(email);
      
      if (subscriptionResult.success) {
        // Get all subscriptions for this email
        const { data: subsData, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_email', email.toLowerCase())
          .order('created_at', { ascending: false });

        if (!error && subsData) {
          subscriptions = subsData || [];
        }
      }
    } catch (err) {
      // Log error but return empty array instead of 500
      logger.error('[Dashboard] Error fetching subscriptions', { error: err.message });
    }

    return res.status(200).json({
      ok: true,
      subscriptions: subscriptions,
    });
  } catch (err) {
    logger.error('[Dashboard] GET /me/subscriptions error', { error: err.message });
    // Return empty array instead of 500 error for graceful degradation
    return res.status(200).json({
      ok: true,
      subscriptions: [],
    });
  }
});

/**
 * GET /me/invoices
 * Get all invoices for the authenticated user
 */
router.get('/me/invoices', authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    
    if (!email) {
      return httpErrors.missingField(res, 'User email');
    }

    let invoices = [];
    try {
      // Get Stripe customer ID from subscription
      const subscriptionResult = await billingService.getSubscriptionForEmail(email);
      
      if (subscriptionResult.success && subscriptionResult.subscription?.stripe_customer_id) {
        const stripe = require('../utils/stripeClient').getStripe();
        if (stripe) {
          // Fetch invoices from Stripe
          const invoicesResult = await stripe.invoices.list({
            customer: subscriptionResult.subscription.stripe_customer_id,
            limit: 100,
          });
          invoices = invoicesResult.data || [];
        }
      }
    } catch (err) {
      // Log error but return empty array instead of 500
      logger.error('[Dashboard] Error fetching invoices', { error: err.message });
    }

    return res.status(200).json({
      ok: true,
      invoices: invoices,
    });
  } catch (err) {
    logger.error('[Dashboard] GET /me/invoices error', { error: err.message });
    // Return empty array instead of 500 error for graceful degradation
    return res.status(200).json({
      ok: true,
      invoices: [],
    });
  }
});

module.exports = {
  router,
  clearCachedDashboard, // Export for use in other routes that update dashboard data
};

