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

/**
 * Store usage snapshot from plugin
 * Only stores if plugin had activity in last 24 hours
 * @param {Object} data - Snapshot data
 * @param {string} data.email - User email
 * @param {string} data.plugin - Plugin slug
 * @param {string} [data.siteUrl] - Site URL
 * @param {string} [data.version] - Plugin version
 * @param {Object} [data.usage] - Usage data { daily: number }
 * @param {Array} [data.recentActions] - Array of recent action timestamps
 * @param {string} [data.plan] - Current plan
 * @param {Object} [data.settings] - Plugin settings snapshot
 * @returns {Promise<Object>} Result with success status and snapshotId
 */
async function storeUsageSnapshot(data) {
  try {
    const { email, plugin, siteUrl, version, usage, recentActions, plan, settings } = data;
    const emailLower = email.toLowerCase();
    const today = new Date().toISOString().split('T')[0];

    // Check if plugin had activity in last 24 hours
    const hasRecentActivity = recentActions && Array.isArray(recentActions) && recentActions.length > 0;
    if (!hasRecentActivity) {
      // No recent activity, don't store snapshot
      return {
        success: true,
        skipped: true,
        reason: 'no_recent_activity',
      };
    }

    // Filter recent actions to last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActionsFiltered = recentActions.filter(action => {
      const actionDate = new Date(action);
      return actionDate >= oneDayAgo;
    });

    if (recentActionsFiltered.length === 0) {
      return {
        success: true,
        skipped: true,
        reason: 'no_activity_in_last_24h',
      };
    }

    // Prepare snapshot data
    const snapshotData = {
      email: emailLower,
      plugin_slug: plugin || 'alttext-ai',
      site_url: siteUrl || null,
      version: version || null,
      daily_count: usage?.daily || 0,
      recent_actions: recentActionsFiltered,
      plan: plan || 'free',
      settings: settings || {},
      snapshot_date: today,
    };

    // Upsert snapshot (one per email+plugin+date)
    const { data: snapshot, error: upsertError } = await supabase
      .from('usage_snapshots')
      .upsert(snapshotData, {
        onConflict: 'email,plugin_slug,snapshot_date',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (upsertError) {
      console.error('[UsageService] Error storing usage snapshot:', upsertError);
      return {
        success: false,
        error: upsertError.message,
      };
    }

    // Update plugin_installations.last_seen_at
    if (emailLower && plugin) {
      await supabase
        .from('plugin_installations')
        .update({
          last_seen_at: new Date().toISOString(),
          version: version || null,
        })
        .eq('email', emailLower)
        .eq('plugin_slug', plugin);
    }

    return {
      success: true,
      snapshotId: snapshot.id,
    };
  } catch (err) {
    console.error('[UsageService] Exception storing usage snapshot:', err);
    return {
      success: false,
      error: err.message || 'Failed to store usage snapshot',
    };
  }
}

/**
 * Detect stale plugin versions
 * Compares plugin versions in snapshots with known latest versions
 * @param {string} email - User email
 * @returns {Promise<Object>} Result with list of installations with outdated versions
 */
async function detectStaleVersions(email) {
  try {
    const emailLower = email.toLowerCase();

    // Get latest snapshots for each plugin
    const { data: snapshots, error: snapshotsError } = await supabase
      .from('usage_snapshots')
      .select('plugin_slug, version, snapshot_date')
      .eq('email', emailLower)
      .order('snapshot_date', { ascending: false });

    if (snapshotsError) {
      console.error('[UsageService] Error fetching snapshots:', snapshotsError);
      return {
        success: false,
        error: snapshotsError.message,
        staleVersions: [],
      };
    }

    // Known latest versions (hardcoded for now, could be moved to config)
    const latestVersions = {
      'alttext-ai': '1.0.0', // Update as needed
      'seo-ai-meta': '1.0.0', // Update as needed
      'beepbeep-ai': '1.0.0', // Update as needed
    };

    // Group by plugin and get latest version per plugin
    const pluginVersions = {};
    snapshots.forEach(snapshot => {
      if (!pluginVersions[snapshot.plugin_slug] || 
          new Date(snapshot.snapshot_date) > new Date(pluginVersions[snapshot.plugin_slug].date)) {
        pluginVersions[snapshot.plugin_slug] = {
          version: snapshot.version,
          date: snapshot.snapshot_date,
        };
      }
    });

    // Check for stale versions
    const staleVersions = [];
    Object.keys(pluginVersions).forEach(plugin => {
      const currentVersion = pluginVersions[plugin].version;
      const latestVersion = latestVersions[plugin];
      
      if (currentVersion && latestVersion && currentVersion !== latestVersion) {
        // Simple version comparison (could be enhanced with semver)
        staleVersions.push({
          plugin,
          currentVersion,
          latestVersion,
          lastSeen: pluginVersions[plugin].date,
        });
      }
    });

    return {
      success: true,
      staleVersions,
    };
  } catch (err) {
    console.error('[UsageService] Exception detecting stale versions:', err);
    return {
      success: false,
      error: err.message || 'Failed to detect stale versions',
      staleVersions: [],
    };
  }
}

module.exports = {
  getUsageSummary,
  recordSiteUsage,
  getSiteUsageStats,
  storeUsageSnapshot,
  detectStaleVersions,
};

