/**
 * Dashboard Service
 * Aggregates installations, subscriptions, and usage data for dashboard
 * Never throws - returns defaults on failure
 */

const { supabase } = require('../../db/supabase-client');
const usageService = require('./usageService');
const analyticsService = require('./analyticsService');

// In-memory cache for analytics data (5 minute TTL)
const analyticsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Get unified dashboard data for a user
 * Aggregates plugin installations, subscription, and usage
 * 
 * @param {string} email - User email address
 * @returns {Promise<Object>} Dashboard data with installations, subscription, and usage
 */
async function getDashboardData(email) {
  try {
    const emailLower = email.toLowerCase();

    // Fetch all data sources in parallel
    const [installationsResult, subscriptionResult, usageResult] = await Promise.all([
      // Plugin installations - query by email, ordered by last_seen_at DESC
      supabase
        .from('plugin_installations')
        .select('*')
        .eq('email', emailLower)
        .order('last_seen_at', { ascending: false }),
      
      // Subscription - query by email, get first subscription (allows all statuses including null for free plan)
      supabase
        .from('subscriptions')
        .select('*')
        .eq('user_email', emailLower)
        .order('created_at', { ascending: false })
        .limit(1),
      
      // Usage summary via usageService
      usageService.getUsageSummary(emailLower),
    ]);

    // Extract installations data or use empty array
    const installations = installationsResult.data || [];
    if (installationsResult.error && installationsResult.error.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine, log other errors
      console.error('[DashboardService] Error fetching installations:', installationsResult.error);
    }

    // Extract subscription data or use null
    // subscriptionResult.data is an array, get first element or null
    let subscription = null;
    if (subscriptionResult.data && Array.isArray(subscriptionResult.data) && subscriptionResult.data.length > 0) {
      subscription = subscriptionResult.data[0];
    } else if (subscriptionResult.data && !Array.isArray(subscriptionResult.data)) {
      // Handle case where data is a single object (shouldn't happen with limit(1) but be safe)
      subscription = subscriptionResult.data;
    } else if (subscriptionResult.error && subscriptionResult.error.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine, log other errors
      console.error('[DashboardService] Error fetching subscription:', subscriptionResult.error);
    }

    // Extract usage data or use defaults
    let usage = { monthlyImages: 0, dailyImages: 0, totalImages: 0 };
    if (usageResult.success && usageResult.usage) {
      // Preserve usageService format
      usage = {
        monthlyImages: usageResult.usage.monthlyImages || 0,
        dailyImages: usageResult.usage.dailyImages || 0,
        totalImages: usageResult.usage.totalImages || 0,
      };
    } else if (!usageResult.success) {
      console.error('[DashboardService] Error fetching usage:', usageResult.error);
    }

    // Log analytics event (background - don't block dashboard loading)
    analyticsService.logEventBackground({
      email: emailLower,
      eventName: 'dashboard_loaded',
      source: 'server',
      eventData: {
        installationsCount: installations.length,
        hasSubscription: !!subscription,
      },
    });

    return {
      installations,
      subscription,
      usage,
    };
  } catch (err) {
    console.error('[DashboardService] Aggregation error:', err);
    // Return defaults on error
    return {
      installations: [],
      subscription: null,
      usage: { monthlyImages: 0, dailyImages: 0, totalImages: 0 },
    };
  }
}

/**
 * Get analytics data for charts
 * Aggregates analytics events for time-series visualization
 * Includes caching layer for performance (5 minute TTL)
 * 
 * @param {string} email - User email address
 * @param {string} timeRange - Time range: '30d', '7d', '1d' (default: '30d')
 * @returns {Promise<Object>} Analytics data with usage, activations, and version distribution
 */
async function getAnalyticsData(email, timeRange = '30d') {
  try {
    const emailLower = email.toLowerCase();
    const cacheKey = `${emailLower}:${timeRange}`;
    
    // Check cache
    const cached = analyticsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.data;
    }

    // Calculate date range
    const days = timeRange === '7d' ? 7 : timeRange === '1d' ? 1 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateISO = startDate.toISOString();

    // Fetch analytics events in parallel
    const [eventsResult, installationsResult] = await Promise.all([
      // Analytics events for last N days
      supabase
        .from('analytics_events')
        .select('event_name, created_at, plugin_slug, event_data')
        .eq('email', emailLower)
        .gte('created_at', startDateISO)
        .order('created_at', { ascending: true }),
      
      // Plugin installations for activation rate
      supabase
        .from('plugin_installations')
        .select('id, created_at, plugin_slug, version')
        .eq('email', emailLower),
    ]);

    const events = eventsResult.data || [];
    const installations = installationsResult.data || [];

    // Process time-series usage data (last 30 days plugin usage)
    const usageByDate = new Map();
    const altTextGenerations = events.filter(e => 
      e.event_name === 'alt_text_generated' || 
      e.event_name === 'generate_alt_text' ||
      e.event_name === 'image_processed'
    );

    altTextGenerations.forEach(event => {
      const date = new Date(event.created_at).toISOString().split('T')[0];
      usageByDate.set(date, (usageByDate.get(date) || 0) + 1);
    });

    // Convert to array format for charts
    const usage = Array.from(usageByDate.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate activation rate (installations created in last 30 days / total installations)
    const recentInstallations = installations.filter(inst => {
      const instDate = new Date(inst.created_at);
      return instDate >= startDate;
    });
    const activationRate = installations.length > 0 
      ? (recentInstallations.length / installations.length) * 100 
      : 0;

    // Alt text generation counts
    const altTextCount = altTextGenerations.length;

    // Version distribution
    const versionMap = new Map();
    installations.forEach(inst => {
      const version = inst.version || 'unknown';
      versionMap.set(version, (versionMap.get(version) || 0) + 1);
    });
    const versions = Array.from(versionMap.entries())
      .map(([version, count]) => ({ version, count }))
      .sort((a, b) => b.count - a.count);

    const analyticsData = {
      usage,
      activations: {
        total: installations.length,
        recent: recentInstallations.length,
        rate: Math.round(activationRate * 100) / 100, // Round to 2 decimal places
      },
      altTextGenerations: altTextCount,
      versions,
      timeRange: days,
    };

    // Cache the result
    analyticsCache.set(cacheKey, {
      data: analyticsData,
      timestamp: Date.now(),
    });

    return analyticsData;
  } catch (err) {
    console.error('[DashboardService] Error fetching analytics data:', err);
    // Return defaults on error
    return {
      usage: [],
      activations: { total: 0, recent: 0, rate: 0 },
      altTextGenerations: 0,
      versions: [],
      timeRange: timeRange === '7d' ? 7 : timeRange === '1d' ? 1 : 30,
    };
  }
}

module.exports = {
  getDashboardData,
  getAnalyticsData,
};

