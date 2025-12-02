/**
 * Execute Production Database Optimization
 * Uses Supabase client to execute optimization SQL
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function executeOptimization() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log('🚀 Production Database Optimization');
  console.log('='.repeat(70));
  console.log('');

  // Read the optimization SQL
  const sqlPath = path.resolve(__dirname, '../db/migrations/20251201_production_optimization.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && s.length > 0);

  console.log(`📋 Executing ${statements.length} SQL statements...`);
  console.log('');

  // Note: Supabase REST API doesn't support DDL statements directly
  // We need to use direct PostgreSQL connection or Supabase SQL Editor
  console.log('⚠️  Supabase REST API does not support DDL statements (CREATE INDEX, ALTER TABLE, etc.)');
  console.log('');
  console.log('📋 Please execute the SQL manually:');
  console.log('');
  console.log('   1. Go to Supabase Dashboard > SQL Editor');
  console.log('   2. Copy the contents of: db/migrations/20251201_production_optimization.sql');
  console.log('   3. Paste and execute');
  console.log('');
  console.log('   Or set DATABASE_URL and run: node scripts/production-database-optimization.js');
  console.log('');
  console.log('SQL Preview:');
  console.log('-'.repeat(70));
  console.log(sql.substring(0, 500) + '...');
  console.log('-'.repeat(70));
}

executeOptimization().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

