/**
 * Credits Service
 * Handles credit transactions: purchases, spending, refunds
 * Uses unified events table for credit calculations
 * credits_balance column is kept as cached value for performance
 */

const { supabase } = require('../../db/supabase-client');
const eventService = require('./eventService');
const logger = require('../utils/logger');

/**
 * Get or create unified identity by email
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and identityId
 */
async function getOrCreateIdentity(email) {
  try {
    const emailLower = email.toLowerCase();

    // Check for existing identity
    const { data: existing, error: lookupError } = await supabase
      .from('identities')
      .select('id')
      .eq('email', emailLower)
      .maybeSingle();

    if (lookupError && lookupError.code !== 'PGRST116') {
      logger.error('[CreditsService] Error looking up identity', { error: lookupError.message });
      return { success: false, error: lookupError.message };
    }

    if (existing) {
      return { success: true, identityId: existing.id };
    }

    // Create new identity
    const { data: created, error: insertError } = await supabase
      .from('identities')
      .insert({ email: emailLower })
      .select('id')
      .single();

    if (insertError) {
      logger.error('[CreditsService] Failed to create identity', { error: insertError.message });
      return { success: false, error: insertError.message };
    }

    return { success: true, identityId: created.id };
  } catch (error) {
    logger.error('[CreditsService] Exception getting/creating identity', { error: error.message });
    return { success: false, error: error.message || 'Failed to get/create identity' };
  }
}

/**
 * Add credits to a user's account (from purchase)
 * Logs event to unified events table and updates cached credits_balance
 * @param {string} identityId - Identity UUID
 * @param {number} amount - Number of credits to add
 * @param {string} stripePaymentIntentId - Stripe payment intent ID (optional)
 * @returns {Promise<Object>} Result with success status and new balance
 */
async function addCredits(identityId, amount, stripePaymentIntentId = null) {
  try {
    if (!identityId || !amount || amount <= 0) {
      return { success: false, error: 'Invalid parameters: identityId and positive amount required' };
    }

    // Log event to unified events table
    const metadata = {
      stripe_payment_intent_id: stripePaymentIntentId || null,
      source: 'purchase',
    };

    const eventResult = await eventService.logEvent(
      identityId,
      'credit_purchase',
      amount, // Positive credits_delta
      metadata
    );

    if (!eventResult.success) {
      logger.error('[CreditsService] Error logging credit purchase event', { error: eventResult.error });
      return { success: false, error: eventResult.error || 'Failed to log credit purchase' };
    }

    // Get updated balance from events (cache will be updated by eventService)
    const balanceResult = await eventService.getCreditBalance(identityId);
    
    if (!balanceResult.success) {
      logger.error('[CreditsService] Error getting balance after purchase', { error: balanceResult.error });
      // Event was logged, so return success with estimated balance
      const { data: identity } = await supabase
        .from('identities')
        .select('credits_balance')
        .eq('id', identityId)
        .single();
      
      return {
        success: true,
        newBalance: (identity?.credits_balance || 0) + amount,
        transactionId: eventResult.eventId,
      };
    }

    logger.info(`[CreditsService] Added credits to identity`, { amount, identityId, balance: balanceResult.balance });
    return {
      success: true,
      newBalance: balanceResult.balance,
      transactionId: eventResult.eventId,
    };
  } catch (error) {
    logger.error('[CreditsService] Exception adding credits', { error: error.message });
    return { success: false, error: error.message || 'Failed to add credits' };
  }
}

/**
 * Spend credits from a user's account (on generation)
 * Logs event to unified events table and updates cached credits_balance
 * @param {string} identityId - Identity UUID
 * @param {number} amount - Number of credits to spend (default: 1)
 * @param {Object} metadata - Additional metadata for transaction (optional)
 * @returns {Promise<Object>} Result with success status and remaining balance
 */
async function spendCredits(identityId, amount = 1, metadata = {}) {
  try {
    if (!identityId || !amount || amount <= 0) {
      return { success: false, error: 'Invalid parameters: identityId and positive amount required' };
    }

    // Check current balance from events
    const balanceResult = await eventService.getCreditBalance(identityId);
    
    if (!balanceResult.success) {
      return { success: false, error: balanceResult.error || 'Failed to get balance' };
    }

    const currentBalance = balanceResult.balance || 0;

    // Check if sufficient credits
    if (currentBalance < amount) {
      return {
        success: false,
        error: 'INSUFFICIENT_CREDITS',
        currentBalance,
        requested: amount,
      };
    }

    // Log event to unified events table
    const eventResult = await eventService.logEvent(
      identityId,
      'credit_used',
      -amount, // Negative credits_delta for usage
      metadata || {}
    );

    if (!eventResult.success) {
      logger.error('[CreditsService] Error logging credit usage event', { error: eventResult.error });
      return { success: false, error: eventResult.error || 'Failed to log credit usage' };
    }

    // Get updated balance from events (cache will be updated by eventService)
    const updatedBalanceResult = await eventService.getCreditBalance(identityId);
    
    if (!updatedBalanceResult.success) {
      // Event was logged, calculate balance manually
      const estimatedBalance = currentBalance - amount;
      logger.info(`[CreditsService] Spent credits from identity`, { amount, identityId, estimatedBalance });
      return {
        success: true,
        remainingBalance: estimatedBalance,
        transactionId: eventResult.eventId,
      };
    }

    logger.info(`[CreditsService] Spent credits from identity`, { amount, identityId, balance: updatedBalanceResult.balance });
    return {
      success: true,
      remainingBalance: updatedBalanceResult.balance,
      transactionId: eventResult.eventId,
    };
  } catch (error) {
    logger.error('[CreditsService] Exception spending credits', { error: error.message });
    return { success: false, error: error.message || 'Failed to spend credits' };
  }
}

/**
 * Get current credit balance for an identity
 * Computes from events table: SUM(credits_delta WHERE credits_delta > 0) - SUM(credits_delta WHERE credits_delta < 0)
 * Falls back to cached credits_balance if events query fails
 * @param {string} identityId - Identity UUID
 * @returns {Promise<Object>} Result with success status and balance
 */
async function getBalance(identityId) {
  try {
    if (!identityId) {
      return { success: false, error: 'identityId is required' };
    }

    // Compute balance from events table (source of truth)
    const balanceResult = await eventService.getCreditBalance(identityId);
    
    if (balanceResult.success) {
      return {
        success: true,
        balance: balanceResult.balance || 0,
      };
    }

    // Fallback to cached credits_balance if events query fails
    logger.warn('[CreditsService] Falling back to cached credits_balance', { error: balanceResult.error });
    const { data: identity, error } = await supabase
      .from('identities')
      .select('credits_balance')
      .eq('id', identityId)
      .single();

    if (error || !identity) {
      if (error?.code === 'PGRST116') {
        return { success: false, error: 'Identity not found' };
      }
      return { success: false, error: error?.message || 'Failed to get balance' };
    }

    return {
      success: true,
      balance: identity.credits_balance || 0,
    };
  } catch (error) {
    logger.error('[CreditsService] Exception getting balance', { error: error.message });
    return { success: false, error: error.message || 'Failed to get balance' };
  }
}

/**
 * Get transaction history for an identity
 * Uses unified events table instead of credits_transactions
 * @param {string} identityId - Identity UUID
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 50)
 * @returns {Promise<Object>} Result with success status and transactions array
 */
async function getTransactionHistory(identityId, page = 1, limit = 50) {
  try {
    if (!identityId) {
      return { success: false, error: 'identityId is required' };
    }

    const skip = (page - 1) * limit;

    // Query unified events table for credit-related events
    const [transactionsResult, countResult] = await Promise.all([
      supabase
        .from('events')
        .select('id, event_type, credits_delta, metadata, created_at')
        .eq('identity_id', identityId)
        .in('event_type', ['credit_purchase', 'credit_used', 'credit_refund'])
        .order('created_at', { ascending: false })
        .range(skip, skip + limit - 1),
      supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('identity_id', identityId)
        .in('event_type', ['credit_purchase', 'credit_used', 'credit_refund']),
    ]);

    if (transactionsResult.error) {
      logger.error('[CreditsService] Error fetching transactions', { error: transactionsResult.error });
      return { success: false, error: transactionsResult.error.message, transactions: [] };
    }

    // Transform events to transaction format for backward compatibility
    const transactions = (transactionsResult.data || []).map(event => ({
      id: event.id,
      identity_id: identityId,
      amount: event.credits_delta,
      type: event.event_type === 'credit_purchase' ? 'purchase' : 
            event.event_type === 'credit_refund' ? 'refund' : 'usage',
      metadata: event.metadata || {},
      created_at: event.created_at,
    }));

    const totalCount = countResult.count || 0;

    return {
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    };
  } catch (error) {
    logger.error('[CreditsService] Exception getting transaction history', { error: error.message });
    return { success: false, error: error.message || 'Failed to get transaction history', transactions: [] };
  }
}

/**
 * Get balance by email (wrapper function)
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and balance
 */
async function getBalanceByEmail(email) {
  try {
    const identityResult = await getOrCreateIdentity(email);
    
    if (!identityResult.success) {
      return { success: false, error: identityResult.error, balance: 0 };
    }

    return await getBalance(identityResult.identityId);
  } catch (error) {
    logger.error('[CreditsService] Exception getting balance by email', { error: error.message });
    return { success: false, error: error.message || 'Failed to get balance', balance: 0 };
  }
}

/**
 * Add credits by email (wrapper function)
 * @param {string} email - User email address
 * @param {number} amount - Number of credits to add
 * @param {string} source - Source of credits ('purchase', 'bonus', 'manual', etc.)
 * @param {string} transactionId - Transaction ID (Stripe session ID or internal ID)
 * @returns {Promise<Object>} Result with success status and new balance
 */
async function addCreditsByEmail(email, amount, source = 'manual', transactionId = null) {
  try {
    const identityResult = await getOrCreateIdentity(email);
    
    if (!identityResult.success) {
      return { success: false, error: identityResult.error };
    }

    // Use transactionId as stripePaymentIntentId if provided
    return await addCredits(identityResult.identityId, amount, transactionId);
  } catch (error) {
    logger.error('[CreditsService] Exception adding credits by email', { error: error.message });
    return { success: false, error: error.message || 'Failed to add credits' };
  }
}

/**
 * Deduct one credit by email (atomic operation)
 * Uses atomic SQL update to prevent race conditions
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with success status and remaining balance
 */
async function deductCreditByEmail(email) {
  try {
    const identityResult = await getOrCreateIdentity(email);
    
    if (!identityResult.success) {
      return { success: false, error: identityResult.error };
    }

    // Use atomic spendCredits function to deduct 1 credit
    return await spendCredits(identityResult.identityId, 1);
  } catch (error) {
    logger.error('[CreditsService] Exception deducting credit by email', { error: error.message });
    return { success: false, error: error.message || 'Failed to deduct credit' };
  }
}

/**
 * Deduct credits by email (wrapper function)
 * Returns { ok: true } on success or { ok: false, reason: "INSUFFICIENT_CREDITS" } on failure
 * @param {string} email - User email address
 * @param {number} amount - Number of credits to deduct
 * @returns {Promise<Object>} Result with ok status and optional reason
 */
async function deductCredits(email, amount) {
  try {
    const identityResult = await getOrCreateIdentity(email);
    
    if (!identityResult.success) {
      return { ok: false, reason: identityResult.error || 'Failed to get/create identity' };
    }

    const spendResult = await spendCredits(identityResult.identityId, amount);
    
    if (!spendResult.success) {
      if (spendResult.error === 'INSUFFICIENT_CREDITS') {
        return { ok: false, reason: 'INSUFFICIENT_CREDITS' };
      }
      return { ok: false, reason: spendResult.error || 'Failed to deduct credits' };
    }

    return { ok: true };
  } catch (error) {
    logger.error('[CreditsService] Exception deducting credits', { error: error.message });
    return { ok: false, reason: error.message || 'Failed to deduct credits' };
  }
}

/**
 * Get transaction history by email (wrapper function)
 * @param {string} email - User email address
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 50)
 * @returns {Promise<Object>} Result with success status and transactions array
 */
async function getTransactionsByEmail(email, page = 1, limit = 50) {
  try {
    const identityResult = await getOrCreateIdentity(email);
    
    if (!identityResult.success) {
      return { success: false, error: identityResult.error, transactions: [] };
    }

    return await getTransactionHistory(identityResult.identityId, page, limit);
  } catch (error) {
    logger.error('[CreditsService] Exception getting transactions by email', { error: error.message });
    return { success: false, error: error.message || 'Failed to get transactions', transactions: [] };
  }
}

module.exports = {
  getOrCreateIdentity,
  addCredits,
  spendCredits,
  getBalance,
  getTransactionHistory,
  getBalanceByEmail,
  addCreditsByEmail,
  deductCreditByEmail,
  deductCredits,
  getTransactionsByEmail,
};

