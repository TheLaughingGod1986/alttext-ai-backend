/**
 * Event Service
 * Handles unified event logging and rollup calculations
 * Single source of truth for all platform events
 */

const { supabase } = require('../../db/supabase-client');
const logger = require('../utils/logger');

/**
 * Log an event to the unified events table
 * @param {string} identityId - Identity UUID
 * @param {string} eventType - Event type (e.g., 'alttext_generated', 'credit_purchase', etc.)
 * @param {number} creditsDelta - Credit change (negative for usage, positive for purchases)
 * @param {Object} metadata - Additional event metadata (optional)
 * @returns {Promise<Object>} Result with success status and event ID
 */
async function logEvent(identityId, eventType, creditsDelta = 0, metadata = {}) {
  try {
    if (!identityId || !eventType) {
      return { success: false, error: 'identityId and eventType are required' };
    }

    const eventData = {
      identity_id: identityId,
      event_type: eventType,
      credits_delta: creditsDelta || 0,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    };

    const { data: event, error } = await supabase
      .from('events')
      .insert(eventData)
      .select('id')
      .single();

    if (error) {
      logger.error('[EventService] Error logging event', {
        error: error.message,
        code: error.code,
        identityId,
        eventType
      });
      return { success: false, error: error.message || 'Failed to log event' };
    }

    // If credits changed, update cached credits_balance
    if (creditsDelta !== 0) {
      await updateCreditsBalanceCache(identityId);
    }

    return { success: true, eventId: event.id };
  } catch (err) {
    logger.error('[EventService] Exception logging event', {
      error: err.message,
      stack: err.stack,
      identityId,
      eventType
    });
    return { success: false, error: err.message || 'Unexpected error logging event' };
  }
}

/**
 * Get event rollup for a specific identity and date range
 * Aggregates events for credit calculation and analytics
 * @param {string} identityId - Identity UUID
 * @param {Date} startDate - Start date (optional)
 * @param {Date} endDate - End date (optional)
 * @returns {Promise<Object>} Rollup data with event counts and credit totals
 */
async function getEventRollup(identityId, startDate = null, endDate = null) {
  try {
    if (!identityId) {
      return { success: false, error: 'identityId is required' };
    }

    let query = supabase
      .from('events')
      .select('event_type, credits_delta, created_at')
      .eq('identity_id', identityId);

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data: events, error } = await query;

    if (error) {
      logger.error('[EventService] Error fetching event rollup', {
        error: error.message,
        code: error.code,
        identityId
      });
      return { success: false, error: error.message || 'Failed to fetch events' };
    }

    // Aggregate events
    const eventCounts = {};
    let totalCreditsPurchased = 0;
    let totalCreditsUsed = 0;

    (events || []).forEach((event) => {
      // Count by event type
      eventCounts[event.event_type] = (eventCounts[event.event_type] || 0) + 1;

      // Aggregate credits
      if (event.credits_delta > 0) {
        totalCreditsPurchased += event.credits_delta;
      } else if (event.credits_delta < 0) {
        totalCreditsUsed += Math.abs(event.credits_delta);
      }
    });

    return {
      success: true,
      rollup: {
        eventCounts,
        totalCreditsPurchased,
        totalCreditsUsed,
        netCredits: totalCreditsPurchased - totalCreditsUsed,
        totalEvents: events?.length || 0,
      },
    };
  } catch (err) {
    logger.error('[EventService] Exception getting event rollup', {
      error: err.message,
      stack: err.stack,
      identityId
    });
    return { success: false, error: err.message || 'Unexpected error getting rollup' };
  }
}

/**
 * Get credit balance computed from events table
 * Calculates: SUM(credits_delta) - sum of all credit deltas
 * @param {string} identityId - Identity UUID
 * @returns {Promise<Object>} Result with success status and balance
 */
async function getCreditBalance(identityId) {
  try {
    if (!identityId) {
      return { success: false, error: 'identityId is required', balance: 0 };
    }

    // Query all events for this identity and calculate balance
    const { data: events, error: queryError } = await supabase
      .from('events')
      .select('credits_delta')
      .eq('identity_id', identityId);

    if (queryError) {
      logger.error('[EventService] Error fetching credit balance', {
        error: queryError.message,
        code: queryError.code,
        identityId
      });
      return { success: false, error: queryError.message || 'Failed to calculate balance', balance: 0 };
    }

    // Calculate balance: SUM(credits_delta)
    // Positive values = purchases, negative values = usage
    let balance = 0;
    (events || []).forEach((event) => {
      balance += event.credits_delta || 0;
    });

    return { success: true, balance };
  } catch (err) {
    logger.error('[EventService] Exception getting credit balance', {
      error: err.message,
      stack: err.stack,
      identityId
    });
    return { success: false, error: err.message || 'Unexpected error calculating balance', balance: 0 };
  }
}

/**
 * Update cached credits_balance in identities table
 * This keeps the cache in sync with events table
 * @param {string} identityId - Identity UUID
 * @returns {Promise<void>}
 */
async function updateCreditsBalanceCache(identityId) {
  try {
    const balanceResult = await getCreditBalance(identityId);
    if (balanceResult.success) {
      await supabase
        .from('identities')
        .update({ credits_balance: balanceResult.balance })
        .eq('id', identityId);
    }
  } catch (err) {
    // Don't throw - cache update is best effort
    logger.error('[EventService] Error updating credits cache', {
      error: err.message,
      stack: err.stack,
      identityId
    });
  }
}

/**
 * Get events for a specific identity with optional filters
 * @param {string} identityId - Identity UUID
 * @param {Object} options - Query options
 * @param {string} options.eventType - Filter by event type (optional)
 * @param {Date} options.startDate - Start date (optional)
 * @param {Date} options.endDate - End date (optional)
 * @param {number} options.limit - Limit results (optional)
 * @param {number} options.offset - Offset for pagination (optional)
 * @returns {Promise<Object>} Result with success status and events array
 */
async function getEvents(identityId, options = {}) {
  try {
    if (!identityId) {
      return { success: false, error: 'identityId is required', events: [] };
    }

    let query = supabase
      .from('events')
      .select('*')
      .eq('identity_id', identityId)
      .order('created_at', { ascending: false });

    if (options.eventType) {
      query = query.eq('event_type', options.eventType);
    }
    if (options.startDate) {
      query = query.gte('created_at', options.startDate.toISOString());
    }
    if (options.endDate) {
      query = query.lte('created_at', options.endDate.toISOString());
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data: events, error } = await query;

    if (error) {
      logger.error('[EventService] Error fetching events', {
        error: error.message,
        code: error.code,
        identityId
      });
      return { success: false, error: error.message || 'Failed to fetch events', events: [] };
    }

    return { success: true, events: events || [] };
  } catch (err) {
    logger.error('[EventService] Exception getting events', {
      error: err.message,
      stack: err.stack,
      identityId
    });
    return { success: false, error: err.message || 'Unexpected error fetching events', events: [] };
  }
}

module.exports = {
  logEvent,
  getEventRollup,
  getCreditBalance,
  updateCreditsBalanceCache,
  getEvents,
};

