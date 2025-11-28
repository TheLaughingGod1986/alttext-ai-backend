/**
 * Dashboard Charts Service
 * Provides chart-ready usage and activity data for dashboard visualizations
 * Never throws - returns defaults on failure
 */

const { supabase } = require('../../db/supabase-client');
const creditsService = require('./creditsService');

/**
 * Generate array of dates for a range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array<string>} Array of date strings in YYYY-MM-DD format
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Generate array of months for a range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array<string>} Array of month strings in YYYY-MM format
 */
function generateMonthRange(startDate, endDate) {
  const months = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const monthStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    if (!months.includes(monthStr)) {
      months.push(monthStr);
    }
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

/**
 * Get daily usage for last 30 days
 * @param {string} email - User email address
 * @returns {Promise<Array>} Array of { date: "YYYY-MM-DD", count: number }
 */
async function getDailyUsage(email) {
  try {
    const emailLower = email.toLowerCase();

    // Get identity_id from email
    const identityResult = await creditsService.getOrCreateIdentity(emailLower);
    if (!identityResult.success || !identityResult.identityId) {
      // Return empty array with all 30 days filled with 0
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 29); // 30 days total
      const dateRange = generateDateRange(startDate, endDate);
      return dateRange.map(date => ({ date, count: 0 }));
    }

    const identityId = identityResult.identityId;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 29); // 30 days total

    // Query usage_logs for last 30 days
    const { data: usageLogs, error } = await supabase
      .from('usage_logs')
      .select('created_at')
      .eq('identity_id', identityId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      console.error('[DashboardChartsService] Error fetching daily usage:', error);
      // Return empty array with all days filled with 0
      const dateRange = generateDateRange(startDate, endDate);
      return dateRange.map(date => ({ date, count: 0 }));
    }

    // Group by date
    const usageByDate = {};
    (usageLogs || []).forEach((log) => {
      const date = new Date(log.created_at).toISOString().split('T')[0];
      usageByDate[date] = (usageByDate[date] || 0) + 1;
    });

    // Fill in all 30 days (even if 0 count)
    const dateRange = generateDateRange(startDate, endDate);
    return dateRange.map((date) => ({
      date,
      count: usageByDate[date] || 0,
    }));
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getDailyUsage:', err);
    // Return empty array with all days filled with 0
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 29);
    const dateRange = generateDateRange(startDate, endDate);
    return dateRange.map(date => ({ date, count: 0 }));
  }
}

/**
 * Get monthly usage for last 12 months
 * @param {string} email - User email address
 * @returns {Promise<Array>} Array of { month: "YYYY-MM", count: number }
 */
async function getMonthlyUsage(email) {
  try {
    const emailLower = email.toLowerCase();

    // Get identity_id from email
    const identityResult = await creditsService.getOrCreateIdentity(emailLower);
    if (!identityResult.success) {
      // Return empty array with all 12 months filled with 0
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 11); // 12 months total
      startDate.setDate(1); // First day of month
      const monthRange = generateMonthRange(startDate, endDate);
      return monthRange.map(month => ({ month, count: 0 }));
    }

    const identityId = identityResult.identityId;
    if (!identityId) {
      // Return empty array with all 12 months filled with 0
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 11); // 12 months total
      startDate.setDate(1); // First day of month
      const monthRange = generateMonthRange(startDate, endDate);
      return monthRange.map(month => ({ month, count: 0 }));
    }
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 11); // 12 months total
    startDate.setDate(1); // First day of month

    // Query usage_logs for last 12 months
    const { data: usageLogs, error } = await supabase
      .from('usage_logs')
      .select('created_at')
      .eq('identity_id', identityId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      console.error('[DashboardChartsService] Error fetching monthly usage:', error);
      // Return empty array with all months filled with 0
      const monthRange = generateMonthRange(startDate, endDate);
      return monthRange.map(month => ({ month, count: 0 }));
    }

    // Group by month (YYYY-MM)
    const usageByMonth = {};
    (usageLogs || []).forEach((log) => {
      const date = new Date(log.created_at);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      usageByMonth[month] = (usageByMonth[month] || 0) + 1;
    });

    // Fill in all 12 months (even if 0 count)
    const monthRange = generateMonthRange(startDate, endDate);
    return monthRange.map((month) => ({
      month,
      count: usageByMonth[month] || 0,
    }));
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getMonthlyUsage:', err);
    // Return empty array with all months filled with 0
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 11);
    startDate.setDate(1);
    const monthRange = generateMonthRange(startDate, endDate);
    return monthRange.map(month => ({ month, count: 0 }));
  }
}

/**
 * Get recent analytics events (latest 50)
 * @param {string} email - User email address
 * @returns {Promise<Array>} Array of { event: string, created_at: "ISO8601", meta: {} }
 */
async function getRecentEvents(email) {
  try {
    const emailLower = email.toLowerCase();

    // Query analytics_events for latest 50 events
    const { data: events, error } = await supabase
      .from('analytics_events')
      .select('event_name, created_at, event_data')
      .eq('email', emailLower)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[DashboardChartsService] Error fetching recent events:', error);
      return [];
    }

    // Format events to match spec
    return (events || []).map((event) => ({
      event: event.event_name,
      created_at: event.created_at,
      meta: event.event_data || {},
    }));
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getRecentEvents:', err);
    return [];
  }
}

/**
 * Get plugin activity (sorted by last_seen_at DESC)
 * @param {string} email - User email address
 * @returns {Promise<Array>} Array of { plugin_slug: string, last_seen_at: "ISO8601", site_url: string }
 */
async function getPluginActivity(email) {
  try {
    const emailLower = email.toLowerCase();

    // Query plugin_installations
    const { data: installations, error } = await supabase
      .from('plugin_installations')
      .select('plugin_slug, last_seen_at, site_url')
      .eq('email', emailLower)
      .order('last_seen_at', { ascending: false });

    if (error) {
      console.error('[DashboardChartsService] Error fetching plugin activity:', error);
      return [];
    }

    // Format to match spec
    return (installations || []).map((installation) => ({
      plugin_slug: installation.plugin_slug,
      last_seen_at: installation.last_seen_at,
      site_url: installation.site_url || null,
    }));
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getPluginActivity:', err);
    return [];
  }
}

/**
 * Get all dashboard charts data (aggregates all functions)
 * @param {string} email - User email address
 * @returns {Promise<Object>} Object with daily, monthly, events, plugins arrays
 */
async function getDashboardCharts(email) {
  try {
    // Run all queries in parallel
    const [daily, monthly, events, plugins] = await Promise.all([
      getDailyUsage(email),
      getMonthlyUsage(email),
      getRecentEvents(email),
      getPluginActivity(email),
    ]);

    return {
      daily,
      monthly,
      events,
      plugins,
    };
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getDashboardCharts:', err);
    // Return empty arrays on error
    return {
      daily: [],
      monthly: [],
      events: [],
      plugins: [],
    };
  }
}

module.exports = {
  getDailyUsage,
  getMonthlyUsage,
  getRecentEvents,
  getPluginActivity,
  getDashboardCharts,
};

