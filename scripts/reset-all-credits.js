/**
 * Reset all users' credits to 0
 * This script sets used_this_month to 0 for all records in the credits table
 */

require('dotenv').config();
const { supabase } = require('../db/supabase-client');

async function resetAllCredits() {
  try {
    console.log('🔄 Starting credit reset for all users...');

    // Get all credits records
    const { data: creditsRecords, error: fetchError } = await supabase
      .from('credits')
      .select('id, user_id, used_this_month, monthly_limit');

    if (fetchError) {
      throw new Error(`Failed to fetch credits: ${fetchError.message}`);
    }

    if (!creditsRecords || creditsRecords.length === 0) {
      console.log('ℹ️  No credits records found. Nothing to reset.');
      return;
    }

    console.log(`📊 Found ${creditsRecords.length} credits records`);

    // Reset all used_this_month to 0
    // Update all records by updating each one individually (Supabase doesn't support update all without a filter)
    let updatedCount = 0;
    for (const record of creditsRecords) {
      const { error: updateError } = await supabase
        .from('credits')
        .update({ used_this_month: 0 })
        .eq('id', record.id);

      if (updateError) {
        console.error(`Failed to update record ${record.id}:`, updateError.message);
        continue;
      }
      updatedCount++;
    }

    console.log(`✅ Successfully reset credits for ${updatedCount} out of ${creditsRecords.length} users`);
    console.log('📋 Summary:');
    console.log(`   - Total records: ${creditsRecords.length}`);
    console.log(`   - All used_this_month values set to 0`);

    // Verify the update
    const { data: verifyRecords, error: verifyError } = await supabase
      .from('credits')
      .select('id, user_id, used_this_month')
      .limit(5);

    if (!verifyError && verifyRecords) {
      console.log('\n🔍 Verification (first 5 records):');
      verifyRecords.forEach(record => {
        console.log(`   - User ${record.user_id}: used_this_month = ${record.used_this_month}`);
      });
    }

  } catch (error) {
    console.error('❌ Error resetting credits:', error);
    process.exit(1);
  }
}

// Run the script
resetAllCredits()
  .then(() => {
    console.log('\n✨ Credit reset completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

