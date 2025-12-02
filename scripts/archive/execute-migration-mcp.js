/**
 * Execute migration via Supabase MCP
 * Uses the Supabase MCP server to execute SQL migration
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function executeMigration() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];

  if (!projectRef) {
    console.error('Error: Could not extract project reference from SUPABASE_URL');
    process.exit(1);
  }

  if (!supabaseServiceKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required for MCP authentication');
    process.exit(1);
  }

  // Read migration file
  const migrationPath = path.resolve(__dirname, '../db/migrations/20251201_add_auto_attach_status_to_licenses.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded');
  console.log(`📡 Connecting to Supabase MCP (project: ${projectRef})...`);
  console.log('');

  // Supabase MCP endpoint
  const mcpUrl = `https://mcp.supabase.com/mcp?project_ref=${projectRef}`;

  try {
    // Split SQL into statements
    const statements = sql
      .split(';')
      .map(s => {
        const lines = s.split('\n').map(line => {
          const commentIndex = line.indexOf('--');
          return commentIndex >= 0 ? line.substring(0, commentIndex) : line;
        });
        return lines.join('\n').trim();
      })
      .filter(s => s && s.length > 0);

    console.log(`🚀 Executing ${statements.length} SQL statement(s) via MCP...`);
    console.log('');

    // Execute each statement via MCP
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue;

      console.log(`   [${i + 1}/${statements.length}] Executing...`);
      
      try {
        // Try to execute via MCP endpoint
        // Note: MCP typically uses JSON-RPC format
        const response = await axios.post(mcpUrl, {
          jsonrpc: '2.0',
          method: 'sql/execute',
          params: {
            query: statement
          },
          id: i + 1
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey
          }
        });

        if (response.data.error) {
          throw new Error(response.data.error.message || 'MCP execution error');
        }

        console.log(`   ✅ Statement ${i + 1} executed`);
      } catch (error) {
        console.error(`   ❌ Error executing statement ${i + 1}:`, error.message);
        if (error.response) {
          console.error('   Response:', error.response.data);
        }
        throw error;
      }
    }

    console.log('');
    console.log('✅ Migration executed successfully!');
    console.log('');
    console.log('🔍 Verifying migration...');

    // Verify by querying the column
    try {
      const verifyResponse = await axios.post(mcpUrl, {
        jsonrpc: '2.0',
        method: 'sql/query',
        params: {
          query: `
            SELECT column_name, data_type, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'licenses' 
            AND column_name = 'auto_attach_status'
          `
        },
        id: 'verify'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        }
      });

      if (verifyResponse.data.result && verifyResponse.data.result.length > 0) {
        const column = verifyResponse.data.result[0];
        console.log('✅ Verified: auto_attach_status column exists');
        console.log(`   Type: ${column.data_type}`);
        console.log(`   Default: ${column.column_default || 'NULL'}`);
      } else {
        console.log('⚠️  Could not verify column (this may be normal)');
      }
    } catch (verifyError) {
      console.log('⚠️  Could not verify migration (verification query failed)');
    }

  } catch (error) {
    console.error('❌ Error executing migration:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('');
    console.log('📋 If MCP execution fails, you can:');
    console.log('   1. Run manually in Supabase SQL Editor');
    console.log('   2. Set DATABASE_URL and use: node scripts/run-migration-direct.js');
    process.exit(1);
  }
}

executeMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

