/**
 * Check Supabase schema to verify column names
 */

require('dotenv').config();
const { supabase } = require('./supabase-client');

async function checkSchema() {
  console.log('🔍 Checking Supabase users table schema...\n');

  try {
    // Try to get column information
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error querying users table:', error);
      console.error('\nError details:');
      console.error('  Code:', error.code);
      console.error('  Message:', error.message);
      console.error('  Details:', error.details);
      console.error('  Hint:', error.hint);
      return;
    }

    if (data && data.length > 0) {
      console.log('✅ Users table exists and is accessible');
      console.log('\n📋 Column names found:');
      const columns = Object.keys(data[0]);
      columns.forEach(col => {
        console.log(`  - ${col}`);
      });
    } else {
      console.log('✅ Users table exists but is empty');
      console.log('\n⚠️  Cannot determine column names from empty table');
      console.log('   Try inserting a test user or check Supabase dashboard');
    }

    // Try a direct query to check for specific columns
    console.log('\n🔍 Testing specific columns...');
    
    const testColumns = [
      'passwordHash',
      'password_hash',
      'tokensRemaining',
      'tokens_remaining',
      'stripeCustomerId',
      'stripe_customer_id'
    ];

    for (const col of testColumns) {
      try {
        const { error: testError } = await supabase
          .from('users')
          .select(col)
          .limit(0);
        
        if (testError) {
          console.log(`  ❌ ${col}: NOT FOUND (${testError.message})`);
        } else {
          console.log(`  ✅ ${col}: EXISTS`);
        }
      } catch (e) {
        console.log(`  ❌ ${col}: ERROR - ${e.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkSchema();

