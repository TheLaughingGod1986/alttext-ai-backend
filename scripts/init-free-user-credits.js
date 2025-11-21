/**
 * Initialize credits records for existing free plan users
 * This script creates credits records with monthly_limit: 50 for all free users
 * who don't already have a credits record
 */

require('dotenv').config();
const { supabase } = require('../supabase-client');

async function initFreeUserCredits() {
  console.log('🔧 Initializing credits for free plan users...\n');

  try {
    // Get all free plan users
    const { data: freeUsers, error: usersError } = await supabase
      .from('users')
      .select('id, plan')
      .eq('plan', 'free');

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    if (!freeUsers || freeUsers.length === 0) {
      console.log('✅ No free users found');
      return;
    }

    console.log(`📋 Found ${freeUsers.length} free plan users\n`);

    // Get existing credits records
    const { data: existingCredits, error: creditsError } = await supabase
      .from('credits')
      .select('user_id');

    if (creditsError) {
      console.error('❌ Error fetching existing credits:', creditsError);
      return;
    }

    const existingUserIds = new Set((existingCredits || []).map(c => c.user_id));
    
    // Filter users who don't have credits records
    const usersNeedingCredits = freeUsers.filter(user => !existingUserIds.has(user.id));

    if (usersNeedingCredits.length === 0) {
      console.log('✅ All free users already have credits records');
      return;
    }

    console.log(`📝 Creating credits records for ${usersNeedingCredits.length} users...\n`);

    // Create credits records for users without them
    const creditsToInsert = usersNeedingCredits.map(user => ({
      user_id: user.id,
      plan: 'free',
      monthly_limit: 50, // Default free plan limit
      used_this_month: 0,
      total_used: 0,
      reset_date: new Date().toISOString().split('T')[0] // Today's date
    }));

    const { data: insertedCredits, error: insertError } = await supabase
      .from('credits')
      .insert(creditsToInsert)
      .select();

    if (insertError) {
      console.error('❌ Error inserting credits:', insertError);
      return;
    }

    console.log(`✅ Successfully created ${insertedCredits.length} credits records`);
    console.log('\n📊 Summary:');
    console.log(`   - Free users: ${freeUsers.length}`);
    console.log(`   - Already had credits: ${existingUserIds.size}`);
    console.log(`   - New credits created: ${insertedCredits.length}`);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the script
initFreeUserCredits()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

