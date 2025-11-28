/**
 * Dashboard Charts Service
 * Provides chart-ready usage and activity data for dashboard visualizations
 * Never throws - returns defaults on failure
 */

const { supabase } = require('../../db/supabase-client');
const creditsService = require('./creditsService');

// Approximate tokens per image (if not available in usage_logs metadata)
const DEFAULT_TOKENS_PER_IMAGE = 100;

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
 * Extract token count from usage log metadata
 * @param {Object} log - Usage log entry
 * @returns {number} Token count
 */
function extractTokensFromLog(log) {
  // Try to get tokens from metadata if available
  if (log.metadata && typeof log.metadata === 'object') {
    if (log.metadata.tokens && typeof log.metadata.tokens === 'number') {
      return log.metadata.tokens;
    }
    if (log.metadata.usage && log.metadata.usage.total_tokens) {
      return log.metadata.usage.total_tokens;
    }
  }
  // Default: approximate tokens per image
  return DEFAULT_TOKENS_PER_IMAGE;
}

/**
 * Get daily usage for last 30 days (unified format with images and tokens)
 * @param {string} email - User email address
 * @returns {Promise<Array>} Array of { date: "YYYY-MM-DD", images: number, tokens: number }
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
      return dateRange.map(date => ({ date, images: 0, tokens: 0 }));
    }

    const identityId = identityResult.identityId;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 29); // 30 days total

    // Query usage_logs for last 30 days - include metadata if available
    const { data: usageLogs, error } = await supabase
      .from('usage_logs')
      .select('created_at, metadata')
      .eq('identity_id', identityId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      console.error('[DashboardChartsService] Error fetching daily usage:', error);
      // Return empty array with all days filled with 0
      const dateRange = generateDateRange(startDate, endDate);
      return dateRange.map(date => ({ date, images: 0, tokens: 0 }));
    }

    // Group by date and calculate images and tokens
    const usageByDate = {};
    (usageLogs || []).forEach((log) => {
      const date = new Date(log.created_at).toISOString().split('T')[0];
      if (!usageByDate[date]) {
        usageByDate[date] = { images: 0, tokens: 0 };
      }
      usageByDate[date].images += 1;
      usageByDate[date].tokens += extractTokensFromLog(log);
    });

    // Fill in all 30 days (even if 0 count)
    const dateRange = generateDateRange(startDate, endDate);
    return dateRange.map((date) => ({
      date,
      images: usageByDate[date]?.images || 0,
      tokens: usageByDate[date]?.tokens || 0,
    }));
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getDailyUsage:', err);
    // Return empty array with all days filled with 0
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 29);
    const dateRange = generateDateRange(startDate, endDate);
    return dateRange.map(date => ({ date, images: 0, tokens: 0 }));
  }
}

/**
 * Get monthly usage for last 12 months (unified format with images and tokens)
 * @param {string} email - User email address
 * @returns {Promise<Array>} Array of { month: "YYYY-MM", images: number, tokens: number }
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
      return monthRange.map(month => ({ month, images: 0, tokens: 0 }));
    }

    const identityId = identityResult.identityId;
    if (!identityId) {
      // Return empty array with all 12 months filled with 0
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 11); // 12 months total
      startDate.setDate(1); // First day of month
      const monthRange = generateMonthRange(startDate, endDate);
      return monthRange.map(month => ({ month, images: 0, tokens: 0 }));
    }
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 11); // 12 months total
    startDate.setDate(1); // First day of month

    // Query usage_logs for last 12 months - include metadata if available
    const { data: usageLogs, error } = await supabase
      .from('usage_logs')
      .select('created_at, metadata')
      .eq('identity_id', identityId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      console.error('[DashboardChartsService] Error fetching monthly usage:', error);
      // Return empty array with all months filled with 0
      const monthRange = generateMonthRange(startDate, endDate);
      return monthRange.map(month => ({ month, images: 0, tokens: 0 }));
    }

    // Group by month (YYYY-MM) and calculate images and tokens
    const usageByMonth = {};
    (usageLogs || []).forEach((log) => {
      const date = new Date(log.created_at);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!usageByMonth[month]) {
        usageByMonth[month] = { images: 0, tokens: 0 };
      }
      usageByMonth[month].images += 1;
      usageByMonth[month].tokens += extractTokensFromLog(log);
    });

    // Fill in all 12 months (even if 0 count)
    const monthRange = generateMonthRange(startDate, endDate);
    return monthRange.map((month) => ({
      month,
      images: usageByMonth[month]?.images || 0,
      tokens: usageByMonth[month]?.tokens || 0,
    }));
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getMonthlyUsage:', err);
    // Return empty array with all months filled with 0
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 11);
    startDate.setDate(1);
    const monthRange = generateMonthRange(startDate, endDate);
    return monthRange.map(month => ({ month, images: 0, tokens: 0 }));
  }
}

/**
 * Get credit trend over time
 * @param {string} email - User email address
 * @returns {Promise<Array>} Array of { date: "YYYY-MM-DD", creditsRemaining: number, plan: string }
 */
async function getCreditTrend(email) {
  try {
    const emailLower = email.toLowerCase();

    // Get identity_id and current plan
    const identityResult = await creditsService.getOrCreateIdentity(emailLower);
    if (!identityResult.success || !identityResult.identityId) {
      return [];
    }

    const identityId = identityResult.identityId;

    // Get current identity info for plan
    const { data: identity, error: identityError } = await supabase
      .from('identities')
      .select('credits_balance')
      .eq('id', identityId)
      .single();

    if (identityError) {
      console.error('[DashboardChartsService] Error fetching identity:', identityError);
      return [];
    }

    // Get current plan from subscriptions
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_email', emailLower)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const currentPlan = subscription?.plan || 'free';

    // Query credit transactions for last 30 days to build trend
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 29); // 30 days

    const { data: transactions, error: transError } = await supabase
      .from('credits_transactions')
      .select('created_at, balance_after')
      .eq('identity_id', identityId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true });

    if (transError) {
      console.error('[DashboardChartsService] Error fetching credit transactions:', transError);
      // Return current balance as single point
      return [{
        date: endDate.toISOString().split('T')[0],
        creditsRemaining: identity?.credits_balance || 0,
        plan: currentPlan,
      }];
    }

    // Build trend from transactions
    const trendMap = {};
    const dateRange = generateDateRange(startDate, endDate);

    // Start with current balance
    trendMap[endDate.toISOString().split('T')[0]] = {
      creditsRemaining: identity?.credits_balance || 0,
      plan: currentPlan,
    };

    // Work backwards from transactions
    if (transactions && transactions.length > 0) {
      transactions.forEach((trans) => {
        const date = new Date(trans.created_at).toISOString().split('T')[0];
        trendMap[date] = {
          creditsRemaining: trans.balance_after || 0,
          plan: currentPlan,
        };
      });
    }

    // Fill in date range with interpolated values
    return dateRange.map((date) => {
      if (trendMap[date]) {
        return {
          date,
          creditsRemaining: trendMap[date].creditsRemaining,
          plan: trendMap[date].plan,
        };
      }
      // Use most recent known value or current balance
      const knownDates = Object.keys(trendMap).sort().reverse();
      const mostRecentDate = knownDates.find(d => d <= date);
      return {
        date,
        creditsRemaining: mostRecentDate ? trendMap[mostRecentDate].creditsRemaining : (identity?.credits_balance || 0),
        plan: currentPlan,
      };
    });
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getCreditTrend:', err);
    return [];
  }
}

/**
 * Get subscription history events
 * @param {string} email - User email address
 * @returns {Promise<Array>} Array of { date: "YYYY-MM-DD", plan: string, event: string }
 */
async function getSubscriptionHistory(email) {
  try {
    const emailLower = email.toLowerCase();

    // Query subscriptions table
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('plan, status, created_at, updated_at, canceled_at')
      .eq('user_email', emailLower)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[DashboardChartsService] Error fetching subscriptions:', error);
      return [];
    }

    if (!subscriptions || subscriptions.length === 0) {
      return [];
    }

    const events = [];

    // Track plan changes to detect upgrades/downgrades
    let previousPlan = null;
    subscriptions.forEach((sub, index) => {
      const createdDate = new Date(sub.created_at).toISOString().split('T')[0];
      const plan = sub.plan || 'free';

      // Started event
      if (index === 0 || (index > 0 && subscriptions[index - 1].status !== 'active')) {
        events.push({
          date: createdDate,
          plan: plan,
          event: 'started',
        });
      }

      // Upgrade/downgrade detection (simplified - compare with previous)
      if (index > 0 && previousPlan) {
        const planLevels = { free: 0, pro: 1, business: 2, agency: 3 };
        const currentLevel = planLevels[plan] || 0;
        const previousLevel = planLevels[previousPlan] || 0;

        if (currentLevel > previousLevel) {
          events.push({
            date: createdDate,
            plan: plan,
            event: 'upgraded',
          });
        } else if (currentLevel < previousLevel && currentLevel > 0) {
          events.push({
            date: createdDate,
            plan: plan,
            event: 'downgraded',
          });
        }
      }

      // Cancelled event
      if (sub.canceled_at) {
        const canceledDate = new Date(sub.canceled_at).toISOString().split('T')[0];
        events.push({
          date: canceledDate,
          plan: plan,
          event: 'cancelled',
        });
      }

      previousPlan = plan;
    });

    // Sort by date
    return events.sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getSubscriptionHistory:', err);
    return [];
  }
}

/**
 * Get install activity by date and plugin
 * @param {string} email - User email address
 * @returns {Promise<Array>} Array of { date: "YYYY-MM-DD", plugin: string, installs: number }
 */
async function getInstallActivity(email) {
  try {
    const emailLower = email.toLowerCase();

    // Query plugin_installations
    const { data: installations, error } = await supabase
      .from('plugin_installations')
      .select('plugin_slug, created_at')
      .eq('email', emailLower)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[DashboardChartsService] Error fetching installations:', error);
      return [];
    }

    if (!installations || installations.length === 0) {
      return [];
    }

    // Group by date and plugin
    const activityMap = {};
    installations.forEach((inst) => {
      const date = new Date(inst.created_at).toISOString().split('T')[0];
      const key = `${date}:${inst.plugin_slug}`;
      if (!activityMap[key]) {
        activityMap[key] = {
          date,
          plugin: inst.plugin_slug,
          installs: 0,
        };
      }
      activityMap[key].installs += 1;
    });

    // Convert to array and sort by date
    return Object.values(activityMap).sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getInstallActivity:', err);
    return [];
  }
}

/**
 * Get analytics charts (heatmap and event summary)
 * @param {string} email - User email address
 * @returns {Promise<Object>} Object with { heatmap: [...], eventSummary: [...] }
 */
async function getAnalyticsCharts(email) {
  try {
    const emailLower = email.toLowerCase();

    // Get identity_id for better querying
    const identityResult = await creditsService.getOrCreateIdentity(emailLower);
    if (!identityResult.success) {
      return { heatmap: [], eventSummary: [] };
    }

    // Query analytics_events for last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 29);

    const { data: events, error } = await supabase
      .from('analytics_events')
      .select('event_name, created_at')
      .eq('email', emailLower)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      console.error('[DashboardChartsService] Error fetching analytics events:', error);
      return { heatmap: [], eventSummary: [] };
    }

    // Build heatmap: group by weekday (0-6, Sunday-Saturday) and hour (0-23)
    const heatmapMap = {};
    (events || []).forEach((event) => {
      const eventDate = new Date(event.created_at);
      const weekday = eventDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const hour = eventDate.getHours();

      const key = `${weekday}:${hour}`;
      if (!heatmapMap[key]) {
        heatmapMap[key] = { weekday, hour, events: 0 };
      }
      heatmapMap[key].events += 1;
    });

    const heatmap = Object.values(heatmapMap);

    // Build event summary: group by event_name
    const eventSummaryMap = {};
    (events || []).forEach((event) => {
      const eventType = event.event_name || 'unknown';
      if (!eventSummaryMap[eventType]) {
        eventSummaryMap[eventType] = { eventType, count: 0 };
      }
      eventSummaryMap[eventType].count += 1;
    });

    const eventSummary = Object.values(eventSummaryMap).sort((a, b) => b.count - a.count);

    return { heatmap, eventSummary };
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getAnalyticsCharts:', err);
    return { heatmap: [], eventSummary: [] };
  }
}

/**
 * Get recent analytics events (latest 50) - legacy format
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

    // Format events to match spec and ensure max 50 events
    const limitedEvents = (events || []).slice(0, 50);
    return limitedEvents.map((event) => ({
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
 * Get plugin activity (sorted by last_seen_at DESC) - legacy format
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
 * Get all dashboard charts data (unified structure)
 * @param {string} email - User email address
 * @returns {Promise<Object>} Object with success status and charts object
 */
async function getDashboardCharts(email) {
  try {
    // Run all queries in parallel
    const [dailyUsage, monthlyUsage, creditTrend, subscriptionHistory, installActivity, analyticsCharts] = await Promise.all([
      getDailyUsage(email),
      getMonthlyUsage(email),
      getCreditTrend(email),
      getSubscriptionHistory(email),
      getInstallActivity(email),
      getAnalyticsCharts(email),
    ]);

    return {
      success: true,
      charts: {
        dailyUsage,
        monthlyUsage,
        creditTrend,
        subscriptionHistory,
        installActivity,
        usageHeatmap: analyticsCharts.heatmap,
        eventSummary: analyticsCharts.eventSummary,
      },
    };
  } catch (err) {
    console.error('[DashboardChartsService] Exception in getDashboardCharts:', err);
    // Return empty arrays on error - all chart arrays must always be present
    return {
      success: false,
      error: err.message || 'Failed to load dashboard charts',
      charts: {
        dailyUsage: [],
        monthlyUsage: [],
        creditTrend: [],
        subscriptionHistory: [],
        installActivity: [],
        usageHeatmap: [],
        eventSummary: [],
      },
    };
  }
}

module.exports = {
  getDailyUsage,
  getMonthlyUsage,
  getCreditTrend,
  getSubscriptionHistory,
  getInstallActivity,
  getAnalyticsCharts,
  getRecentEvents, // Legacy support
  getPluginActivity, // Legacy support
  getDashboardCharts,
};
