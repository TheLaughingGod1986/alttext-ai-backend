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

const router = express.Router();

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
    console.error('[Dashboard] GET /me error:', error);
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
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: 'User email not found in token',
      });
    }

    const payload = await getIdentityDashboard(email);

    // Get subscription status and quota information
    const subscriptionResult = await billingService.getSubscriptionForEmail(email);
    let subscriptionStatus = 'none';
    let quotaRemaining = 0;
    let quotaUsed = 0;

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
          }));
      }
    } catch (err) {
      console.error('[Dashboard] Error fetching recent purchases:', err);
      // Continue without recent purchases
    }

    return res.status(200).json({
      ok: true,
      ...payload,
      subscriptionStatus,
      quotaRemaining,
      quotaUsed,
      credits: {
        balance: creditsBalance,
        recentPurchases: recentPurchases,
      },
    });
  } catch (err) {
    console.error('[Dashboard] GET /dashboard error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to load dashboard',
    });
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
      return res.status(400).json({
        ok: false,
        error: 'User email not found in token',
      });
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
    console.error('[Dashboard] GET /dashboard/analytics error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to load analytics data',
    });
  }
});

module.exports = router;

