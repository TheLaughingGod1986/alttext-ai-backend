/**
 * Identity Service
 * Handles plugin identity management, JWT issuance, and token refresh
 */

const jwt = require('jsonwebtoken');
const { supabase } = require('../../db/supabase-client');
const billingService = require('./billingService');
const usageService = require('./usageService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

/**
 * Helper function to get subscription for an email
 * Returns the first subscription from getUserSubscriptions
 */
async function getSubscriptionForEmail(email) {
  try {
    const result = await billingService.getUserSubscriptions(email.toLowerCase());
    if (result.success && result.subscriptions && result.subscriptions.length > 0) {
      return result.subscriptions[0];
    }
    return null;
  } catch (err) {
    console.error('[IdentityService] Error getting subscription for email:', err);
    return null;
  }
}

/**
 * Get or create identity for email + plugin combination
 * @param {string} email - User email
 * @param {string} plugin - Plugin slug
 * @param {string} site - Site URL (optional)
 * @returns {Promise<Object|null>} Identity object or null on error
 */
async function getOrCreateIdentity(email, plugin, site) {
  const lower = email.toLowerCase();

  // Check for existing identity
  const { data: existing, error: lookupError } = await supabase
    .from('plugin_identities')
    .select('*')
    .eq('email', lower)
    .eq('plugin_slug', plugin)
    .maybeSingle();

  if (lookupError && lookupError.code !== 'PGRST116') {
    console.error('[IdentityService] Error looking up identity:', lookupError);
    return null;
  }

  if (existing) {
    return existing;
  }

  // Create new identity
  const insertPayload = {
    email: lower,
    plugin_slug: plugin,
    site_url: site || null,
  };

  const { data: created, error: insertError } = await supabase
    .from('plugin_identities')
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    console.error('[IdentityService] Failed to create identity:', insertError);
    return null;
  }

  return created;
}

/**
 * Issue JWT token for an identity
 * @param {Object} identity - Identity object from database
 * @returns {string} JWT token
 */
function issueJwt(identity) {
  return jwt.sign(
    {
      email: identity.email,
      plugin: identity.plugin_slug,
      version: identity.jwt_version,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Refresh JWT token
 * Validates old token, checks version, and issues new token
 * @param {string} oldToken - Existing JWT token
 * @returns {Promise<Object>} Result with success status and new token or error
 */
async function refreshJwt(oldToken) {
  try {
    const decoded = jwt.verify(oldToken, JWT_SECRET);

    // Check if identity still exists
    const { data: identity, error: identityError } = await supabase
      .from('plugin_identities')
      .select('*')
      .eq('email', decoded.email)
      .eq('plugin_slug', decoded.plugin)
      .maybeSingle();

    if (identityError || !identity) {
      return { success: false, error: 'IDENTITY_NOT_FOUND' };
    }

    // Check version mismatch
    if (decoded.version !== identity.jwt_version) {
      return { success: false, error: 'TOKEN_VERSION_INVALID' };
    }

    // Issue new token
    const newToken = issueJwt(identity);
    return { success: true, token: newToken };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get identity dashboard data
 * Aggregates installations, subscription, and usage for an email
 * @param {string} email - User email
 * @returns {Promise<Object>} Dashboard data with installations, subscription, and usage
 */
async function getIdentityDashboard(email) {
  const lower = email.toLowerCase();

  // Fetch all data in parallel
  const [installationsResult, subscription, usageSummary] = await Promise.all([
    // Get installations
    supabase
      .from('plugin_installations')
      .select('*')
      .eq('email', lower),
    // Get subscription
    getSubscriptionForEmail(lower),
    // Get usage summary
    usageService.getUsageSummary(lower),
  ]);

  return {
    installations: installationsResult.data || [],
    subscription: subscription || null,
    usage: usageSummary.usage || {},
  };
}

module.exports = {
  getOrCreateIdentity,
  issueJwt,
  refreshJwt,
  getIdentityDashboard,
};

