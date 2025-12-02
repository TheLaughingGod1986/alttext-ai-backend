/**
 * Migration Runner Script - Direct Execution
 * Executes SQL migration files using direct PostgreSQL connection
 * 
 * Usage: node scripts/run-migration-direct.js <migration-file>
 */

const fs = require('fs');
const path = require('path');
const { requireEnv, getEnv } = require('../config/loadEnv');

async function runMigration(migrationFile) {
  const migrationPath = path.resolve(process.cwd(), migrationFile);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`Error: Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log(`📄 Reading migration: ${migrationFile}`);
  console.log('');

  // Try to execute via Supabase client
  // Note: Supabase REST API doesn't support DDL statements directly
  // We need to use direct PostgreSQL connection for ALTER TABLE, etc.
  
  const databaseUrl = getEnv('DATABASE_URL');
  
  if (!databaseUrl) {
    console.log('⚠️  DATABASE_URL not found.');
    console.log('');
    console.log('📋 To run this migration, you have two options:');
    console.log('');
    console.log('Option 1: Set DATABASE_URL in your .env file');
    console.log('   Get it from: Supabase Dashboard > Settings > Database > Connection String');
    console.log('   Then run: node scripts/run-migration.js ' + migrationFile);
    console.log('');
    console.log('Option 2: Run manually in Supabase SQL Editor');
    console.log('   1. Go to Supabase Dashboard > SQL Editor');
    console.log('   2. Copy and paste the SQL below');
    console.log('   3. Click "Run"');
    console.log('');
    console.log('─'.repeat(70));
    console.log(sql);
    console.log('─'.repeat(70));
    process.exit(0);
  }

  // Use direct PostgreSQL connection
  const pg = require('pg');
  const client = new pg.Client({ connectionString: databaseUrl });
  
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
      console.log('   The migration uses "IF NOT EXISTS" so it should be safe.');
    } else {
      console.log('📋 If this fails, please run the migration manually in Supabase SQL Editor:');
      console.log('─'.repeat(70));
      console.log(sql);
      console.log('─'.repeat(70));
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
  console.error('Usage: node scripts/run-migration-direct.js <migration-file>');
  console.error('Example: node scripts/run-migration-direct.js db/migrations/20251201_add_auto_attach_status_to_licenses.sql');
  process.exit(1);
}

runMigration(migrationFile).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

