/**
 * Site Service
 * Handles site-based usage tracking and quota management
 * All users on the same site (same site_hash) share the same quota
 */

const { supabase } = require('../../db/supabase-client');
const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

/**
 * Service-specific plan limits
 */
const PLAN_LIMITS = {
  'alttext-ai': {
    free: 50,
    pro: 1000,
    agency: 10000
  },
  'seo-ai-meta': {
    free: 10,
    pro: 100,
    agency: 1000
  }
};

/**
 * Get token limit for a plan and service
 */
function getTokenLimit(plan, service = 'alttext-ai') {
  const serviceLimits = PLAN_LIMITS[service] || PLAN_LIMITS['alttext-ai'];
  return serviceLimits[plan] || serviceLimits.free;
}

/**
 * Get or create site record
 * @param {string} siteHash - 32-character site identifier
 * @param {string} siteUrl - WordPress site URL (optional)
 * @returns {Promise<Object>} Site record
 */
async function getOrCreateSite(siteHash, siteUrl = null) {
  try {
    // Use upsert to atomically get or create site
    // This prevents race conditions when multiple requests try to create the same site
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const resetDate = nextMonth.toISOString().split('T')[0];

    const siteData = {
      site_hash: siteHash,
      site_url: siteUrl,
      plan: 'free',
      token_limit: 50,
      tokens_used: 0,
      tokens_remaining: 50,
      reset_date: resetDate,
      updated_at: now.toISOString()
    };

    // Only set created_at if this is a new site (upsert won't overwrite existing created_at)
    // Use upsert with ON CONFLICT to handle existing sites gracefully
    const { data: site, error: upsertError } = await supabase
      .from('sites')
      .upsert(siteData, {
        onConflict: 'site_hash',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (upsertError) {
      // If upsert fails, try to get existing site
      const { data: existingSite, error: getError } = await supabase
        .from('sites')
        .select('*')
        .eq('site_hash', siteHash)
        .single();

      if (!getError && existingSite) {
        // Update site_url if provided and different
        if (siteUrl && existingSite.site_url !== siteUrl) {
          const { data: updatedSite, error: updateError } = await supabase
            .from('sites')
            .update({
              site_url: siteUrl,
              updated_at: now.toISOString()
            })
            .eq('site_hash', siteHash)
            .select()
            .single();

          if (!updateError && updatedSite) {
            return updatedSite;
          }
        }
        return existingSite;
      }
      
      throw new Error(`Failed to get or create site: ${upsertError.message}`);
    }

    return site;
  } catch (error) {
    logger.error('[SiteService] Error in getOrCreateSite', { error: error.message });
    throw error;
  }
}

/**
 * Get current usage for a site
 * @param {string} siteHash - Site hash
 * @returns {Promise<Object>} Usage information
 */
async function getSiteUsage(siteHash) {
  try {
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('site_hash', siteHash)
      .single();

    if (siteError || !site) {
      // Site doesn't exist, return default free plan usage
      return {
        used: 0,
        limit: 50,
        remaining: 50,
        plan: 'free',
        resetDate: getNextResetDate()
      };
    }

    // Check if we need to reset (monthly reset)
    const now = new Date();
    const resetDate = site.reset_date ? new Date(site.reset_date) : null;
    
    if (resetDate && now > resetDate) {
      // Reset monthly quota
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const newResetDate = nextMonth.toISOString().split('T')[0];
      const tokenLimit = site.token_limit || 50;

      await supabase
        .from('sites')
        .update({
          tokens_used: 0,
          tokens_remaining: tokenLimit,
          reset_date: newResetDate,
          updated_at: now.toISOString()
        })
        .eq('site_hash', siteHash);

      return {
        used: 0,
        limit: tokenLimit,
        remaining: tokenLimit,
        plan: site.plan || 'free',
        resetDate: newResetDate,
        resetTimestamp: Math.floor(nextMonth.getTime() / 1000)
      };
    }

    const resetTimestamp = resetDate ? Math.floor(resetDate.getTime() / 1000) : null;

    return {
      used: site.tokens_used || 0,
      limit: site.token_limit || 50,
      remaining: site.tokens_remaining || 50,
      plan: site.plan || 'free',
      resetDate: site.reset_date || getNextResetDate(),
      resetTimestamp
    };
  } catch (error) {
    logger.error('[SiteService] Error in getSiteUsage', { error: error.message });
    throw error;
  }
}

/**
 * Check if site has remaining quota
 * @param {string} siteHash - Site hash
 * @returns {Promise<Object>} Quota check result
 */
async function checkSiteQuota(siteHash) {
  try {
    const usage = await getSiteUsage(siteHash);
    return {
      hasAccess: usage.remaining > 0,
      hasQuota: usage.remaining > 0,
      ...usage
    };
  } catch (error) {
    logger.error('[SiteService] Error in checkSiteQuota', { error: error.message });
    return {
      hasAccess: false,
      hasQuota: false,
      used: 0,
      limit: 50,
      remaining: 0,
      plan: 'free'
    };
  }
}

/**
 * Deduct tokens from site quota
 * @param {string} siteHash - Site hash
 * @param {number} tokens - Number of tokens to deduct (default: 1)
 * @returns {Promise<Object>} Updated site record
 */
async function deductSiteQuota(siteHash, tokens = 1) {
  try {
    // Get current site
    const { data: site, error: getError } = await supabase
      .from('sites')
      .select('*')
      .eq('site_hash', siteHash)
      .single();

    if (getError || !site) {
      throw new Error('Site not found');
    }

    // Check if we need to reset (monthly reset)
    const now = new Date();
    const resetDate = site.reset_date ? new Date(site.reset_date) : null;
    let tokensUsed = site.tokens_used || 0;
    let tokensRemaining = site.tokens_remaining || 50;
    let tokenLimit = site.token_limit || 50;

    if (resetDate && now > resetDate) {
      // Reset monthly quota
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const newResetDate = nextMonth.toISOString().split('T')[0];
      tokenLimit = site.token_limit || 50;
      tokensUsed = 0;
      tokensRemaining = tokenLimit;
    }

    // Deduct tokens
    tokensUsed += tokens;
    tokensRemaining = Math.max(0, tokensRemaining - tokens);

    // Update site
    const { data: updatedSite, error: updateError } = await supabase
      .from('sites')
      .update({
        tokens_used: tokensUsed,
        tokens_remaining: tokensRemaining,
        updated_at: now.toISOString()
      })
      .eq('site_hash', siteHash)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update site quota: ${updateError.message}`);
    }

    // Record usage in usage_tracking table
    await supabase
      .from('usage_tracking')
      .insert({
        site_hash: siteHash,
        tokens_used: tokens,
        generated_at: now.toISOString()
      });

    return updatedSite;
  } catch (error) {
    logger.error('[SiteService] Error in deductSiteQuota', { error: error.message });
    throw error;
  }
}

/**
 * Get license associated with site
 * @param {string} siteHash - Site hash
 * @returns {Promise<Object|null>} License record or null
 */
async function getSiteLicense(siteHash) {
  try {
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('license_key')
      .eq('site_hash', siteHash)
      .single();

    if (siteError || !site || !site.license_key) {
      return null;
    }

    // Get license details
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key', site.license_key)
      .single();

    if (licenseError || !license) {
      return null;
    }

    return license;
  } catch (error) {
    console.error('[SiteService] Error in getSiteLicense:', error);
    return null;
  }
}

/**
 * Create free license for site
 * @param {string} siteHash - Site hash
 * @param {string} siteUrl - Site URL (optional)
 * @returns {Promise<Object>} Created license and updated site
 */
async function createFreeLicenseForSite(siteHash, siteUrl = null) {
  try {
    // Check if site already has a license
    const existingLicense = await getSiteLicense(siteHash);
    if (existingLicense) {
      // Update site URL if provided
      if (siteUrl) {
        await supabase
          .from('sites')
          .update({
            site_url: siteUrl,
            updated_at: new Date().toISOString()
          })
          .eq('site_hash', siteHash);
      }
      return {
        license: existingLicense,
        site: await getOrCreateSite(siteHash, siteUrl)
      };
    }

    // Generate UUID v4 license key
    const licenseKey = randomUUID();

    // Create license record
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const resetDate = nextMonth.toISOString().split('T')[0];

    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .insert({
        license_key: licenseKey,
        plan: 'free',
        service: 'alttext-ai',
        token_limit: 50,
        tokens_remaining: 50,
        site_hash: siteHash,
        site_url: siteUrl,
        auto_attach_status: 'attached',
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      })
      .select()
      .single();

    if (licenseError) {
      throw new Error(`Failed to create license: ${licenseError.message}`);
    }

    // Update or create site with license key
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .upsert({
        site_hash: siteHash,
        site_url: siteUrl,
        license_key: licenseKey,
        plan: 'free',
        token_limit: 50,
        tokens_used: 0,
        tokens_remaining: 50,
        reset_date: resetDate,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      }, {
        onConflict: 'site_hash',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (siteError) {
      throw new Error(`Failed to update site: ${siteError.message}`);
    }

    return {
      license,
      site
    };
  } catch (error) {
    console.error('[SiteService] Error in createFreeLicenseForSite:', error);
    throw error;
  }
}

/**
 * Get next reset date (first day of next month)
 */
function getNextResetDate() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

module.exports = {
  getOrCreateSite,
  getSiteUsage,
  checkSiteQuota,
  deductSiteQuota,
  getSiteLicense,
  createFreeLicenseForSite,
  getNextResetDate,
  getTokenLimit,
  PLAN_LIMITS
};

