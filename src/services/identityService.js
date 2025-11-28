/**
 * Unified Identity Service
 * Handles unified identity management, linking all user data to a single identity
 */

const { supabase } = require('../../db/supabase-client');

/**
 * Normalize email address
 * @param {string} email - Email address
 * @returns {string} Normalized email
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new Error('Email is required and must be a string');
  }
  return email.toLowerCase().trim();
}

/**
 * Get or create identity for an email
 * Normalizes email, finds existing identity or creates new one, updates last_seen_at
 * @param {string} email - User email address
 * @returns {Promise<Object>} Result with identityId
 */
async function getOrCreateIdentity(email) {
  try {
    const normalizedEmail = normalizeEmail(email);

    // Find existing identity
    const { data: existing, error: lookupError } = await supabase
      .from('identities')
      .select('id, email, last_seen_at')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (lookupError && lookupError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine, log other errors
      console.error('[IdentityService] Error looking up identity:', lookupError);
      throw new Error(`Failed to lookup identity: ${lookupError.message}`);
    }

    if (existing) {
      // Update last_seen_at
      const { error: updateError } = await supabase
        .from('identities')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[IdentityService] Error updating last_seen_at:', updateError);
        // Don't throw - identity exists, just failed to update timestamp
      }

      return { identityId: existing.id };
    }

    // Create new identity
    const { data: created, error: insertError } = await supabase
      .from('identities')
      .insert({
        email: normalizedEmail,
        created_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[IdentityService] Failed to create identity:', insertError);
      throw new Error(`Failed to create identity: ${insertError.message}`);
    }

    return { identityId: created.id };
  } catch (err) {
    console.error('[IdentityService] Exception in getOrCreateIdentity:', err);
    throw err;
  }
}

/**
 * Link a record to an identity
 * Generic function to link any record (installation, subscription, usage log, email event) to an identity
 * @param {Object} params - Link parameters
 * @param {string} params.table - Table name (plugin_installations, subscriptions, usage_logs, email_events)
 * @param {string} params.recordId - Record ID (uuid or other identifier)
 * @param {string} params.identityId - Identity ID (uuid)
 * @returns {Promise<Object>} Result with success status
 */
async function linkRecordToIdentity({ table, recordId, identityId }) {
  try {
    if (!table || !recordId || !identityId) {
      throw new Error('table, recordId, and identityId are required');
    }

    // Validate table name
    const validTables = ['plugin_installations', 'subscriptions', 'usage_logs', 'email_events'];
    if (!validTables.includes(table)) {
      throw new Error(`Invalid table: ${table}. Must be one of: ${validTables.join(', ')}`);
    }

    // Determine the ID column name based on table
    // Most tables use 'id', but we'll use a mapping for safety
    const idColumn = 'id';

    // Update the record with identity_id
    const { error: updateError } = await supabase
      .from(table)
      .update({ identity_id: identityId })
      .eq(idColumn, recordId);

    if (updateError) {
      console.error(`[IdentityService] Error linking ${table} record ${recordId} to identity ${identityId}:`, updateError);
      throw new Error(`Failed to link record: ${updateError.message}`);
    }

    return { success: true };
  } catch (err) {
    console.error('[IdentityService] Exception in linkRecordToIdentity:', err);
    throw err;
  }
}

/**
 * Get full identity profile
 * Returns complete profile with all linked data: installations, subscriptions, usage summary, email events
 * @param {string} identityId - Identity ID (uuid)
 * @returns {Promise<Object>} Full identity profile
 */
async function getFullIdentityProfile(identityId) {
  try {
    if (!identityId) {
      throw new Error('identityId is required');
    }

    // Get identity
    const { data: identity, error: identityError } = await supabase
      .from('identities')
      .select('id, email, created_at, last_seen_at')
      .eq('id', identityId)
      .single();

    if (identityError || !identity) {
      throw new Error(`Identity not found: ${identityId}`);
    }

    // Fetch all related data in parallel
    const [installationsResult, subscriptionsResult, usageLogsResult, emailEventsResult] = await Promise.all([
      // Get installations
      supabase
        .from('plugin_installations')
        .select('*')
        .eq('identity_id', identityId),
      // Get subscriptions
      supabase
        .from('subscriptions')
        .select('*')
        .eq('identity_id', identityId),
      // Get usage logs
      supabase
        .from('usage_logs')
        .select('*')
        .eq('identity_id', identityId)
        .order('created_at', { ascending: false }),
      // Get email events
      supabase
        .from('email_events')
        .select('*')
        .eq('identity_id', identityId)
        .order('sent_at', { ascending: false }),
    ]);

    // Extract data or use empty arrays
    const installations = installationsResult.data || [];
    if (installationsResult.error && installationsResult.error.code !== 'PGRST116') {
      console.error('[IdentityService] Error fetching installations:', installationsResult.error);
    }

    const subscriptions = subscriptionsResult.data || [];
    if (subscriptionsResult.error && subscriptionsResult.error.code !== 'PGRST116') {
      console.error('[IdentityService] Error fetching subscriptions:', subscriptionsResult.error);
    }

    const usageLogs = usageLogsResult.data || [];
    if (usageLogsResult.error && usageLogsResult.error.code !== 'PGRST116') {
      console.error('[IdentityService] Error fetching usage logs:', usageLogsResult.error);
    }

    const emailEvents = emailEventsResult.data || [];
    if (emailEventsResult.error && emailEventsResult.error.code !== 'PGRST116') {
      console.error('[IdentityService] Error fetching email events:', emailEventsResult.error);
    }

    // Calculate usage summary from usage logs
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const monthlyLogs = usageLogs.filter(log => {
      const logDate = new Date(log.created_at);
      return logDate >= startOfMonth;
    });

    const dailyLogs = usageLogs.filter(log => {
      const logDate = new Date(log.created_at);
      return logDate >= startOfDay;
    });

    const usageSummary = {
      monthlyImages: monthlyLogs.length,
      dailyImages: dailyLogs.length,
      totalImages: usageLogs.length,
    };

    // Build and return full profile
    return {
      id: identity.id,
      email: identity.email,
      createdAt: identity.created_at,
      lastSeenAt: identity.last_seen_at,
      installations,
      subscriptions,
      usageSummary,
      emailEvents,
    };
  } catch (err) {
    console.error('[IdentityService] Exception in getFullIdentityProfile:', err);
    throw err;
  }
}

module.exports = {
  getOrCreateIdentity,
  linkRecordToIdentity,
  getFullIdentityProfile,
  normalizeEmail,
};
