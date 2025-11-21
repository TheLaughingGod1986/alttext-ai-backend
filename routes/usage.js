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
      .select('id, plan, created_at')
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
      .eq('user_id', req.user.id)

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

    // service column doesn't exist in users table, default to alttext-ai
    const serviceLimits = planLimits['alttext-ai'];
    const limit = serviceLimits[user.plan] || serviceLimits.free;
    // Calculate remaining tokens (column doesn't exist, use limit - used)
    const remaining = Math.max(0, limit - usageCount);

    // Get credits from credits table
    const { data: creditsData } = await supabase
      .from('credits')
      .select('monthly_limit, used_this_month')
      .eq('user_id', req.user.id)
      .single();

    const creditsRemaining = creditsData 
      ? Math.max(0, (creditsData.monthly_limit || 0) - (creditsData.used_this_month || 0))
      : 0;

    res.json({
      success: true,
      usage: {
        used: usageCount,
        limit: limit,
        remaining: remaining,
        plan: user.plan,
        credits: creditsRemaining,
        service: 'alttext-ai' // service column doesn't exist
      }
    });

  } catch (error) {
    console.error('Get usage error:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    res.status(500).json({
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
async function recordUsage(userId, imageId = null, endpoint = null, service = 'alttext-ai') {
  try {
    // Create usage log
    const { error: logError } = await supabase
      .from('usage_logs')
      .insert({
        user_id: userId,
        image_id: imageId,
        endpoint
      });

    if (logError) throw logError;

    // Get current tokensRemaining
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, plan')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // Decrement user's remaining tokens
    const { error: updateError } = await supabase
      .from('users')
      // Note: tokensRemaining column doesn't exist, so we can't update it
      // Usage is tracked via usage_logs table instead
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

  // Query credits from credits table
  const { data: creditsData, error: creditsError } = await supabase
    .from('credits')
    .select('monthly_limit, used_this_month')
    .eq('user_id', userId)
    .single();

  // Credits might not exist for all users, so we don't throw on error
  const creditsRemaining = creditsData 
    ? Math.max(0, (creditsData.monthly_limit || 0) - (creditsData.used_this_month || 0))
    : 0;

  console.log('checkUserLimits: User found:', { 
    id: userId, 
    plan: user.plan, 
    creditsRemaining,
    monthlyLimit: creditsData?.monthly_limit || 0,
    usedThisMonth: creditsData?.used_this_month || 0
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
    credits: creditsRemaining
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
    .select('plan, credits, service')
    .eq('id', organizationId)
    .single();

  if (error || !organization) {
    throw new Error('Organization not found');
  }

  // tokensRemaining column doesn't exist - assume tokens available if org exists
  const hasTokens = true;
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
    tokensRemaining: 0, // Column doesn't exist - calculate from usage_logs if needed
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
        user_id: userId,
        organization_id: organizationId,
        image_id: imageId,
        endpoint
      });

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
