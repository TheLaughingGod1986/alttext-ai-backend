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

const router = express.Router();

/**
 * GET /me
 * Returns minimal user session data
 * Returns email and plugin from JWT payload (identity layer)
 * Must always return HTTP 200 to prevent blank dashboard
 */
router.get('/me', authenticateToken, (req, res) => {
  return res.status(200).json({
    ok: true,
    user: {
      email: req.user.email,
      plugin: req.user.plugin,
    },
  });
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

    return res.status(200).json({
      ok: true,
      ...payload,
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

