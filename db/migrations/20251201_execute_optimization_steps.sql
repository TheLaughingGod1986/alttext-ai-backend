-- Database Optimization - Execute All Steps
-- Date: 2025-12-01
-- Run this via Supabase MCP or SQL Editor

-- ============================================
-- STEP 1: CHECK TABLE NAME MISMATCH
-- ============================================

-- Check if 'sites' table exists (code references it)
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'sites'
) as sites_table_exists;

-- Check if 'license_sites' table exists (database has it)
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'license_sites'
) as license_sites_table_exists;

-- ============================================
-- STEP 2: CHECK ROW COUNTS FOR UNUSED TABLES
-- ============================================

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
-- STEP 3: ADD PERFORMANCE INDEXES
-- ============================================

-- Licenses table indexes
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);

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

-- License sites indexes
CREATE INDEX IF NOT EXISTS idx_license_sites_license_id ON license_sites(license_id);
CREATE INDEX IF NOT EXISTS idx_license_sites_site_hash ON license_sites(site_hash);

-- ============================================
-- STEP 4: VERIFY INDEXES WERE CREATED
-- ============================================

SELECT 
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- ============================================
-- STEP 5: TABLE SIZE ANALYSIS
-- ============================================

SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size,
  pg_total_relation_size('public.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

