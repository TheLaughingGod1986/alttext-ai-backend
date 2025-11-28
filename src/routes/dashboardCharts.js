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

const router = express.Router();

/**
 * GET /dashboard/usage/daily
 * Returns 30 days of usage for a line chart
 * Response: { ok: true, days: [{ date: "YYYY-MM-DD", count: number }] }
 */
router.get('/dashboard/usage/daily', authenticateToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: 'User email not found in token',
      });
    }

    const days = await getDailyUsage(email);

    return res.status(200).json({
      ok: true,
      days,
    });
  } catch (err) {
    console.error('[DashboardCharts] GET /dashboard/usage/daily error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to load daily usage data',
    });
  }
});

/**
 * GET /dashboard/usage/monthly
 * Returns last 12 months aggregated
 * Response: { ok: true, months: [{ month: "YYYY-MM", count: number }] }
 */
router.get('/dashboard/usage/monthly', authenticateToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: 'User email not found in token',
      });
    }

    const months = await getMonthlyUsage(email);

    return res.status(200).json({
      ok: true,
      months,
    });
  } catch (err) {
    console.error('[DashboardCharts] GET /dashboard/usage/monthly error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to load monthly usage data',
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
        error: 'User email not found in token',
      });
    }

    const events = await getRecentEvents(email);

    return res.status(200).json({
      ok: true,
      events,
    });
  } catch (err) {
    console.error('[DashboardCharts] GET /dashboard/events/recent error:', err);
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
        error: 'User email not found in token',
      });
    }

    const plugins = await getPluginActivity(email);

    return res.status(200).json({
      ok: true,
      plugins,
    });
  } catch (err) {
    console.error('[DashboardCharts] GET /dashboard/plugins/activity error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to load plugin activity',
    });
  }
});

/**
 * GET /dashboard/charts
 * Aggregate all chart data in a single call
 * Response: { ok: true, daily: [...], monthly: [...], events: [...], plugins: [...] }
 */
router.get('/dashboard/charts', authenticateToken, async (req, res) => {
  try {
    const email = req.user?.email;

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: 'User email not found in token',
      });
    }

    const charts = await getDashboardCharts(email);

    return res.status(200).json({
      ok: true,
      ...charts,
    });
  } catch (err) {
    console.error('[DashboardCharts] GET /dashboard/charts error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to load dashboard charts data',
    });
  }
});

module.exports = router;

