/**
 * Database Cleanup and Optimization Script
 * Uses Supabase MCP to analyze and optimize the database
 */

require('dotenv').config();

// This script will be executed via MCP
// It analyzes table usage and provides SQL for cleanup

const CLEANUP_SQL = `
-- Database Cleanup and Optimization Script
-- Generated based on codebase analysis

-- ============================================
-- 1. VERIFY TABLE USAGE
-- ============================================

-- Check if 'sites' table exists (code references it, but DB might have 'license_sites')
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

-- ============================================
-- 2. UNUSED TABLES ANALYSIS
-- ============================================

-- Tables that appear unused in codebase:
-- - generation_requests (0 references)
-- - queue_jobs (0 references)  
-- - sessions (0 references)
-- Note: license_sites might be used if 'sites' table doesn't exist

-- Check row counts for unused tables
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

-- ============================================
-- 3. OPTIMIZATION: ADD MISSING INDEXES
-- ============================================

-- Indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_auto_attach_status ON licenses(auto_attach_status);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_license_id ON usage_logs(license_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_site_hash ON usage_logs(site_hash);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_credits_user_id ON credits(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- ============================================
-- 4. CLEANUP: DROP UNUSED TABLES (OPTIONAL)
-- ============================================

-- WARNING: Only run these if you've verified the tables are truly unused
-- and have no data you need to keep

-- DROP TABLE IF EXISTS generation_requests CASCADE;
-- DROP TABLE IF EXISTS queue_jobs CASCADE;
-- DROP TABLE IF EXISTS sessions CASCADE;

-- Note: Keep license_sites if 'sites' table doesn't exist
-- The code might be using it under a different name

-- ============================================
-- 5. VERIFY FOREIGN KEY CONSTRAINTS
-- ============================================

SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- ============================================
-- 6. TABLE SIZE ANALYSIS
-- ============================================

SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
`;

console.log('📋 Database Cleanup and Optimization SQL Generated');
console.log('='.repeat(70));
console.log(CLEANUP_SQL);
console.log('='.repeat(70));
console.log('\n💡 To execute:');
console.log('   1. Copy the SQL above');
console.log('   2. Run it in Supabase SQL Editor');
console.log('   3. Review results before dropping any tables');

module.exports = { CLEANUP_SQL };

