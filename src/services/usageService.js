/**
 * Usage Service
 * Aggregates usage statistics per plugin/service
 * Never throws - returns { success: false, error: '...' } on failure
 */

const { supabase } = require('../../db/supabase-client');

/**
 * Get usage summary per plugin for a user
 * Note: Since usage_logs doesn't store service/plugin info directly,
 * we aggregate total usage. The accountService will match this with
 * subscriptions/installations to determine per-plugin distribution.
 * 
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and per-plugin usage stats
 */
async function getUsageSummary(email) {
  try {
    // Get user ID from email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !user) {
      // User not found, return empty usage
      return { success: true, usage: {} };
    }

    const userId = user.id;

    // Get all usage logs for this user
    const { data: usageLogs, error: logsError } = await supabase
      .from('usage_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (logsError) {
      console.error('[UsageService] Error fetching usage logs:', logsError);
      return { success: false, error: logsError.message, usage: {} };
    }

    if (!usageLogs || usageLogs.length === 0) {
      return { success: true, usage: {} };
    }

    // Calculate date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Aggregate all usage (since service/plugin isn't stored in usage_logs)
    const totalCount = usageLogs.length;
    const monthlyLogs = usageLogs.filter(log => {
      const logDate = new Date(log.created_at);
      return logDate >= startOfMonth;
    });
    const dailyLogs = usageLogs.filter(log => {
      const logDate = new Date(log.created_at);
      return logDate >= startOfDay;
    });

    // Return aggregated usage - accountService will distribute this per-plugin
    // based on subscriptions/installations
    return {
      success: true,
      usage: {
        // Return total usage - accountService will need to distribute based on subscriptions
        monthlyImages: monthlyLogs.length,
        dailyImages: dailyLogs.length,
        totalImages: totalCount,
      },
    };
  } catch (err) {
    console.error('[UsageService] Exception fetching usage summary:', err);
    return { success: false, error: err.message, usage: {} };
  }
}

/**
 * Record usage for a site (site-based tracking)
 * @param {string} siteHash - Site hash identifier
 * @param {number} tokens - Number of tokens used (default: 1)
 * @returns {Promise<Object>} Result with success status
 */
async function recordSiteUsage(siteHash, tokens = 1) {
  try {
    const { error } = await supabase
      .from('usage_tracking')
      .insert({
        site_hash: siteHash,
        tokens_used: tokens,
        generated_at: new Date().toISOString()
      });

    if (error) {
      console.error('[UsageService] Error recording site usage:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[UsageService] Exception recording site usage:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get usage stats for a site
 * @param {string} siteHash - Site hash identifier
 * @returns {Promise<Object>} Usage statistics
 */
async function getSiteUsageStats(siteHash) {
  try {
    // Get current month's usage
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: usageLogs, error: logsError } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('site_hash', siteHash)
      .gte('generated_at', startOfMonth.toISOString())
      .order('generated_at', { ascending: false });

    if (logsError) {
      console.error('[UsageService] Error fetching site usage stats:', logsError);
      return { success: false, error: logsError.message, stats: null };
    }

    const totalTokens = (usageLogs || []).reduce((sum, log) => sum + (log.tokens_used || 1), 0);
    const totalRequests = (usageLogs || []).length;

    return {
      success: true,
      stats: {
        totalTokens,
        totalRequests,
        monthlyTokens: totalTokens,
        monthlyRequests: totalRequests
      }
    };
  } catch (err) {
    console.error('[UsageService] Exception fetching site usage stats:', err);
    return { success: false, error: err.message, stats: null };
  }
}

module.exports = {
  getUsageSummary,
  recordSiteUsage,
  getSiteUsageStats,
};

