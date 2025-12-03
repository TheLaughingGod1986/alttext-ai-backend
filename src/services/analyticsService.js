/**
 * Analytics Service
 * Handles analytics event logging
 * Never throws - always returns { success: true } or { success: false, error }
 */

const { supabase } = require('../../db/supabase-client');
const { analyticsEventSchema, analyticsEventArraySchema } = require('../validation/analyticsEventSchema');
const logger = require('../utils/logger');
const { isTest } = require('../../config/loadEnv');

// Throttling state - in-memory Map with TTL-based cleanup
const emailThrottleMap = new Map(); // email -> { count: number, resetAt: timestamp }
const ipThrottleMap = new Map(); // ip -> { count: number, resetAt: timestamp }
const duplicateEventMap = new Map(); // key -> timestamp

// Throttling configuration
const THROTTLE_CONFIG = {
  EMAIL_MAX_EVENTS_PER_MINUTE: 100,
  IP_MAX_EVENTS_PER_MINUTE: 200,
  DUPLICATE_WINDOW_MS: 5000, // 5 seconds
  CLEANUP_INTERVAL_MS: 60000, // 1 minute
};

// Cleanup old throttle entries periodically (skip in tests to avoid open handles)
if (!isTest()) {
  setInterval(() => {
    const now = Date.now();
    
    // Clean email throttle map
    for (const [email, data] of emailThrottleMap.entries()) {
      if (data.resetAt < now) {
        emailThrottleMap.delete(email);
      }
    }
    
    // Clean IP throttle map
    for (const [ip, data] of ipThrottleMap.entries()) {
      if (data.resetAt < now) {
        ipThrottleMap.delete(ip);
      }
    }
    
    // Clean duplicate event map
    for (const [key, timestamp] of duplicateEventMap.entries()) {
      if (timestamp + THROTTLE_CONFIG.DUPLICATE_WINDOW_MS < now) {
        duplicateEventMap.delete(key);
      }
    }
  }, THROTTLE_CONFIG.CLEANUP_INTERVAL_MS);
}

/**
 * Normalize email address
 * @param {string} email - Email address
 * @returns {string} Normalized email
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return '';
  }
  return email.toLowerCase().trim();
}

/**
 * Check if event should be throttled
 * @param {string} email - User email
 * @param {string} ip - IP address
 * @param {string} eventName - Event name
 * @returns {Object} { throttled: boolean, reason?: string }
 */
function checkThrottle(email, ip, eventName) {
  const now = Date.now();
  
  // Check per-email rate limit
  if (email) {
    const normalizedEmail = normalizeEmail(email);
    const emailThrottle = emailThrottleMap.get(normalizedEmail);
    
    if (emailThrottle) {
      if (emailThrottle.resetAt > now) {
        // Check if we've already reached the limit (count starts at 1, so 100 means we've logged 100 events)
        if (emailThrottle.count > THROTTLE_CONFIG.EMAIL_MAX_EVENTS_PER_MINUTE) {
          return { throttled: true, reason: 'EMAIL_RATE_LIMIT_EXCEEDED' };
        }
        emailThrottle.count++;
      } else {
        // Reset window
        emailThrottleMap.set(normalizedEmail, {
          count: 1,
          resetAt: now + 60000, // 1 minute
        });
      }
    } else {
      emailThrottleMap.set(normalizedEmail, {
        count: 1,
        resetAt: now + 60000,
      });
    }
  }
  
  // Check per-IP rate limit (for unauthenticated requests)
  if (ip) {
    const ipThrottle = ipThrottleMap.get(ip);
    
    if (ipThrottle) {
      if (ipThrottle.resetAt > now) {
        if (ipThrottle.count >= THROTTLE_CONFIG.IP_MAX_EVENTS_PER_MINUTE) {
          return { throttled: true, reason: 'IP_RATE_LIMIT_EXCEEDED' };
        }
        ipThrottle.count++;
      } else {
        // Reset window
        ipThrottleMap.set(ip, {
          count: 1,
          resetAt: now + 60000,
        });
      }
    } else {
      ipThrottleMap.set(ip, {
        count: 1,
        resetAt: now + 60000,
      });
    }
  }
  
  // Check duplicate event detection
  if (email && eventName) {
    const normalizedEmail = normalizeEmail(email);
    const duplicateKey = `${normalizedEmail}:${eventName}`;
    const lastTimestamp = duplicateEventMap.get(duplicateKey);
    
    if (lastTimestamp && (now - lastTimestamp) < THROTTLE_CONFIG.DUPLICATE_WINDOW_MS) {
      return { throttled: true, reason: 'DUPLICATE_EVENT' };
    }
    
    duplicateEventMap.set(duplicateKey, now);
  }
  
  return { throttled: false };
}

/**
 * Log an analytics event
 * Normalizes email, validates schema, writes to analytics_events table
 * Never throws - always returns success/error object
 * 
 * @param {Object} params - Event parameters
 * @param {string} params.email - User email (required)
 * @param {string} params.eventName - Event name (required)
 * @param {string} [params.plugin] - Plugin slug (optional)
 * @param {string} [params.source] - Event source: 'plugin', 'website', or 'server' (optional, defaults to 'plugin')
 * @param {Object} [params.eventData] - Additional event data as JSON object (optional)
 * @param {string} [params.identityId] - Identity ID (optional)
 * @param {string} [params.ip] - IP address for throttling (optional)
 * @returns {Promise<Object>} Result with success status
 */
async function logEvent({ email, eventName, plugin, source, eventData, identityId, ip }) {
  try {
    // Normalize email
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return { success: false, error: 'Email is required' };
    }

    // Check throttling
    const throttleCheck = checkThrottle(normalizedEmail, ip, eventName);
    if (throttleCheck.throttled) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        details: { reason: throttleCheck.reason },
      };
    }

    // Validate input with Zod schema
    let validation;
    try {
      if (!analyticsEventSchema) {
        throw new Error('Analytics event schema not loaded');
      }
      validation = analyticsEventSchema.safeParse({
        email: normalizedEmail,
        eventName,
        plugin,
        source,
        eventData,
        identityId,
      });
    } catch (validationError) {
      logger.error('[AnalyticsService] Schema validation error', {
        error: validationError.message,
        stack: validationError.stack,
        email: normalizedEmail,
        eventName
      });
      return {
        success: false,
        error: 'Validation failed',
        details: { message: validationError.message },
      };
    }

    if (!validation.success) {
      return {
        success: false,
        error: 'Validation failed',
        details: validation.error.flatten(),
      };
    }

    const validated = validation.data;

    // Prepare insert data
    const insertData = {
      email: validated.email,
      event_name: validated.eventName,
      plugin_slug: validated.plugin || null,
      source: validated.source || 'plugin',
      event_data: validated.eventData || {},
      identity_id: validated.identityId || null,
      created_at: new Date().toISOString(),
    };

    // Write to analytics_events table
    const { error: insertError } = await supabase
      .from('analytics_events')
      .insert(insertData);

    if (insertError) {
      logger.error('[AnalyticsService] Error inserting event', {
        error: insertError.message,
        stack: insertError.stack,
        email: normalizedEmail,
        eventName
      });
      return {
        success: false,
        error: insertError.message || 'Failed to log event',
      };
    }

    return { success: true };
  } catch (err) {
    // Catch any unexpected errors - never throw
    logger.error('[AnalyticsService] Exception in logEvent', {
      error: err.message,
      stack: err.stack,
      email: normalizedEmail,
      eventName
    });
    return {
      success: false,
      error: err.message || 'Unexpected error logging event',
    };
  }
}

/**
 * Log multiple analytics events in batch
 * Validates each event and performs batch insert
 * Returns aggregated result with success/failure counts
 * 
 * @param {Array<Object>} events - Array of event objects
 * @param {string} [ip] - IP address for throttling (optional)
 * @returns {Promise<Object>} Result with success status and counts
 */
async function logEvents(events, ip) {
  try {
    if (!Array.isArray(events) || events.length === 0) {
      return {
        success: false,
        error: 'Events array is required and must not be empty',
      };
    }

    // Validate array schema
    const arrayValidation = analyticsEventArraySchema.safeParse(events);
    if (!arrayValidation.success) {
      return {
        success: false,
        error: 'Validation failed',
        details: arrayValidation.error.flatten(),
      };
    }

    const validatedEvents = arrayValidation.data;
    const insertDataArray = [];
    const results = {
      success: true,
      total: validatedEvents.length,
      successful: 0,
      failed: 0,
      errors: [],
    };

    // Process each event and prepare insert data
    for (let i = 0; i < validatedEvents.length; i++) {
      const event = validatedEvents[i];
      const normalizedEmail = normalizeEmail(event.email);

      // Check throttling for each event
      const throttleCheck = checkThrottle(normalizedEmail, ip, event.eventName);
      if (throttleCheck.throttled) {
        results.failed++;
        results.errors.push({
          index: i,
          error: 'Rate limit exceeded',
          details: { reason: throttleCheck.reason },
        });
        continue;
      }

      // Prepare insert data
      insertDataArray.push({
        email: normalizedEmail,
        event_name: event.eventName,
        plugin_slug: event.plugin || null,
        source: event.source || 'plugin',
        event_data: event.eventData || {},
        identity_id: event.identityId || null,
        created_at: new Date().toISOString(),
      });
    }

    // Batch insert valid events
    if (insertDataArray.length > 0) {
      const { error: insertError } = await supabase
        .from('analytics_events')
        .insert(insertDataArray);

      if (insertError) {
        logger.error('[AnalyticsService] Error batch inserting events', {
          error: insertError.message,
          stack: insertError.stack,
          eventCount: insertDataArray.length
        });
        results.success = false;
        results.failed += insertDataArray.length;
        results.errors.push({
          error: insertError.message || 'Failed to batch insert events',
        });
      } else {
        results.successful = insertDataArray.length;
      }
    }

    // If all events failed, mark overall as failed
    if (results.successful === 0 && results.failed > 0) {
      results.success = false;
    }

    return results;
  } catch (err) {
    logger.error('[AnalyticsService] Exception in logEvents', {
      error: err.message,
      stack: err.stack,
      eventCount: events.length
    });
    return {
      success: false,
      error: err.message || 'Unexpected error logging events',
      total: events.length,
      successful: 0,
      failed: events.length,
      errors: [{ error: err.message || 'Unexpected error' }],
    };
  }
}

/**
 * Log an analytics event in the background
 * Wraps logEvent in setImmediate to ensure plugin calls don't slow down UX
 * Returns immediately with { success: true } (fire-and-forget pattern)
 * 
 * @param {Object} params - Event parameters (same as logEvent)
 * @returns {Object} Always returns { success: true } immediately
 */
function logEventBackground({ email, eventName, plugin, source, eventData, identityId, ip }) {
  // Use setImmediate to defer execution to next event loop tick
  setImmediate(() => {
    logEvent({ email, eventName, plugin, source, eventData, identityId, ip }).catch((err) => {
      // Even if logEvent fails, we don't want to throw or log to console
      // since this is a background operation
      logger.error('[AnalyticsService] Background event logging failed', {
        error: err.message,
        stack: err.stack,
        email,
        eventName
      });
    });
  });

  // Return immediately - fire and forget
  return { success: true };
}

/**
 * Get analytics summary for a user
 * Aggregates events by event name and date for dashboard charts
 * 
 * @param {string} email - User email
 * @param {Object} [options] - Options
 * @param {number} [options.days] - Number of days to look back (default: 30)
 * @param {Date} [options.startDate] - Start date (overrides days)
 * @param {Date} [options.endDate] - End date (default: now)
 * @returns {Promise<Object>} Summary data
 */
async function getAnalyticsSummary(email, options = {}) {
  try {
    const normalizedEmail = normalizeEmail(email);
    
    if (!normalizedEmail) {
      return {
        success: false,
        error: 'Email is required',
        summary: null,
      };
    }

    const endDate = options.endDate || new Date();
    const startDate = options.startDate || new Date(endDate.getTime() - (options.days || 30) * 24 * 60 * 60 * 1000);

    // Query events in date range
    const { data: events, error: queryError } = await supabase
      .from('analytics_events')
      .select('event_name, created_at, event_data')
      .eq('email', normalizedEmail)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });

    if (queryError) {
      logger.error('[AnalyticsService] Error querying analytics summary', {
        error: queryError.message,
        stack: queryError.stack,
        email: normalizedEmail
      });
      return {
        success: false,
        error: queryError.message || 'Failed to query analytics summary',
        summary: null,
      };
    }

    // Aggregate events
    const eventCounts = {};
    const dailyEvents = {}; // date -> { eventName -> count }
    const totalEvents = events?.length || 0;

    events?.forEach((event) => {
      const eventName = event.event_name;
      const eventDate = new Date(event.created_at).toISOString().split('T')[0]; // YYYY-MM-DD

      // Count by event name
      eventCounts[eventName] = (eventCounts[eventName] || 0) + 1;

      // Group by day and event name
      if (!dailyEvents[eventDate]) {
        dailyEvents[eventDate] = {};
      }
      dailyEvents[eventDate][eventName] = (dailyEvents[eventDate][eventName] || 0) + 1;
    });

    // Convert daily events to array format for charts
    const dailySeries = Object.entries(dailyEvents)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, eventCounts]) => ({
        date,
        events: eventCounts,
        total: Object.values(eventCounts).reduce((sum, count) => sum + count, 0),
      }));

    return {
      success: true,
      summary: {
        totalEvents,
        eventCounts,
        dailySeries,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      },
    };
  } catch (err) {
    logger.error('[AnalyticsService] Exception in getAnalyticsSummary', {
      error: err.message,
      stack: err.stack,
      email
    });
    return {
      success: false,
      error: err.message || 'Unexpected error getting analytics summary',
      summary: null,
    };
  }
}

/**
 * Get event counts for specific event names
 * 
 * @param {string} email - User email
 * @param {Array<string>} eventNames - Event names to count
 * @param {Object} [options] - Options
 * @param {number} [options.days] - Number of days to look back (default: 30)
 * @param {Date} [options.startDate] - Start date (overrides days)
 * @param {Date} [options.endDate] - End date (default: now)
 * @returns {Promise<Object>} Event counts
 */
async function getEventCounts(email, eventNames, options = {}) {
  try {
    const normalizedEmail = normalizeEmail(email);
    
    if (!normalizedEmail) {
      return {
        success: false,
        error: 'Email is required',
        counts: {},
      };
    }

    if (!Array.isArray(eventNames) || eventNames.length === 0) {
      return {
        success: false,
        error: 'Event names array is required',
        counts: {},
      };
    }

    const endDate = options.endDate || new Date();
    const startDate = options.startDate || new Date(endDate.getTime() - (options.days || 30) * 24 * 60 * 60 * 1000);

    // Query events for specific event names
    const { data: events, error: queryError } = await supabase
      .from('analytics_events')
      .select('event_name')
      .eq('email', normalizedEmail)
      .in('event_name', eventNames)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (queryError) {
      logger.error('[AnalyticsService] Error querying event counts', {
        error: queryError.message,
        stack: queryError.stack,
        email: normalizedEmail,
        eventNames
      });
      return {
        success: false,
        error: queryError.message || 'Failed to query event counts',
        counts: {},
      };
    }

    // Count events by name
    const counts = {};
    eventNames.forEach((name) => {
      counts[name] = 0;
    });

    events?.forEach((event) => {
      const eventName = event.event_name;
      if (eventNames.includes(eventName)) {
        counts[eventName] = (counts[eventName] || 0) + 1;
      }
    });

    return {
      success: true,
      counts,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    };
  } catch (err) {
    logger.error('[AnalyticsService] Exception in getEventCounts', {
      error: err.message,
      stack: err.stack,
      email,
      eventNames
    });
    return {
      success: false,
      error: err.message || 'Unexpected error getting event counts',
      counts: {},
    };
  }
}

/**
 * Clear throttle maps (for testing)
 */
function clearThrottleMaps() {
  emailThrottleMap.clear();
  ipThrottleMap.clear();
  duplicateEventMap.clear();
}

module.exports = {
  logEvent,
  logEvents,
  logEventBackground,
  getAnalyticsSummary,
  getEventCounts,
  // Expose throttle check for testing
  _checkThrottle: checkThrottle,
  clearThrottleMaps, // For testing
};
