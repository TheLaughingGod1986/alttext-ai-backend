/**
 * Usage and billing routes
 * Site-based usage tracking: All users on the same site (same X-Site-Hash) share the same quota
 */

const express = require('express');
const { supabase, handleSupabaseResponse } = require('../db/supabase-client');
const { optionalAuth, authenticateToken } = require('../auth/jwt');
const siteService = require('../src/services/siteService');
const licenseService = require('../src/services/licenseService');
const usageService = require('../src/services/usageService');
const { rateLimitByIp } = require('../src/middleware/rateLimiter');

const router = express.Router();

// Simple in-memory cache for /usage responses
// Key: siteHash, Value: { data, timestamp }
const usageCache = new Map();
const USAGE_CACHE_TTL = 3000; // 3 seconds - short cache to reduce duplicate requests

function getCachedUsage(siteHash) {
  const cached = usageCache.get(siteHash);
  if (cached && Date.now() - cached.timestamp < USAGE_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedUsage(siteHash, data) {
  usageCache.set(siteHash, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Get site's current usage and plan info
 * CRITICAL: Tracks usage by X-Site-Hash, NOT by X-WP-User-ID
 * All users on the same site (same X-Site-Hash) must receive the same usage
 */
// Rate limit /usage: 60 requests per 15 minutes per IP (exempts authenticated requests)
router.get('/', rateLimitByIp(15 * 60 * 1000, 60, 'Too many requests to /usage. Limit: 60 requests per 15 minutes.'), optionalAuth, async (req, res) => {
  try {
    // X-Site-Hash is REQUIRED for quota tracking
    const siteHash = req.headers['x-site-hash'];
    
    if (!siteHash) {
      return res.status(400).json({
        success: false,
        error: 'X-Site-Hash header is required',
        code: 'MISSING_SITE_HASH'
      });
    }

    // Check cache first (3 second TTL to reduce duplicate requests)
    const cached = getCachedUsage(siteHash);
    if (cached) {
      return res.json(cached);
    }

    // Get site URL from header (optional)
    const siteUrl = req.headers['x-site-url'];

    // Get or create site
    const site = await siteService.getOrCreateSite(siteHash, siteUrl);

    // Get site usage (this handles monthly resets automatically)
    // This is the same function used by authenticateBySiteHashForQuota middleware
    // to ensure consistency between /usage and /api/generate endpoints
    const usage = await siteService.getSiteUsage(siteHash);

    // Determine quota source (priority order):
    // 1. X-License-Key → use license-based quota
    // 2. Authorization (JWT) → use user account quota
    // 3. Neither → use site-based free quota (50 credits/month)

    let license = null;
    let licenseKey = null;
    let quotaSource = 'site-free'; // Default to site-based free quota

    // Check for X-License-Key header (same logic as dualAuthenticate middleware)
    const headerLicenseKey = (req.headers['x-license-key'] || req.body?.licenseKey)?.trim();
    if (headerLicenseKey) {
      // First, try to find in organizations table
      let organization = null;
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('license_key', headerLicenseKey)
        .single();

      if (!orgError && orgData) {
        organization = orgData;
        licenseKey = headerLicenseKey;
        quotaSource = 'license';
      }

      // If not found in organizations, try licenses table
      if (!organization) {
        const { data: licenseData, error: licenseError } = await supabase
          .from('licenses')
          .select('*')
          .eq('license_key', headerLicenseKey)
          .single();

        if (!licenseError && licenseData) {
          license = licenseData;
          licenseKey = headerLicenseKey;
          quotaSource = 'license';
          
          // Update site with license key if different (same as authenticateBySiteHashForQuota)
          if (site.license_key !== headerLicenseKey) {
            await supabase
              .from('sites')
              .update({
                license_key: headerLicenseKey,
                plan: licenseData.plan || 'free',
                token_limit: licenseData.token_limit || 50,
                updated_at: new Date().toISOString()
              })
              .eq('site_hash', siteHash);
            
            // Re-fetch usage after updating site (to get updated quota)
            const updatedUsage = await siteService.getSiteUsage(siteHash);
            Object.assign(usage, updatedUsage);
          }
        }
      }
    }

    // If no license key in header, check site's license (same as authenticateBySiteHashForQuota)
    if (!license && site.license_key) {
      license = await siteService.getSiteLicense(siteHash);
      if (license) {
        licenseKey = site.license_key;
        quotaSource = 'license';
      }
    }

    // Check for JWT authentication (Authorization header)
    // Note: This override logic is only for display purposes in /usage endpoint
    // The /api/generate endpoint uses requireSubscription which checks req.siteUsage
    // set by authenticateBySiteHashForQuota, which doesn't apply user account overrides
    if (!license && req.user && req.user.id) {
      // User account quota - get user's plan
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, plan, service')
        .eq('id', req.user.id)
        .single();

      if (!userError && user) {
        quotaSource = 'user-account';
        // Use user's plan limits
        const serviceLimits = siteService.PLAN_LIMITS[user.service || 'alttext-ai'] || siteService.PLAN_LIMITS['alttext-ai'];
        const userLimit = serviceLimits[user.plan] || serviceLimits.free;
        
        // Override usage with user's quota if higher (for display only)
        // Note: This doesn't affect actual quota enforcement in /api/generate
        if (userLimit > usage.limit) {
          usage.limit = userLimit;
          usage.remaining = Math.max(0, userLimit - usage.used);
          usage.plan = user.plan;
        }
      }
    }

    // Calculate reset timestamp
    const resetDate = usage.resetDate || siteService.getNextResetDate();
    const resetTimestamp = usage.resetTimestamp || Math.floor(new Date(resetDate).getTime() / 1000);

    // Build response with licenseKey in multiple locations
    const response = {
      success: true,
      data: {
        usage: {
          used: usage.used,
          limit: usage.limit,
          remaining: usage.remaining,
          plan: usage.plan,
          resetDate: resetDate,
          resetTimestamp: resetTimestamp
        },
        organization: {
          plan: usage.plan,
          tokenLimit: usage.limit,
          tokensRemaining: usage.remaining,
          tokensUsed: usage.used,
          resetDate: resetDate
        },
        site: {
          siteHash: siteHash,
          siteUrl: site.site_url || siteUrl || null,
          licenseKey: licenseKey || site.license_key || null,
          autoAttachStatus: license ? (license.auto_attach_status || 'attached') : 'pending'
        }
      }
    };

    // Add license object if license exists
    if (license) {
      response.data.license = {
        licenseKey: license.license_key || licenseKey,
        plan: license.plan || usage.plan,
        tokenLimit: license.token_limit || usage.limit,
        tokensRemaining: license.tokens_remaining !== undefined ? license.tokens_remaining : usage.remaining
      };
      // Also add licenseKey at root level
      response.data.licenseKey = license.license_key || licenseKey;
    } else if (site.license_key) {
      // Site has license key but license not found - still include it
      response.data.licenseKey = site.license_key;
    }

    // Cache response for 3 seconds to reduce duplicate requests
    setCachedUsage(siteHash, response);

    res.json(response);

  } catch (error) {
    console.error('Get usage error:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get usage info',
      code: 'USAGE_ERROR',
      message: error.message || 'Unknown error'
    });
  }
});

/**
 * Get user's usage history with pagination
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [usageLogsResult, totalCountResult] = await Promise.all([
      supabase
        .from('usage_logs')
        .select('id, image_id, endpoint, created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .range(skip, skip + limit - 1),
      supabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id)
    ]);

    if (usageLogsResult.error) throw usageLogsResult.error;
    if (totalCountResult.error) throw totalCountResult.error;

    const usageLogs = usageLogsResult.data || [];
    const totalCount = totalCountResult.count || 0;

    res.json({
      success: true,
      usageLogs,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Get usage history error:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    res.status(500).json({
      error: 'Failed to get usage history',
      code: 'HISTORY_ERROR',
      message: error.message || 'Unknown error'
    });
  }
});

/**
 * Record usage for a generation request
 */
async function recordUsage(userId, imageId = null, endpoint = null, service = 'alttext-ai', wpUserId = null, wpUserName = null) {
  try {
    // Create usage log
    const logData = {
      user_id: userId,
      image_id: imageId,
      endpoint
    };

    const { error: logError } = await supabase
      .from('usage_logs')
      .insert(logData);

    if (logError) throw logError;

    // Get current tokensRemaining
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, plan')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // Note: tokensRemaining column doesn't exist in users table
    // Usage is tracked via usage_logs table instead
    // No need to update users table

  } catch (error) {
    console.error('Error recording usage:', error);
    throw error;
  }
}

/**
 * Check if user has remaining tokens/credits
 */
async function checkUserLimits(userId) {
  // Validate userId exists
  if (!userId) {
    console.error('checkUserLimits: Invalid userId provided:', userId);
    throw new Error('User not found');
  }

  console.log('checkUserLimits: Querying user:', { userId, userIdType: typeof userId });
  
  // Query user for plan
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('plan')
    .eq('id', userId)
    .single();

  if (userError) {
    console.error('checkUserLimits: Supabase query error:', {
      message: userError.message,
      code: userError.code,
      details: userError.details,
      hint: userError.hint,
      userId: userId
    });
    throw new Error(`User lookup failed: ${userError.message}`);
  }

  if (!user) {
    console.error('checkUserLimits: User not found in database:', { userId: userId });
    throw new Error('User not found');
  }

  // Service-specific plan limits
  const planLimits = {
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

  // Default to alttext-ai service (service column doesn't exist in users table)
  const serviceLimits = planLimits['alttext-ai'];
  const defaultMonthlyLimit = serviceLimits[user.plan] || serviceLimits.free;

  // Query credits from credits table
  const { data: creditsData, error: creditsError } = await supabase
    .from('credits')
    .select('monthly_limit, used_this_month')
    .eq('user_id', userId)
    .single();

  // If no credits record exists, use default limits based on plan
  const monthlyLimit = creditsData?.monthly_limit || defaultMonthlyLimit;
  const usedThisMonth = creditsData?.used_this_month || 0;
  const creditsRemaining = Math.max(0, monthlyLimit - usedThisMonth);

  console.log('checkUserLimits: User found:', { 
    id: userId, 
    plan: user.plan, 
    creditsRemaining,
    monthlyLimit,
    usedThisMonth,
    hasCreditsRecord: !!creditsData
  });

  // Check if user has tokens or credits remaining
  // tokensRemaining column doesn't exist - assume tokens available if user exists
  const hasTokens = true;
  const hasCredits = creditsRemaining > 0;
  const hasAccess = hasTokens || hasCredits;

  return {
    hasAccess,
    hasTokens,
    hasCredits,
    plan: user.plan,
    tokensRemaining: 0, // Column doesn't exist - calculate from usage_logs if needed
    credits: creditsRemaining,
    monthlyLimit: monthlyLimit
  };
}

/**
 * Use a credit instead of monthly token
 */
async function useCredit(userId) {
  try {
    // Get current credits from credits table
    const { data: creditsData, error: creditsError } = await supabase
      .from('credits')
      .select('monthly_limit, used_this_month')
      .eq('user_id', userId)
      .single();

    if (creditsError || !creditsData) {
      return false; // No credits record found
    }

    const creditsRemaining = Math.max(0, (creditsData.monthly_limit || 0) - (creditsData.used_this_month || 0));
    
    if (creditsRemaining <= 0) {
      return false; // No credits available
    }

    // Increment used_this_month in credits table
    const { error: updateError } = await supabase
      .from('credits')
      .update({ used_this_month: (creditsData.used_this_month || 0) + 1 })
      .eq('user_id', userId);

    if (updateError) throw updateError;

    // Record usage
    const { error: logError } = await supabase
      .from('usage_logs')
      .insert({
        user_id: userId,
        endpoint: 'generate-credit'
      });

    if (logError) throw logError;

    return true;
  } catch (error) {
    return false; // No credits available
  }
}

/**
 * Reset monthly tokens (called by cron or webhook)
 */
async function resetMonthlyTokens() {
  try {
    // Service-specific plan limits
    const planLimits = {
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

    // Reset all users' monthly tokens
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, plan, service');

    if (usersError) throw usersError;

    for (const user of users) {
      // service column doesn't exist in users table, default to alttext-ai
    const serviceLimits = planLimits['alttext-ai'];
      const limit = serviceLimits[user.plan] || serviceLimits.free;

      const { error: updateError } = await supabase
        .from('users')
        .update({
          // tokensRemaining column doesn't exist - skip update
          resetDate: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        console.error(`Error resetting tokens for user ${user.id}:`, updateError);
      }
    }

    console.log(`Reset monthly tokens for ${users.length} users`);
    return users.length;
  } catch (error) {
    console.error('Error resetting monthly tokens:', error);
    throw error;
  }
}

/**
 * Helper function to get next reset date
 */
function getNextResetDate() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

/**
 * Check organization limits (for multi-user license sharing)
 */
async function checkOrganizationLimits(organizationId) {
  const { data: organization, error } = await supabase
    .from('organizations')
    .select('plan, credits, service, tokens_remaining')
    .eq('id', organizationId)
    .single();

  if (error || !organization) {
    throw new Error('Organization not found');
  }

  // Map snake_case to camelCase for consistency
  const credits = organization.credits !== undefined ? organization.credits : 0;
  const tokensRemaining = organization.tokens_remaining !== undefined ? organization.tokens_remaining : 0;
  
  // Check if organization has credits or tokens remaining
  const hasCredits = credits > 0;
  const hasTokens = tokensRemaining > 0;

  // Organization has access if it has credits OR tokens remaining
  const hasAccess = hasCredits || hasTokens;

  return {
    hasAccess,
    hasTokens,
    hasCredits,
    plan: organization.plan,
    tokensRemaining,
    credits
  };
}

/**
 * Record usage for an organization (shared quota)
 */
async function recordOrganizationUsage(organizationId, userId, imageId = null, endpoint = null, service = 'alttext-ai', wpUserId = null, wpUserName = null) {
  try {
    // Create usage log
    const logData = {
      user_id: userId,
      organization_id: organizationId,
      image_id: imageId,
      endpoint
    };

    const { error: logError } = await supabase
      .from('usage_logs')
      .insert(logData);

    if (logError) throw logError;

    // Get current tokensRemaining
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, plan')
      .eq('id', organizationId)
      .single();

    if (orgError) throw orgError;

    // Decrement organization's remaining tokens
    const { error: updateError } = await supabase
      .from('organizations')
      // Note: tokensRemaining column doesn't exist, so we can't update it
      // Usage is tracked via usage_logs table instead
      .eq('id', organizationId);

    if (updateError) throw updateError;

  } catch (error) {
    console.error('Error recording organization usage:', error);
    throw error;
  }
}

/**
 * Use organization credit instead of monthly token
 */
async function useOrganizationCredit(organizationId, userId) {
  try {
    // Get current credits
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('credits')
      .eq('id', organizationId)
      .single();

    if (orgError || !org || (org.credits || 0) <= 0) {
      return false; // No credits available
    }

    // Decrement credits
    const { error: updateError } = await supabase
      .from('organizations')
      .update({ credits: (org.credits || 0) - 1 })
      .eq('id', organizationId);

    if (updateError) throw updateError;

    // Record usage
    const { error: logError } = await supabase
      .from('usage_logs')
      .insert({
        user_id: userId,
        organization_id: organizationId,
        endpoint: 'generate-credit'
      });

    if (logError) throw logError;

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Reset organization monthly tokens (called by cron or webhook)
 */
async function resetOrganizationTokens() {
  try {
    const planLimits = {
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

    const { data: organizations, error: orgsError } = await supabase
      .from('organizations')
      .select('id, plan, service');

    if (orgsError) throw orgsError;

    for (const org of organizations) {
      const serviceLimits = planLimits[org.service] || planLimits['alttext-ai'];
      const limit = serviceLimits[org.plan] || serviceLimits.free;

      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          // tokensRemaining column doesn't exist - skip update
          resetDate: new Date().toISOString()
        })
        .eq('id', org.id);

      if (updateError) {
        console.error(`Error resetting tokens for organization ${org.id}:`, updateError);
      }
    }

    console.log(`Reset monthly tokens for ${organizations.length} organizations`);
    return organizations.length;
  } catch (error) {
    console.error('Error resetting organization tokens:', error);
    throw error;
  }
}

/**
 * POST /sync/usage
 * Sync usage data from plugin
 * Accepts daily counts, recent actions, version, plan, and settings
 * Only stores snapshot if plugin had activity in last 24 hours
 */
router.post('/sync/usage', optionalAuth, async (req, res) => {
  try {
    const { email, plugin, version, usage, siteUrl, plan, settings, recentActions } = req.body;

    // Validate required fields
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
        code: 'MISSING_EMAIL'
      });
    }

    if (!plugin) {
      return res.status(400).json({
        success: false,
        error: 'Plugin slug is required',
        code: 'MISSING_PLUGIN'
      });
    }

    const emailLower = email.toLowerCase();

    // Store usage snapshot
    const snapshotResult = await usageService.storeUsageSnapshot({
      email: emailLower,
      plugin,
      siteUrl,
      version,
      usage,
      recentActions: recentActions || [],
      plan: plan || 'free',
      settings: settings || {},
    });

    if (!snapshotResult.success) {
      return res.status(500).json({
        success: false,
        error: snapshotResult.error || 'Failed to store usage snapshot',
        code: 'SNAPSHOT_ERROR'
      });
    }

    // If snapshot was skipped (no recent activity), return success but indicate skip
    if (snapshotResult.skipped) {
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: snapshotResult.reason,
        message: 'Snapshot skipped - no recent activity in last 24 hours'
      });
    }

    // Detect stale versions
    const staleVersionsResult = await usageService.detectStaleVersions(emailLower);

    return res.status(200).json({
      success: true,
      snapshotId: snapshotResult.snapshotId,
      staleVersions: staleVersionsResult.success ? staleVersionsResult.staleVersions : [],
    });
  } catch (error) {
    console.error('[Usage Routes] Error in /sync/usage:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync usage',
      code: 'SYNC_ERROR'
    });
  }
});

module.exports = {
  router,
  recordUsage,
  checkUserLimits,
  useCredit,
  resetMonthlyTokens,
  checkOrganizationLimits,
  recordOrganizationUsage,
  useOrganizationCredit,
  resetOrganizationTokens
};
