/**
 * Dashboard Charts Routes
 * API endpoints for chart-ready usage and activity data
 * All endpoints require authentication
 */

const express = require('express');
const { authenticateToken } = require('../../auth/jwt');
const {
  getDailyUsage,
  getMonthlyUsage,
  getRecentEvents,
  getPluginActivity,
  getDashboardCharts,
} = require('../services/dashboardChartsService');
const billingService = require('../services/billingService');
const usageService = require('../services/usageService');
const plansConfig = require('../config/plans');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /dashboard/usage/daily
 * Returns 30 days of usage for a line chart (legacy format for backward compatibility)
 * Response: { ok: true, days: [{ date: "YYYY-MM-DD", count: number }] }
 */
router.get('/dashboard/usage/daily', authenticateToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        reason: 'validation_failed',
        message: 'User email not found in token',
      });
    }

    const dailyUsage = await getDailyUsage(email);
    // Transform new format to legacy format for backward compatibility
    const days = dailyUsage.map(day => ({
      date: day.date,
      count: day.images || 0, // Use images count as the count value
    }));

    return res.status(200).json({
      ok: true,
      days,
    });
  } catch (err) {
    logger.error('[DashboardCharts] GET /dashboard/usage/daily error', {
      error: err.message,
      stack: err.stack,
      email: req.user?.email
    });
    return res.status(500).json({
      ok: false,
      code: 'DASHBOARD_ERROR',
      reason: 'server_error',
      message: 'Failed to load daily usage data',
    });
  }
});

/**
 * GET /dashboard/usage/monthly
 * Returns last 12 months aggregated (legacy format for backward compatibility)
 * Response: { ok: true, months: [{ month: "YYYY-MM", count: number }] }
 */
router.get('/dashboard/usage/monthly', authenticateToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        reason: 'validation_failed',
        message: 'User email not found in token',
      });
    }

    const monthlyUsage = await getMonthlyUsage(email);
    // Transform new format to legacy format for backward compatibility
    const months = monthlyUsage.map(month => ({
      month: month.month,
      count: month.images || 0, // Use images count as the count value
    }));

    return res.status(200).json({
      ok: true,
      months,
    });
  } catch (err) {
    logger.error('[DashboardCharts] GET /dashboard/usage/monthly error', {
      error: err.message,
      stack: err.stack,
      email: req.user?.email
    });
    return res.status(500).json({
      ok: false,
      code: 'DASHBOARD_ERROR',
      reason: 'server_error',
      message: 'Failed to load monthly usage data',
    });
  }
});

/**
 * GET /dashboard/events/recent
 * Returns the most recent 50 analytics events for the activity feed
 * Response: { ok: true, events: [{ event: string, created_at: "ISO8601", meta: {} }] }
 */
router.get('/dashboard/events/recent', authenticateToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        reason: 'validation_failed',
        message: 'User email not found in token',
      });
    }

    const events = await getRecentEvents(email);

    return res.status(200).json({
      ok: true,
      events,
    });
  } catch (err) {
    logger.error('[DashboardCharts] GET /dashboard/events/recent error', {
      error: err.message,
      stack: err.stack,
      email: req.user?.email
    });
    return res.status(500).json({
      ok: false,
      error: 'Failed to load recent events',
    });
  }
});

/**
 * GET /dashboard/plugins/activity
 * Returns plugin activity sorted by last_seen_at DESC
 * Response: { ok: true, plugins: [{ plugin_slug: string, last_seen_at: "ISO8601", site_url: string }] }
 */
router.get('/dashboard/plugins/activity', authenticateToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        reason: 'validation_failed',
        message: 'User email not found in token',
      });
    }

    const plugins = await getPluginActivity(email);

    return res.status(200).json({
      ok: true,
      plugins,
    });
  } catch (err) {
    logger.error('[DashboardCharts] GET /dashboard/plugins/activity error', {
      error: err.message,
      stack: err.stack,
      email: req.user?.email
    });
    return res.status(500).json({
      ok: false,
      error: 'Failed to load plugin activity',
    });
  }
});

/**
 * GET /dashboard/charts
 * Aggregate all chart data in a single call (unified endpoint)
 * Response: { ok: true, charts: { dailyUsage, monthlyUsage, creditTrend, subscriptionHistory, installActivity, usageHeatmap, eventSummary } }
 * All chart arrays are always present (can be empty []) so frontend never has to null-check
 */
router.get('/dashboard/charts', authenticateToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: 'Missing user email',
        charts: {
          dailyUsage: [],
          monthlyUsage: [],
          creditTrend: [],
          subscriptionHistory: [],
          installActivity: [],
          usageHeatmap: [],
          eventSummary: [],
        },
      });
    }

    const result = await getDashboardCharts(email);

    if (!result.success) {
      return res.status(200).json({
        ok: false,
        charts: result.charts || {
          dailyUsage: [],
          monthlyUsage: [],
          creditTrend: [],
          subscriptionHistory: [],
          installActivity: [],
          usageHeatmap: [],
          eventSummary: [],
        },
        error: result.error || 'Failed to load dashboard charts',
        subscriptionStatus: 'none',
        quotaRemaining: 0,
        quotaUsed: 0,
      });
    }

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
      const usageResult = await usageService.getUsageSummary(email);
      if (usageResult.success) {
        const monthlyImages = usageResult.usage?.monthlyImages || 0;
        quotaUsed = monthlyImages;
        quotaRemaining = Math.max(0, limit - monthlyImages);
      }
    }

    return res.status(200).json({
      ok: true,
      charts: result.charts,
      subscriptionStatus,
      quotaRemaining,
      quotaUsed,
    });
  } catch (err) {
    logger.error('[DashboardCharts] GET /dashboard/charts error', {
      error: err.message,
      stack: err.stack,
      email: req.user?.email
    });
    return res.status(200).json({
      ok: false,
      charts: {
        dailyUsage: [],
        monthlyUsage: [],
        creditTrend: [],
        subscriptionHistory: [],
        installActivity: [],
        usageHeatmap: [],
        eventSummary: [],
      },
      error: 'Failed to load dashboard charts',
      subscriptionStatus: 'none',
      quotaRemaining: 0,
      quotaUsed: 0,
    });
  }
});

module.exports = router;

