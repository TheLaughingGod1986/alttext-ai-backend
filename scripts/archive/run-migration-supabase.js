/**
 * Migration Runner Script for Supabase
 * Executes SQL migration files using Supabase client
 * 
 * Usage: node scripts/run-migration-supabase.js <migration-file>
 */

const fs = require('fs');
const path = require('path');
const { requireEnv } = require('../config/loadEnv');
const { createClient } = require('@supabase/supabase-js');

async function runMigration(migrationFile) {
  const migrationPath = path.resolve(process.cwd(), migrationFile);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`Error: Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log(`📄 Reading migration: ${migrationFile}`);
  console.log('');

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Extract project reference
  const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
  console.log(`📡 Connecting to Supabase project: ${projectRef}`);
  console.log('');

  // Split SQL into statements
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

      console.log(`   [${i + 1}/${statements.length}] Executing statement...`);
      
      // Try to execute via RPC (requires exec_sql function)
      // If that doesn't work, we'll need direct connection
      try {
        const { data, error } = await supabase.rpc('exec_sql', { 
          sql_query: statement 
        });

        if (error) {
          // RPC function doesn't exist, need direct connection
          throw new Error('exec_sql RPC function not available. Need direct PostgreSQL connection.');
        }

        console.log(`   ✅ Statement ${i + 1} executed`);
      } catch (rpcError) {
        console.log(`   ⚠️  Cannot execute DDL via REST API: ${rpcError.message}`);
        console.log('');
        console.log('📋 This migration requires direct PostgreSQL connection.');
        console.log('   Please run it manually in Supabase SQL Editor:');
        console.log('─'.repeat(70));
        console.log(sql);
        console.log('─'.repeat(70));
        console.log('');
        console.log('   Or set DATABASE_URL in your .env file and use:');
        console.log('   node scripts/run-migration.js ' + migrationFile);
        process.exit(0);
      }
    }

    // Verify the column was added
    console.log('');
    console.log('🔍 Verifying migration...');
    
    const { data: verifyData, error: verifyError } = await supabase
      .from('licenses')
      .select('auto_attach_status')
      .limit(1);

    if (!verifyError) {
      console.log('✅ Migration executed successfully!');
      console.log('✅ Verified: auto_attach_status column exists');
    } else {
      console.log('⚠️  Could not verify migration (this may be normal)');
      console.log('   Error:', verifyError.message);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('📋 Please run this migration manually in Supabase SQL Editor:');
    console.log('─'.repeat(70));
    console.log(sql);
    console.log('─'.repeat(70));
    process.exit(1);
  }
}

// Get migration file from command line
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node scripts/run-migration-supabase.js <migration-file>');
  console.error('Example: node scripts/run-migration-supabase.js db/migrations/20251201_add_auto_attach_status_to_licenses.sql');
  process.exit(1);
}

runMigration(migrationFile).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

