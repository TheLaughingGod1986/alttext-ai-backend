/**
 * Account Service
 * Aggregates all account data for dashboard: installations, subscriptions, usage, plans
 * Never throws - returns { success: false, error: '...' } on failure
 */

const userAccountService = require('./userAccountService');
const billingService = require('./billingService');
const usageService = require('./usageService');
const plansConfig = require('../config/plans');

/**
 * Get unified account summary for dashboard
 * Aggregates installations, subscriptions, usage, and computes plan limits
 * 
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and unified account data
 */
async function getAccountSummary(email) {
  try {
    const emailLower = email.toLowerCase();

    // Fetch all data sources in parallel
    const [installationsResult, subscriptionsResult, usageResult] = await Promise.all([
      userAccountService.getUserInstallations(emailLower),
      billingService.getUserSubscriptions(emailLower),
      usageService.getUsageSummary(emailLower),
    ]);

    // Extract data or use defaults
    const installations = installationsResult.success ? installationsResult.installations : [];
    const subscriptions = subscriptionsResult.success ? subscriptionsResult.subscriptions : [];
    const totalUsage = usageResult.success ? usageResult.usage : { monthlyImages: 0, dailyImages: 0, totalImages: 0 };

    // Build per-plugin usage and plans
    const usage = {};
    const plans = {};

    // Get unique plugins from installations
    const pluginSlugs = [...new Set(installations.map(inst => inst.plugin_slug))];
    
    // If no installations but have subscriptions, use subscription plugins
    if (pluginSlugs.length === 0 && subscriptions.length > 0) {
      subscriptions.forEach(sub => {
        if (sub.plugin_slug && !pluginSlugs.includes(sub.plugin_slug)) {
          pluginSlugs.push(sub.plugin_slug);
        }
      });
    }

    // Default to alttext-ai if no plugins found
    if (pluginSlugs.length === 0) {
      pluginSlugs.push('alttext-ai');
    }

    // Process each plugin
    pluginSlugs.forEach(pluginSlug => {
      // Find subscription for this plugin
      const subscription = subscriptions.find(sub => sub.plugin_slug === pluginSlug);
      const currentPlan = subscription?.plan || 'free';
      const planConfig = plansConfig[pluginSlug];
      
      // Get plan limits from config
      const planLimits = planConfig?.[currentPlan] || planConfig?.free || { tokens: 0 };
      const quota = planLimits.tokens || 0;

      // Note: Since usage_logs doesn't track service/plugin, we distribute total usage
      // evenly across all plugins. In the future, when usage_logs tracks service,
      // we'll have accurate per-plugin usage.
      // For now, assign all usage to the first plugin (or distribute evenly)
      const pluginCount = pluginSlugs.length;
      const monthlyImages = pluginCount > 0 ? Math.floor(totalUsage.monthlyImages / pluginCount) : 0;
      const dailyImages = pluginCount > 0 ? Math.floor(totalUsage.dailyImages / pluginCount) : 0;
      const totalImages = pluginCount > 0 ? Math.floor(totalUsage.totalImages / pluginCount) : 0;
      const remaining = Math.max(0, quota - monthlyImages);

      // Build usage object for this plugin
      usage[pluginSlug] = {
        monthlyImages,
        dailyImages,
        totalImages,
        quota,
        remaining,
      };

      // Build plans object for this plugin
      plans[pluginSlug] = {
        currentPlan,
        monthlyImages: quota, // quota in tokens/images
        tokens: quota,
      };
    });

    return {
      ok: true,
      data: {
        email: emailLower,
        installations,
        subscriptions,
        usage,
        plans,
      },
    };
  } catch (err) {
    console.error('[AccountService] Exception getting account summary:', err);
    return {
      ok: false,
      error: err.message || 'Failed to get account summary',
      data: {
        email: email.toLowerCase(),
        installations: [],
        subscriptions: [],
        usage: {},
        plans: {},
      },
    };
  }
}

module.exports = {
  getAccountSummary,
};

