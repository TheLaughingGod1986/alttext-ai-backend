-- Database Optimization and Cleanup Migration
-- Date: 2025-12-01
-- Purpose: Add missing indexes and analyze unused tables

-- ============================================
-- 1. ADD MISSING INDEXES FOR PERFORMANCE
-- ============================================

-- Licenses table indexes
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);
-- Note: auto_attach_status index already created in previous migration

-- Usage logs indexes (frequently queried)
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_license_id ON usage_logs(license_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_site_hash ON usage_logs(site_hash);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);

-- Credits table indexes
CREATE INDEX IF NOT EXISTS idx_credits_user_id ON credits(user_id);

-- Subscriptions table indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Password reset tokens indexes
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- License sites indexes (if table exists)
CREATE INDEX IF NOT EXISTS idx_license_sites_license_id ON license_sites(license_id);
CREATE INDEX IF NOT EXISTS idx_license_sites_site_hash ON license_sites(site_hash);

-- ============================================
-- 2. ANALYSIS QUERIES (Run separately to review)
-- ============================================

-- Check table row counts for unused tables
-- Uncomment to run:
/*
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
FROM sessions;
*/

-- Check if 'sites' table exists (code references it)
-- Uncomment to run:
/*
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'sites'
) as sites_table_exists;
*/

-- Table size analysis
-- Uncomment to run:
/*
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;
*/

-- ============================================
-- 3. CLEANUP: DROP UNUSED TABLES (OPTIONAL - REVIEW FIRST!)
-- ============================================

-- WARNING: Only run these after verifying:
-- 1. Tables have 0 rows (or data you don't need)
-- 2. No external services depend on them
-- 3. No future features planned that need them
-- 4. No database views or functions reference them

-- Uncomment to drop unused tables:
/*
DROP TABLE IF EXISTS generation_requests CASCADE;
DROP TABLE IF EXISTS queue_jobs CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
*/

-- Note: Keep license_sites until we verify if 'sites' table exists
-- The codebase references 'sites' but database might use 'license_sites'

