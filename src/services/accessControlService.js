/**
 * Access Control Service
 * Centralized access control logic for AI generation endpoints
 * Evaluates subscription status, credit balance, and plan limits
 * Never throws errors - always returns allow/deny decision
 */

const billingService = require('./billingService');
const creditsService = require('./creditsService');
const errorCodes = require('../constants/errorCodes');
const logger = require('../utils/logger');

/**
 * Helper function to return allow decision
 * @returns {Object} Allow decision object
 */
function allow() {
  return { allowed: true };
}

/**
 * Helper function to return deny decision
 * @param {string} reason - Denial reason code
 * @returns {Object} Deny decision object with standardized format
 */
function deny(reason) {
  const messages = {
    [errorCodes.REASONS.NO_SUBSCRIPTION]: 'No active subscription found. Please subscribe to continue.',
    [errorCodes.REASONS.SUBSCRIPTION_INACTIVE]: 'Your subscription is inactive. Please renew to continue.',
    [errorCodes.REASONS.NO_CREDITS]: 'You have no credits remaining. Please purchase credits or subscribe.',
    [errorCodes.REASONS.PLAN_LIMIT]: 'You have reached your plan limit. Please upgrade to continue.',
  };

  return {
    allowed: false,
    code: errorCodes.NO_ACCESS,
    reason: reason,
    message: messages[reason] || 'Your current plan does not allow this action. Please upgrade.',
  };
}

/**
 * Evaluate access for a user to perform an AI action
 * Combines subscription status, credit balance, and plan limits
 * @param {string} email - User email address
 * @param {string} action - Action type (default: "ai_generate")
 * @returns {Promise<Object>} Access decision: { allowed: boolean, code?, reason?, message? }
 */
async function evaluateAccess(email, action = 'ai_generate') {
  try {
    if (!email) {
      return deny(errorCodes.REASONS.NO_IDENTITY);
    }

    const emailLower = email.toLowerCase();

    // Step 1: Load identity (for credits)
    const identityResult = await creditsService.getOrCreateIdentity(emailLower);
    if (!identityResult.success) {
      // Can't get/create identity - deny access
      return deny(errorCodes.REASONS.NO_SUBSCRIPTION);
    }

    // Step 2: Load subscription status
    const subscription = await billingService.getUserSubscriptionStatus(emailLower);

    // Step 3: Load credit balance
    const creditsResult = await creditsService.getBalanceByEmail(emailLower);
    const credits = {
      success: creditsResult.success,
      balance: creditsResult.balance || 0,
    };

    // Decision Logic:

    // 1. No subscription check
    if (!subscription || !subscription.plan || subscription.plan === 'free') {
      // No subscription or free plan - check credits
      if (credits.success && credits.balance > 0) {
        // User has credits - allow (credits override)
        return allow();
      }
      // No subscription and no credits - deny
      return deny(errorCodes.REASONS.NO_SUBSCRIPTION);
    }

    // 2. Inactive subscription check
    if (subscription.status !== 'active') {
      // Subscription exists but is inactive - check credits
      if (credits.success && credits.balance > 0) {
        // User has credits - allow (credits override)
        return allow();
      }
      // Inactive subscription and no credits - deny
      return deny(errorCodes.REASONS.SUBSCRIPTION_INACTIVE);
    }

    // 3. Credits override (if user has credits > 0, allow regardless of subscription)
    if (credits.success && credits.balance > 0) {
      return allow();
    }

    // 4. Free plan check (should have been caught above, but double-check)
    if (subscription.plan === 'free') {
      if (credits.success && credits.balance > 0) {
        return allow();
      }
      return deny(errorCodes.REASONS.NO_CREDITS);
    }

    // 5. Paid plan with no credits (rare case - subscription active but no credits)
    // This could happen if credits were spent and subscription is active
    // For now, we allow active paid subscriptions even without credits
    // (plan limits are enforced elsewhere)
    if (subscription.status === 'active' && subscription.plan !== 'free') {
      return allow();
    }

    // 6. Default: deny (shouldn't reach here, but fail-safe)
    return deny(errorCodes.REASONS.NO_CREDITS);
  } catch (error) {
    logger.error('[AccessControlService] Unexpected error', {
      error: error.message,
      stack: error.stack,
      email: email
    });
    // Fail-safe: deny on any error (prioritize blocking over allowing)
    return deny(errorCodes.REASONS.SUBSCRIPTION_INACTIVE);
  }
}

module.exports = {
  evaluateAccess,
};

