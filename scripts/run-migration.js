/**
 * Migration Runner Script
 * Executes SQL migration files against Supabase database using direct PostgreSQL connection
 * 
 * Usage: node scripts/run-migration.js <migration-file>
 * Example: node scripts/run-migration.js db/migrations/20251201_add_auto_attach_status_to_licenses.sql
 * 
 * Requires: DATABASE_URL environment variable or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs');
const path = require('path');
const { requireEnv, getEnv } = require('../config/loadEnv');
const axios = require('axios');

async function runMigration(migrationFile) {
  const migrationPath = path.resolve(process.cwd(), migrationFile);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`Error: Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log(`📄 Reading migration: ${migrationFile}`);
  console.log('');

  // Try to use pg library if available, otherwise fall back to manual instructions
  let pg;
  try {
    pg = require('pg');
  } catch (e) {
    console.log('⚠️  PostgreSQL client (pg) not installed.');
    console.log('   Install it with: npm install pg');
    console.log('');
    console.log('📋 Please run this migration manually in Supabase SQL Editor:');
    console.log('─'.repeat(70));
    console.log(sql);
    console.log('─'.repeat(70));
    console.log('');
    console.log('Or install pg and run this script again.');
    process.exit(0);
  }

  // Get database connection string or Supabase credentials
  const databaseUrl = getEnv('DATABASE_URL');
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  let connectionString = databaseUrl;

  // If no DATABASE_URL, try to construct from Supabase URL
  if (!connectionString && supabaseUrl && supabaseServiceKey) {
    // Extract project reference from Supabase URL
    const projectMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
    if (projectMatch) {
      const projectRef = projectMatch[1];
      // Try to construct connection string using service role key as password
      // Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
      // But we need the actual database password, not the service role key
      // So we'll try using Supabase REST API instead
      console.log('📡 Using Supabase REST API to execute migration...');
      console.log(`   Project: ${projectRef}`);
      console.log('');
      
      try {
        // Use Supabase client to execute SQL via RPC (if available) or direct query
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });

        // Split SQL into individual statements and execute them
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s && !s.startsWith('--'));

        console.log(`🚀 Executing ${statements.length} SQL statement(s)...`);
        console.log('');

        // Execute SQL using Supabase Management API or direct connection
        // Since Supabase REST API doesn't support raw SQL execution,
        // we need to use direct PostgreSQL connection
        // But first, let's try to get the connection string from Supabase API
        
        // Extract project reference
        const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
        
        if (projectRef) {
          // Try to get database connection info from Supabase Management API
          // This requires the Supabase access token, which we don't have
          // So we'll need to use the direct connection string
          console.log('   Note: Direct SQL execution requires DATABASE_URL');
          console.log('   Attempting to execute via Supabase client workaround...');
          console.log('');
          
          // Try executing each statement via Supabase client
          // Note: This won't work for DDL statements like ALTER TABLE
          // We need direct PostgreSQL connection for DDL
          throw new Error('DDL statements require direct PostgreSQL connection');
        }

        // Verify the column was added using Supabase client
        const { data: verifyData, error: verifyError } = await supabase
          .from('licenses')
          .select('auto_attach_status')
          .limit(1);

        if (!verifyError) {
          console.log('✅ Migration executed successfully!');
          console.log('✅ Verified: auto_attach_status column exists');
        } else {
          console.log('⚠️  Migration may have executed, but verification failed');
          console.log('   Error:', verifyError.message);
        }

        return;
      } catch (apiError) {
        console.log('⚠️  Could not execute via REST API:', apiError.message);
        console.log('   Falling back to direct PostgreSQL connection...');
        console.log('');
        // Fall through to direct connection attempt
      }
    }
  }

  // Try direct PostgreSQL connection
  if (!connectionString) {
    console.log('⚠️  DATABASE_URL not found and cannot construct from Supabase credentials.');
    console.log('   Please set DATABASE_URL in your .env file.');
    console.log('   You can find it in Supabase Dashboard > Settings > Database > Connection String');
    console.log('');
    console.log('📋 Please run this migration manually in Supabase SQL Editor:');
    console.log('─'.repeat(70));
    console.log(sql);
    console.log('─'.repeat(70));
    process.exit(0);
  }

  const client = new pg.Client({ connectionString });
  
  console.log('🔌 Connecting to database...');
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    console.log('');
    console.log('🚀 Executing migration...');
    console.log('');

    // Execute the SQL
    await client.query(sql);
    
    console.log('✅ Migration executed successfully!');
    console.log('');
    
    // Verify the column was added
    const verifyResult = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'licenses' 
      AND column_name = 'auto_attach_status'
    `);
    
    if (verifyResult.rows.length > 0) {
      console.log('✅ Verified: auto_attach_status column exists');
      console.log(`   Type: ${verifyResult.rows[0].data_type}`);
      console.log(`   Default: ${verifyResult.rows[0].column_default || 'NULL'}`);
    }
    
  } catch (error) {
    console.error('❌ Error executing migration:', error.message);
    console.error('');
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      console.log('ℹ️  This might be expected if the migration was already run.');
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('');
    console.log('🔌 Database connection closed');
  }
}

// Get migration file from command line
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node scripts/run-migration.js <migration-file>');
  console.error('Example: node scripts/run-migration.js db/migrations/20251201_add_auto_attach_status_to_licenses.sql');
  process.exit(1);
}

runMigration(migrationFile).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

