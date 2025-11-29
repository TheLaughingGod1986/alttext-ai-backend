#!/usr/bin/env node

/**
 * Daily Rollup Script
 * Summarizes daily usage per identity from events table
 * Caches output in daily_usage_summary table
 * Updates credits_balance cache from events rollup
 * 
 * Run daily via cron job (e.g., Render cron or similar)
 * Example cron: 0 2 * * * (runs at 2 AM daily)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../db/supabase-client');
const eventService = require('../src/services/eventService');

/**
 * Run daily rollup for all identities
 */
async function runDailyRollup() {
  try {
    console.log('[DailyRollup] Starting daily rollup process...');
    const startTime = Date.now();

    // Get yesterday's date (rollup for previous day)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const dateStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`[DailyRollup] Processing rollup for date: ${dateStr}`);

    // Get all identities that have events
    const { data: identities, error: identitiesError } = await supabase
      .from('identities')
      .select('id, email');

    if (identitiesError) {
      console.error('[DailyRollup] Error fetching identities:', identitiesError);
      process.exit(1);
    }

    if (!identities || identities.length === 0) {
      console.log('[DailyRollup] No identities found, skipping rollup');
      process.exit(0);
    }

    console.log(`[DailyRollup] Processing ${identities.length} identities...`);

    let processed = 0;
    let errors = 0;

    // Process each identity
    for (const identity of identities) {
      try {
        // Get events for yesterday
        const { data: events, error: eventsError } = await supabase
          .from('events')
          .select('event_type, credits_delta, created_at, metadata')
          .eq('identity_id', identity.id)
          .gte('created_at', yesterday.toISOString())
          .lte('created_at', yesterdayEnd.toISOString());

        if (eventsError) {
          console.error(`[DailyRollup] Error fetching events for identity ${identity.id}:`, eventsError);
          errors++;
          continue;
        }

        // Aggregate events
        let creditsPurchased = 0;
        let creditsUsed = 0;
        const eventsCount = events?.length || 0;

        (events || []).forEach((event) => {
          if (event.credits_delta > 0) {
            creditsPurchased += event.credits_delta;
          } else if (event.credits_delta < 0) {
            creditsUsed += Math.abs(event.credits_delta);
          }
        });

        // Upsert daily summary
        const { error: upsertError } = await supabase
          .from('daily_usage_summary')
          .upsert({
            identity_id: identity.id,
            date: dateStr,
            credits_purchased: creditsPurchased,
            credits_used: creditsUsed,
            events_count: eventsCount,
            metadata: {
              last_updated: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'identity_id,date',
          });

        if (upsertError) {
          console.error(`[DailyRollup] Error upserting summary for identity ${identity.id}:`, upsertError);
          errors++;
          continue;
        }

        // Update credits_balance cache from events rollup
        await eventService.updateCreditsBalanceCache(identity.id);

        processed++;
        if (processed % 100 === 0) {
          console.log(`[DailyRollup] Processed ${processed}/${identities.length} identities...`);
        }
      } catch (err) {
        console.error(`[DailyRollup] Exception processing identity ${identity.id}:`, err);
        errors++;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[DailyRollup] Completed in ${duration}s. Processed: ${processed}, Errors: ${errors}`);

    if (errors > 0) {
      console.warn(`[DailyRollup] Completed with ${errors} errors`);
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('[DailyRollup] Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runDailyRollup();
}

module.exports = { runDailyRollup };

