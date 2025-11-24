/**
 * Check current credits state in database
 */

require('dotenv').config();
const { supabase } = require('../db/supabase-client');

async function checkCredits() {
  try {
    console.log('🔍 Checking credits in database...\n');

    // Get all credits records
    const { data: creditsRecords, error: fetchError } = await supabase
      .from('credits')
      .select('id, user_id, used_this_month, monthly_limit');

    if (fetchError) {
      throw new Error(`Failed to fetch credits: ${fetchError.message}`);
    }

    if (!creditsRecords || creditsRecords.length === 0) {
      console.log('ℹ️  No credits records found.');
      return;
    }

    console.log(`📊 Found ${creditsRecords.length} credits records:\n`);
    creditsRecords.forEach((record, index) => {
      const remaining = (record.monthly_limit || 0) - (record.used_this_month || 0);
      console.log(`Record ${index + 1}:`);
      console.log(`   User ID: ${record.user_id}`);
      console.log(`   Monthly Limit: ${record.monthly_limit || 0}`);
      console.log(`   Used This Month: ${record.used_this_month || 0}`);
      console.log(`   Remaining: ${remaining}`);
      console.log('');
    });

    // Also check usage_logs count
    console.log('📋 Checking usage_logs counts:\n');
    for (const record of creditsRecords) {
      const { count, error: countError } = await supabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', record.user_id);

      if (!countError) {
        console.log(`User ${record.user_id}: ${count || 0} usage log entries`);
      }
    }

  } catch (error) {
    console.error('❌ Error checking credits:', error);
    process.exit(1);
  }
}

checkCredits()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

