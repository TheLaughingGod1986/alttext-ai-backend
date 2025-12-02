/**
 * Execute Database Optimization via MCP
 * This script contains all SQL statements to be executed via Supabase MCP
 */

const fs = require('fs');
const path = require('path');

// Read the optimization migration
const migrationPath = path.resolve(__dirname, '../db/migrations/20251201_database_optimization.sql');
const optimizationSQL = fs.readFileSync(migrationPath, 'utf8');

// Extract just the index creation statements (safe to run)
const indexSQL = optimizationSQL.split('-- ============================================')[1]
  .split('-- ============================================')[0]
  .trim();

console.log('📋 Database Optimization SQL (Index Creation)');
console.log('='.repeat(70));
console.log(indexSQL);
console.log('='.repeat(70));

// Analysis queries
const analysisSQL = `
-- Step 1: Check table name mismatch
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'sites'
) as sites_table_exists;

SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'license_sites'
) as license_sites_table_exists;

-- Step 2: Check row counts for unused tables
SELECT 
  'generation_requests' as table_name,
  COUNT(*) as row_count
FROM generation_requests
UNION ALL
SELECT 
  'queue_jobs' as table_name,
  COUNT(*) as row_count
FROM queue_jobs
UNION ALL
SELECT 
  'sessions' as table_name,
  COUNT(*) as row_count
FROM sessions
UNION ALL
SELECT 
  'license_sites' as table_name,
  COUNT(*) as row_count
FROM license_sites;
`;

console.log('\n📊 Analysis Queries');
console.log('='.repeat(70));
console.log(analysisSQL);
console.log('='.repeat(70));

module.exports = {
  indexSQL,
  analysisSQL,
  optimizationSQL
};

