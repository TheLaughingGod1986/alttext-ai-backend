/**
 * Usage and billing routes
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../auth/jwt');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Get user's current usage and plan info
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        plan: true,
        tokensRemaining: true,
        credits: true,
        resetDate: true,
        createdAt: true,
        service: true
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Get usage count
    const usageCount = await prisma.usageLog.count({
      where: { 
        userId: req.user.id,
        service: user.service || 'alttext-ai'
      }
    });

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

    const [usageLogs, totalCount] = await Promise.all([
      prisma.usageLog.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          used: true,
          imageId: true,
          endpoint: true,
          createdAt: true
        }
      }),
      prisma.usageLog.count({
        where: { userId: req.user.id }
      })
    ]);

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
    await prisma.usageLog.create({
      data: {
        userId,
        service,
        used: 1,
        imageId,
        endpoint
      }
    });

    // Decrement user's remaining tokens
    await prisma.user.update({
      where: { id: userId },
      data: {
        tokensRemaining: {
          decrement: 1
        }
      }
    });

  } catch (error) {
    console.error('Error recording usage:', error);
    throw error;
  }
}

/**
 * Check if user has remaining tokens/credits
 */
async function checkUserLimits(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      tokensRemaining: true,
      credits: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Check if user has tokens or credits remaining
  const hasTokens = user.tokensRemaining > 0;
  const hasCredits = user.credits > 0;
  const hasAccess = hasTokens || hasCredits;

  return {
    hasAccess,
    hasTokens,
    hasCredits,
    plan: user.plan,
    tokensRemaining: user.tokensRemaining,
    credits: user.credits
  };
}

/**
 * Use a credit instead of monthly token
 */
async function useCredit(userId) {
  try {
    await prisma.user.update({
      where: { 
        id: userId,
        credits: { gt: 0 } // Only if user has credits
      },
      data: {
        credits: {
          decrement: 1
        }
      }
    });

    // Record usage
    await prisma.usageLog.create({
      data: {
        userId,
        used: 1,
        endpoint: 'generate-credit'
      }
    });

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
    const users = await prisma.user.findMany({
      select: {
        id: true,
        plan: true,
        service: true
      }
    });

    for (const user of users) {
      const serviceLimits = planLimits[user.service] || planLimits['alttext-ai'];
      const limit = serviceLimits[user.plan] || serviceLimits.free;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          tokensRemaining: limit,
          resetDate: new Date()
        }
      });
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
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      plan: true,
      tokensRemaining: true,
      credits: true,
      service: true
    }
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  const hasTokens = organization.tokensRemaining > 0;
  const hasCredits = organization.credits > 0;

  // Pro and Agency plans have access as long as they have SOME quota (even if low)
  // This allows them to continue using the service throughout the month
  const isPremiumPlan = organization.plan === 'pro' || organization.plan === 'agency';
  const hasAccess = isPremiumPlan ? (hasTokens || hasCredits) : (hasTokens || hasCredits);

  return {
    hasAccess,
    hasTokens,
    hasCredits,
    plan: organization.plan,
    tokensRemaining: organization.tokensRemaining,
    credits: organization.credits
  };
}

/**
 * Record usage for an organization (shared quota)
 */
async function recordOrganizationUsage(organizationId, userId, imageId = null, endpoint = null, service = 'alttext-ai') {
  try {
    // Create usage log
    await prisma.usageLog.create({
      data: {
        userId,
        organizationId,
        service,
        used: 1,
        imageId,
        endpoint
      }
    });

    // Decrement organization's remaining tokens
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        tokensRemaining: {
          decrement: 1
        }
      }
    });

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
    await prisma.organization.update({
      where: {
        id: organizationId,
        credits: { gt: 0 }
      },
      data: {
        credits: {
          decrement: 1
        }
      }
    });

    // Record usage
    await prisma.usageLog.create({
      data: {
        userId,
        organizationId,
        used: 1,
        endpoint: 'generate-credit'
      }
    });

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

    const organizations = await prisma.organization.findMany({
      select: {
        id: true,
        plan: true,
        service: true
      }
    });

    for (const org of organizations) {
      const serviceLimits = planLimits[org.service] || planLimits['alttext-ai'];
      const limit = serviceLimits[org.plan] || serviceLimits.free;

      await prisma.organization.update({
        where: { id: org.id },
        data: {
          tokensRemaining: limit,
          resetDate: new Date()
        }
      });
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
