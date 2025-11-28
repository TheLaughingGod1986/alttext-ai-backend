/**
 * Dashboard Service
 * Aggregates installations, subscriptions, and usage data for dashboard
 * Never throws - returns defaults on failure
 */

const { supabase } = require('../../db/supabase-client');
const usageService = require('./usageService');

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

module.exports = {
  getDashboardData,
};

