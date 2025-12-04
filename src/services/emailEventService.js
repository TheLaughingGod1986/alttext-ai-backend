/**
 * Email Event Service
 * Handles logging and de-duplication of email events
 */

const { supabase } = require('../../db/supabase-client');

/**
 * Check if a recent event exists for the given email and event type
 * @param {Object} params - Query parameters
 * @param {string} params.email - Email address
 * @param {string} params.eventType - Event type (e.g., 'waitlist_welcome', 'dashboard_welcome')
 * @param {number} [params.windowMinutes=60] - Time window in minutes to check for recent events
 * @returns {Promise<boolean>} True if recent event exists, false otherwise
 */
async function hasRecentEvent({ email, eventType, windowMinutes = 60 }) {
  try {
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - windowMinutes);

    const { data, error } = await supabase
      .from('email_events')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('event_type', eventType)
      .gte('sent_at', windowStart.toISOString())
      .limit(1);

    if (error) {
      console.error('[EmailEventService] Error checking recent event:', error);
      // Don't throw - return false to allow email to be sent
      return false;
    }

    return (data && data.length > 0);
  } catch (error) {
    console.error('[EmailEventService] Exception checking recent event:', error);
    // Don't throw - return false to allow email to be sent
    return false;
  }
}

/**
 * Check if a recent event exists for the given email, plugin, and event type
 * Used for plugin-specific deduplication (e.g., plugin signup)
 * @param {Object} params - Query parameters
 * @param {string} params.email - Email address
 * @param {string} params.pluginSlug - Plugin slug/name
 * @param {string} params.eventType - Event type (e.g., 'plugin_signup')
 * @param {number} [params.windowMinutes=10] - Time window in minutes to check for recent events
 * @returns {Promise<boolean>} True if recent event exists, false otherwise
 */
async function hasRecentEventForPlugin({ email, pluginSlug, eventType, windowMinutes = 10 }) {
  try {
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - windowMinutes);

    const { data, error } = await supabase
      .from('email_events')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('plugin_slug', pluginSlug)
      .eq('event_type', eventType)
      .gte('sent_at', windowStart.toISOString())
      .limit(1);

    if (error) {
      console.error('[EmailEventService] Error checking recent plugin event:', error);
      // Don't throw - return false to allow email to be sent
      return false;
    }

    return (data && data.length > 0);
  } catch (error) {
    console.error('[EmailEventService] Exception checking recent plugin event:', error);
    // Don't throw - return false to allow email to be sent
    return false;
  }
}

/**
 * Log an email event to the database
 * @param {Object} params - Event parameters
 * @param {string} [params.userId] - User ID (optional)
 * @param {string} params.email - Email address
 * @param {string} [params.pluginSlug] - Plugin slug (optional)
 * @param {string} params.eventType - Event type
 * @param {Object} [params.context={}] - Additional context data
 * @param {boolean} [params.success=true] - Whether the email was sent successfully
 * @param {string} [params.emailId] - Resend email ID (optional)
 * @param {string} [params.errorMessage] - Error message if failed (optional)
 * @returns {Promise<Object>} Result with success status
 */
async function logEvent({
  userId = null,
  email,
  pluginSlug = null,
  eventType,
  context = {},
  success = true,
  emailId = null,
  errorMessage = null,
}) {
  try {
    const { data, error } = await supabase
      .from('email_events')
      .insert({
        user_id: userId,
        email: email.toLowerCase(),
        plugin_slug: pluginSlug,
        event_type: eventType,
        context,
        sent_at: new Date().toISOString(),
        email_id: emailId,
        success,
        error_message: errorMessage,
      })
      .select()
      .single();

    if (error) {
      console.error('[EmailEventService] Error logging event:', error);
      // Don't throw - logging failures shouldn't break email sending
      return { success: false, error: error.message };
    }

    return { success: true, eventId: data?.id || null };
  } catch (error) {
    console.error('[EmailEventService] Exception logging event:', error);
    // Don't throw - logging failures shouldn't break email sending
    return { success: false, error: error.message };
  }
}

module.exports = {
  hasRecentEvent,
  hasRecentEventForPlugin,
  logEvent,
};

