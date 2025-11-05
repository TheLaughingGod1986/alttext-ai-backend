/**
 * Usage and billing routes
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../auth/jwt');
<<<<<<< HEAD
const { ingestUsageBatch } = require('../services/providerUsageService');
=======
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Get user's current usage and plan info
 */
<<<<<<< HEAD

/**
 * Ingest usage events from plugin (internal)
 */
router.post('/event', authenticateToken, async (req, res) => {
  try {
    const accountId = Number(req.body?.account_id);
    if (!Number.isNaN(accountId) && accountId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'account_mismatch',
        message: 'Account ID does not match authenticated user.',
      });
    }

    const result = await ingestUsageBatch({
      payload: req.body,
      headers: req.headers,
      userId: req.user.id,
    });

    res.json({
      success: true,
      received: result.received,
    });
  } catch (error) {
    const statusCode = error.code === 'invalid_signature' ? 403 : (error.code ? 400 : 500);
    res.status(statusCode).json({
      success: false,
      error: error.code || 'ingest_error',
      message: error.message || 'Failed to ingest usage events',
    });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    // Get service from query parameter (defaults to alttext-ai for backward compatibility)
    const service = req.query.service || req.user.service || 'alttext-ai';

=======
router.get('/', authenticateToken, async (req, res) => {
  try {
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        plan: true,
<<<<<<< HEAD
        service: true,
=======
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
        tokensRemaining: true,
        credits: true,
        resetDate: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

<<<<<<< HEAD
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

    const serviceLimits = planLimits[service] || planLimits['alttext-ai'];
    const limit = serviceLimits[user.plan] || serviceLimits.free;
    const used = limit - user.tokensRemaining;
    const remaining = user.tokensRemaining;

    // Calculate next reset date
    const nextResetDate = getNextResetDate();
    const resetTimestamp = Math.floor(new Date(user.resetDate).getTime() / 1000);

=======
    // Calculate plan limits
    const planLimits = {
      free: 50,
      pro: 1000,
      agency: 10000
    };

    const limit = planLimits[user.plan] || 50;
    const used = limit - user.tokensRemaining;
    const remaining = user.tokensRemaining;

>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
    res.json({
      success: true,
      usage: {
        used,
        limit,
        remaining,
        plan: user.plan,
        credits: user.credits,
<<<<<<< HEAD
        resetDate: nextResetDate,
        resetTimestamp: resetTimestamp,
        service: service
=======
        resetDate: user.resetDate,
        nextReset: getNextResetDate()
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
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
<<<<<<< HEAD
async function recordUsage(userId, imageId = null, endpoint = 'generate', service = 'alttext-ai') {
  try {
    // Get user to determine service if not provided
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { service: true }
    });

    const userService = service || user?.service || 'alttext-ai';

    await prisma.usageLog.create({
      data: {
        userId,
        service: userService,
=======
async function recordUsage(userId, imageId = null, endpoint = 'generate') {
  try {
    await prisma.usageLog.create({
      data: {
        userId,
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
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
<<<<<<< HEAD
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
=======
    const planLimits = {
      free: 50,
      pro: 1000,
      agency: 10000
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
    };

    // Reset all users' monthly tokens
    const users = await prisma.user.findMany({
<<<<<<< HEAD
      select: { id: true, plan: true, service: true }
    });

    for (const user of users) {
      const serviceLimits = planLimits[user.service] || planLimits['alttext-ai'];
      const limit = serviceLimits[user.plan] || serviceLimits.free;
      
=======
      select: { id: true, plan: true }
    });

    for (const user of users) {
      const limit = planLimits[user.plan] || 50;
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
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

module.exports = {
  router,
  recordUsage,
  checkUserLimits,
  useCredit,
  resetMonthlyTokens
};
