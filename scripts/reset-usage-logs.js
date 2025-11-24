/**
 * Reset usage_logs for current month
 * This will clear all usage_logs entries to match the credit reset
 */

require('dotenv').config();
const { supabase } = require('../db/supabase-client');

async function resetUsageLogs() {
  try {
    console.log('🔄 Starting usage_logs reset...\n');

    // Get current month start date
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    console.log(`📅 Resetting usage_logs from ${monthStart} onwards\n`);

    // Get count of entries to delete
    const { count, error: countError } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', monthStart);

    if (countError) {
      throw new Error(`Failed to count usage_logs: ${countError.message}`);
    }

    console.log(`📊 Found ${count || 0} usage_logs entries from this month`);

    if (count === 0) {
      console.log('ℹ️  No usage_logs entries to delete.');
      return;
    }

    // Delete all usage_logs from this month
    // Note: Supabase doesn't support delete without a filter, so we'll delete by date range
    const { data: deletedData, error: deleteError } = await supabase
      .from('usage_logs')
      .delete()
      .gte('created_at', monthStart);

    if (deleteError) {
      throw new Error(`Failed to delete usage_logs: ${deleteError.message}`);
    }

    console.log(`✅ Successfully deleted ${count} usage_logs entries from this month`);

    // Verify
    const { count: verifyCount, error: verifyError } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', monthStart);

    if (!verifyError) {
      console.log(`🔍 Verification: ${verifyCount || 0} entries remaining from this month`);
    }

  } catch (error) {
    console.error('❌ Error resetting usage_logs:', error);
    process.exit(1);
  }
}

resetUsageLogs()
  .then(() => {
    console.log('\n✨ Usage logs reset completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

