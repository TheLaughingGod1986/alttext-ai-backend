/**
 * Execute migration via Supabase REST API
 * Uses direct HTTP requests to execute SQL
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function executeMigration() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  // Read migration file
  const migrationPath = path.resolve(__dirname, '../db/migrations/20251201_add_auto_attach_status_to_licenses.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded');
  console.log('📡 Connecting to Supabase...');
  console.log('');

  // Extract project reference
  const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
  console.log(`   Project: ${projectRef}`);
  console.log('');

  // Split SQL into individual statements, handling comments properly
  const statements = sql
    .split(';')
    .map(s => {
      // Remove single-line comments
      const lines = s.split('\n').map(line => {
        const commentIndex = line.indexOf('--');
        return commentIndex >= 0 ? line.substring(0, commentIndex) : line;
      });
      return lines.join('\n').trim();
    })
    .filter(s => s && s.length > 0);

  console.log(`🚀 Executing ${statements.length} SQL statement(s)...`);
  console.log('');

  try {
    // Try to execute via Supabase Management API or SQL execution endpoint
    // Note: Supabase doesn't expose DDL execution via REST API for security
    // We'll try the Management API first
    
    const mgmtApiUrl = `https://api.supabase.com/v1/projects/${projectRef}`;
    
    // Try to execute SQL via Management API
    try {
      // First, try to get database connection info
      const connectionResponse = await axios.get(
        `${mgmtApiUrl}/database/connection-string`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey
          }
        }
      );

      if (connectionResponse.data) {
        console.log('✅ Got database connection info');
        // Use the connection string to execute SQL
        const { Client } = require('pg');
        const client = new Client({ connectionString: connectionResponse.data });
        
        await client.connect();
        console.log('✅ Connected to database');
        console.log('');
        
        // Execute all statements
        for (let i = 0; i < statements.length; i++) {
          const statement = statements[i];
          if (!statement) continue;
          
          console.log(`   [${i + 1}/${statements.length}] Executing...`);
          await client.query(statement);
          console.log(`   ✅ Statement ${i + 1} executed`);
        }
        
        // Verify
        console.log('');
        console.log('🔍 Verifying migration...');
        const verifyResult = await client.query(`
          SELECT column_name, data_type, column_default 
          FROM information_schema.columns 
          WHERE table_name = 'licenses' 
          AND column_name = 'auto_attach_status'
        `);
        
        if (verifyResult.rows.length > 0) {
          console.log('✅ Migration executed successfully!');
          console.log('✅ Verified: auto_attach_status column exists');
          console.log(`   Type: ${verifyResult.rows[0].data_type}`);
          console.log(`   Default: ${verifyResult.rows[0].column_default || 'NULL'}`);
        }
        
        await client.end();
        return;
      }
    } catch (mgmtError) {
      // Management API didn't work, try alternative
      console.log('⚠️  Management API not available, trying alternative method...');
    }

    // Alternative: Try using Supabase's SQL execution via REST API
    // This typically requires a custom RPC function
    console.log('📋 Supabase REST API does not support DDL statements directly.');
    console.log('   Please run this migration using one of these methods:');
    console.log('');
    console.log('   1. Set DATABASE_URL in .env and use:');
    console.log('      node scripts/run-migration-direct.js');
    console.log('');
    console.log('   2. Run manually in Supabase SQL Editor');
    console.log('      Go to: Supabase Dashboard > SQL Editor');
    console.log('');
    console.log('   SQL to execute:');
    console.log('─'.repeat(70));
    console.log(sql);
    console.log('─'.repeat(70));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

executeMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

