/**
 * Usage and billing routes
 */

const express = require('express');
const { supabase, handleSupabaseResponse } = require('../supabase-client');
const { authenticateToken } = require('../auth/jwt');

const router = express.Router();

/**
 * Get user's current usage and plan info
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, plan, tokensRemaining, credits, resetDate, createdAt, service')
      .eq('id', req.user.id)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Get usage count
    const { count: usageCount, error: countError } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('userId', req.user.id)
      .eq('service', user.service || 'alttext-ai');

    if (countError) {
      throw countError;
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

    const serviceLimits = planLimits[user.service] || planLimits['alttext-ai'];
    const limit = serviceLimits[user.plan] || serviceLimits.free;
    const remaining = Math.max(0, user.tokensRemaining || limit - usageCount);

    res.json({
      success: true,
      usage: {
        used: usageCount,
        limit: limit,
        remaining: remaining,
        plan: user.plan,
        credits: user.credits,
        service: user.service || 'alttext-ai'
      }
    });

  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({
      error: 'Failed to get usage info',
      code: 'USAGE_ERROR'
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
        .select('id, imageId, endpoint, createdAt')
        .eq('userId', req.user.id)
        .order('createdAt', { ascending: false })
        .range(skip, skip + limit - 1),
      supabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('userId', req.user.id)
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
    res.status(500).json({
      error: 'Failed to get usage history',
      code: 'HISTORY_ERROR'
    });
  }
});

/**
 * Record usage for a generation request
 */
async function recordUsage(userId, imageId = null, endpoint = null, service = 'alttext-ai') {
  try {
    // Create usage log
    const { error: logError } = await supabase
      .from('usage_logs')
      .insert({
        userId,
        service,
        imageId,
        endpoint
      });

    if (logError) throw logError;

    // Get current tokensRemaining
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('tokensRemaining')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // Decrement user's remaining tokens
    const { error: updateError } = await supabase
      .from('users')
      .update({ tokensRemaining: (user.tokensRemaining || 0) - 1 })
      .eq('id', userId);

    if (updateError) throw updateError;

  } catch (error) {
    console.error('Error recording usage:', error);
    throw error;
  }
}

/**
 * Check if user has remaining tokens/credits
 */
async function checkUserLimits(userId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('plan, tokensRemaining, credits')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new Error('User not found');
  }

  // Check if user has tokens or credits remaining
  const hasTokens = (user.tokensRemaining || 0) > 0;
  const hasCredits = (user.credits || 0) > 0;
  const hasAccess = hasTokens || hasCredits;

  return {
    hasAccess,
    hasTokens,
    hasCredits,
    plan: user.plan,
    tokensRemaining: user.tokensRemaining || 0,
    credits: user.credits || 0
  };
}

/**
 * Use a credit instead of monthly token
 */
async function useCredit(userId) {
  try {
    // Get current credits
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('credits')
      .eq('id', userId)
      .single();

    if (userError || !user || (user.credits || 0) <= 0) {
      return false; // No credits available
    }

    // Decrement credits
    const { error: updateError } = await supabase
      .from('users')
      .update({ credits: (user.credits || 0) - 1 })
      .eq('id', userId);

    if (updateError) throw updateError;

    // Record usage
    const { error: logError } = await supabase
      .from('usage_logs')
      .insert({
        userId,
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
      const serviceLimits = planLimits[user.service] || planLimits['alttext-ai'];
      const limit = serviceLimits[user.plan] || serviceLimits.free;

      const { error: updateError } = await supabase
        .from('users')
        .update({
          tokensRemaining: limit,
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
    .select('plan, tokensRemaining, credits, service')
    .eq('id', organizationId)
    .single();

  if (error || !organization) {
    throw new Error('Organization not found');
  }

  const hasTokens = (organization.tokensRemaining || 0) > 0;
  const hasCredits = (organization.credits || 0) > 0;

  // Pro and Agency plans have access as long as they have SOME quota (even if low)
  // This allows them to continue using the service throughout the month
  const isPremiumPlan = organization.plan === 'pro' || organization.plan === 'agency';
  const hasAccess = isPremiumPlan ? (hasTokens || hasCredits) : (hasTokens || hasCredits);

  return {
    hasAccess,
    hasTokens,
    hasCredits,
    plan: organization.plan,
    tokensRemaining: organization.tokensRemaining || 0,
    credits: organization.credits || 0
  };
}

/**
 * Record usage for an organization (shared quota)
 */
async function recordOrganizationUsage(organizationId, userId, imageId = null, endpoint = null, service = 'alttext-ai') {
  try {
    // Create usage log
    const { error: logError } = await supabase
      .from('usage_logs')
      .insert({
        userId,
        organizationId,
        service,
        imageId,
        endpoint
      });

    if (logError) throw logError;

    // Get current tokensRemaining
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('tokensRemaining')
      .eq('id', organizationId)
      .single();

    if (orgError) throw orgError;

    // Decrement organization's remaining tokens
    const { error: updateError } = await supabase
      .from('organizations')
      .update({ tokensRemaining: (org.tokensRemaining || 0) - 1 })
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
        userId,
        organizationId,
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
          tokensRemaining: limit,
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
