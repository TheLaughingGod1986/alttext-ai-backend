/**
 * Identity Service
 * Handles plugin identity management, JWT issuance, and token refresh
 */

const jwt = require('jsonwebtoken');
const { supabase } = require('../../db/supabase-client');
const billingService = require('./billingService');
const usageService = require('./usageService');
const creditsService = require('./creditsService');
const pluginInstallationService = require('./pluginInstallationService');
const logger = require('../utils/logger');
const { getEnv, requireEnv } = require('../../config/loadEnv');

const JWT_SECRET = getEnv('JWT_SECRET', 'your-super-secret-jwt-key-change-in-production');
const JWT_EXPIRES_IN = getEnv('JWT_EXPIRES_IN', '12h');

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
    logger.error('[IdentityService] Error getting subscription for email', {
      error: err.message,
      stack: err.stack,
      email
    });
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
    logger.error('[IdentityService] Error looking up identity', {
      error: lookupError.message,
      code: lookupError.code,
      email: lower,
      plugin
    });
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
    logger.error('[IdentityService] Failed to create identity', {
      error: insertError.message,
      code: insertError.code,
      email: lower,
      plugin
    });
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
 * Sync identity - upserts identity and plugin installation
 * @param {Object} data - Sync data
 * @param {string} data.email - User email (required)
 * @param {string} [data.plugin] - Plugin slug
 * @param {string} [data.site] - Site URL
 * @param {string} [data.version] - Plugin version
 * @param {string} [data.wpVersion] - WordPress version
 * @param {string} [data.phpVersion] - PHP version
 * @returns {Promise<Object>} Result with success status and identity data
 */
async function syncIdentity(data) {
  try {
    const emailLower = data.email.toLowerCase();

    // Get or create unified identity (from identities table)
    const identityResult = await creditsService.getOrCreateIdentity(emailLower);
    if (!identityResult.success) {
      return { success: false, error: identityResult.error || 'Failed to get/create identity' };
    }

    const identityId = identityResult.identityId;

    // Upsert plugin installation if plugin is provided
    let installation = null;
    if (data.plugin) {
      const installationResult = await pluginInstallationService.recordInstallation({
        email: emailLower,
        plugin: data.plugin,
        site: data.site,
        version: data.version,
        wpVersion: data.wpVersion,
        phpVersion: data.phpVersion,
      });

      if (installationResult.success) {
        installation = installationResult.record;
      } else {
        logger.warn('[IdentityService] Failed to record installation', {
          error: installationResult.error,
          email: data.email,
          plugin: data.plugin
        });
        // Continue even if installation recording fails
      }
    }

    // Get full identity with installations
    const { data: identity } = await supabase
      .from('identities')
      .select('*')
      .eq('id', identityId)
      .single();

    // Get installations for this email
    const { data: installations } = await supabase
      .from('plugin_installations')
      .select('*')
      .eq('email', emailLower);

    return {
      success: true,
      identity: {
        id: identity.id,
        email: identity.email,
        created_at: identity.created_at,
        updated_at: identity.updated_at,
        installations: installations || [],
      },
    };
  } catch (error) {
    logger.error('[IdentityService] Error syncing identity', {
      error: error.message,
      stack: error.stack,
      email: data?.email
    });
    return { success: false, error: error.message || 'Failed to sync identity' };
  }
}

/**
 * Normalize email to lowercase
 * @param {string} email - Email address
 * @returns {string} Normalized email
 */
function normalizeEmail(email) {
  return email ? email.toLowerCase() : '';
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
  syncIdentity,
  normalizeEmail,
};

