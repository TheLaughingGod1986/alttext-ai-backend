#!/usr/bin/env node
/**
 * Test Supabase Connection
 *
 * This script tests if your Supabase credentials are correct
 */

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testing Supabase Connection...\n');
console.log(`URL: ${SUPABASE_URL}`);
console.log(`Key: ${SUPABASE_KEY ? SUPABASE_KEY.substring(0, 20) + '...' : 'MISSING'}\n`);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n');
  console.log('Please update your .env.local file with correct credentials from:');
  console.log('https://supabase.com/dashboard → Your Project → Settings → API\n');
  process.exit(1);
}

async function testConnection() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('📡 Testing connection...');

    // Try to query a simple table (even if it doesn't exist, we'll get a proper error)
    const { data, error } = await supabase
      .from('_test_connection')
      .select('*')
      .limit(1);

    if (error) {
      // If it's a "table doesn't exist" error OR "not in schema cache", connection is working!
      if (error.code === '42P01' ||
          error.message.includes('does not exist') ||
          error.message.includes('schema cache') ||
          error.code === 'PGRST200') {
        console.log('✅ Connection successful!\n');
        console.log('📋 Next step: Create database tables');
        console.log('   Go to: https://supabase.com/dashboard');
        console.log('   → Your Project → SQL Editor');
        console.log('   → Copy SQL from: ../docs/DATABASE_SCHEMA.md\n');
        return true;
      }

      // Other errors mean connection issues
      console.error('❌ Connection error:', error.message);
      if (error.hint) {
        console.error('   Hint:', error.hint);
      }
      console.log('\n🔧 Fix:');
      console.log('   1. Go to https://supabase.com/dashboard');
      console.log('   2. Click your project');
      console.log('   3. Settings → API');
      console.log('   4. Copy the correct URL and service_role key');
      console.log('   5. Update .env.local\n');
      return false;
    }

    console.log('✅ Connection successful!');
    return true;

  } catch (err) {
    console.error('❌ Failed to connect:', err.message);

    if (err.message.includes('fetch failed') || err.message.includes('ENOTFOUND')) {
      console.log('\n🔧 The Supabase URL is incorrect or unreachable.');
      console.log('   Current URL:', SUPABASE_URL);
      console.log('\n   Please get the correct URL from:');
      console.log('   https://supabase.com/dashboard → Your Project → Settings → API\n');
    }

    return false;
  }
}

testConnection().then(success => {
  process.exit(success ? 0 : 1);
});
