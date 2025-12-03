/**
 * Get DATABASE_URL and run migration
 * Attempts to get DATABASE_URL from Supabase or uses provided one
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Client } = require('pg');

async function getDatabaseUrl() {
  // First, check if DATABASE_URL is already set
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Try to get from Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    return null;
  }

  // Try Management API
  try {
    const response = await axios.get(
      `https://api.supabase.com/v1/projects/${projectRef}/database/connection-string`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        }
      }
    );
    return response.data;
  } catch (error) {
    // Management API requires different auth
    console.log('⚠️  Cannot get DATABASE_URL from Supabase API');
    return null;
  }
}

async function runMigration() {
  const migrationPath = path.resolve(__dirname, '../db/migrations/20251201_add_auto_attach_status_to_licenses.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded');
  console.log('');

  // Try to get DATABASE_URL
  console.log('🔍 Looking for DATABASE_URL...');
  const databaseUrl = await getDatabaseUrl();

  if (!databaseUrl) {
    console.log('❌ DATABASE_URL not found.');
    console.log('');
    console.log('📋 To get your DATABASE_URL:');
    console.log('   1. Go to Supabase Dashboard');
    console.log('   2. Select your project');
    console.log('   3. Go to Settings > Database');
    console.log('   4. Copy the "Connection string" (URI format)');
    console.log('   5. Add it to your .env file as: DATABASE_URL=postgresql://...');
    console.log('');
    console.log('   Or run this migration manually in Supabase SQL Editor');
    console.log('');
    console.log('   SQL to execute:');
    console.log('─'.repeat(70));
    console.log(sql);
    console.log('─'.repeat(70));
    process.exit(1);
  }

  console.log('✅ Found DATABASE_URL');
  console.log('🔌 Connecting to database...');
  console.log('');

  const client = new Client({ connectionString: databaseUrl });

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
    console.log('🔍 Verifying migration...');
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
    } else {
      console.log('⚠️  Column not found (verification failed)');
    }

  } catch (error) {
    console.error('❌ Error executing migration:', error.message);
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      console.log('');
      console.log('ℹ️  This might be expected if the migration was already run.');
      console.log('   The migration uses "IF NOT EXISTS" so it should be safe.');
    } else {
      console.error('');
      console.error('Full error:', error);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('');
    console.log('🔌 Database connection closed');
  }
}

runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

