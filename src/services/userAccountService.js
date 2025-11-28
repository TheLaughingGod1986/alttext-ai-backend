/**
 * User Account Service
 * Aggregates user installation, plugin, and site data for dashboard views
 * Never throws - returns { success: false, error: '...' } on failure
 */

const { supabase } = require('../../db/supabase-client');
const billingService = require('./billingService');

/**
 * Get all installations for a user
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and installations array
 */
async function getUserInstallations(email) {
  try {
    const { data, error } = await supabase
      .from('vw_user_installations')
      .select('*')
      .eq('email', email.toLowerCase());
    
    if (error) {
      console.error('[UserAccountService] Error fetching installations:', error);
      throw error;
    }
    
    return { success: true, installations: data || [] };
  } catch (err) {
    console.error('[UserAccountService] Exception fetching installations:', err);
    return { success: false, error: err.message, installations: [] };
  }
}

/**
 * Get plugins overview for a user (grouped by plugin)
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and plugins array
 */
async function getUserPlugins(email) {
  try {
    const { data, error } = await supabase
      .from('vw_user_plugins_overview')
      .select('*')
      .eq('email', email.toLowerCase());
    
    if (error) {
      console.error('[UserAccountService] Error fetching plugins:', error);
      throw error;
    }
    
    return { success: true, plugins: data || [] };
  } catch (err) {
    console.error('[UserAccountService] Exception fetching plugins:', err);
    return { success: false, error: err.message, plugins: [] };
  }
}

/**
 * Get sites overview for a user (grouped by site)
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and sites array
 */
async function getUserSites(email) {
  try {
    const { data, error } = await supabase
      .from('vw_user_sites_overview')
      .select('*')
      .eq('email', email.toLowerCase());
    
    if (error) {
      console.error('[UserAccountService] Error fetching sites:', error);
      throw error;
    }
    
    return { success: true, sites: data || [] };
  } catch (err) {
    console.error('[UserAccountService] Exception fetching sites:', err);
    return { success: false, error: err.message, sites: [] };
  }
}

/**
 * Get usage data for a user
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and usage data
 */
async function getUserUsage(email) {
  try {
    // Get user ID from email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !user) {
      return { success: true, usage: [] };
    }

    // Get usage logs count
    const { count: usageCount } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    return {
      success: true,
      usage: {
        total: usageCount || 0,
        userId: user.id,
      },
    };
  } catch (err) {
    console.error('[UserAccountService] Exception fetching usage:', err);
    return { success: false, error: err.message, usage: [] };
  }
}

/**
 * Get invoices for a user
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and invoices array
 */
async function getUserInvoices(email) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_email', email.toLowerCase())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[UserAccountService] Error fetching invoices:', error);
      throw error;
    }

    return { success: true, invoices: data || [] };
  } catch (err) {
    console.error('[UserAccountService] Exception fetching invoices:', err);
    return { success: false, error: err.message, invoices: [] };
  }
}

/**
 * Get full account data (installations, plugins, sites, subscriptions, usage, invoices)
 * Aggregates all account-level data for dashboard
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and full account data
 */
async function getFullAccount(email) {
  try {
    const [inst, plug, sites, subsResult, usageResult, invoicesResult] = await Promise.all([
      getUserInstallations(email),
      getUserPlugins(email),
      getUserSites(email),
      billingService.getUserSubscriptions(email),
      getUserUsage(email),
      getUserInvoices(email),
    ]);
    
    return {
      success: true,
      email: email.toLowerCase(),
      installations: inst.installations,
      plugins: plug.plugins,
      sites: sites.sites,
      subscriptions: subsResult.success ? subsResult.subscriptions : [],
      usage: usageResult.success ? usageResult.usage : [],
      invoices: invoicesResult.success ? invoicesResult.invoices : [],
    };
  } catch (err) {
    console.error('[UserAccountService] Exception fetching full account:', err);
    return {
      success: false,
      error: err.message,
      email: email.toLowerCase(),
      installations: [],
      plugins: [],
      sites: [],
      subscriptions: [],
      usage: [],
      invoices: [],
    };
  }
}

module.exports = {
  getUserInstallations,
  getUserPlugins,
  getUserSites,
  getUserUsage,
  getUserInvoices,
  getFullAccount,
};

