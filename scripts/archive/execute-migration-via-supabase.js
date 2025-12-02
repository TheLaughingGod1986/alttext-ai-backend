/**
 * Execute migration via Supabase client
 * Uses Supabase REST API to execute SQL migration
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function executeMigration() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Read migration file
  const migrationPath = path.resolve(__dirname, '../db/migrations/20251201_add_auto_attach_status_to_licenses.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded');
  console.log('📡 Connecting to Supabase...');
  console.log('');

  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && s.length > 0);

  console.log(`🚀 Executing ${statements.length} SQL statement(s)...`);
  console.log('');

  try {
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue;

      console.log(`   [${i + 1}/${statements.length}] ${statement.substring(0, 50)}...`);

      // Try to execute via RPC function (if it exists)
      // Otherwise, we'll need to use direct connection
      try {
        const { data, error } = await supabase.rpc('exec_sql', { 
          sql_query: statement 
        });

        if (error) {
          throw error;
        }

        console.log(`   ✅ Statement ${i + 1} executed`);
      } catch (rpcError) {
        // RPC doesn't exist, try direct execution via REST API
        console.log(`   ⚠️  RPC not available, trying direct execution...`);
        
        // Supabase doesn't support DDL via REST API directly
        // We need to use the Management API or direct connection
        throw new Error('DDL statements require direct PostgreSQL connection. Please set DATABASE_URL.');
      }
    }

    // Verify the migration
    console.log('');
    console.log('🔍 Verifying migration...');
    
    const { data: testData, error: testError } = await supabase
      .from('licenses')
      .select('auto_attach_status')
      .limit(1);

    if (!testError) {
      console.log('✅ Migration executed successfully!');
      console.log('✅ Verified: auto_attach_status column exists');
    } else {
      console.log('⚠️  Could not verify (this may be normal):', testError.message);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('📋 Note: Supabase REST API does not support DDL statements (ALTER TABLE, etc.)');
    console.log('   You need to run this migration using one of these methods:');
    console.log('');
    console.log('   1. Set DATABASE_URL and use: node scripts/run-migration-direct.js');
    console.log('   2. Run manually in Supabase SQL Editor');
    console.log('');
    process.exit(1);
  }
}

executeMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

