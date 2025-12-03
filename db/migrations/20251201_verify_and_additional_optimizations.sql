-- Database Verification and Additional Optimizations
-- Date: 2025-12-01
-- Run this to verify optimizations and find additional improvements

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- 1. Check table name fix
SELECT 
  CASE 
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sites') 
    THEN '✅ sites table exists' 
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'license_sites') 
    THEN '⚠️  license_sites exists (should be renamed to sites)' 
    ELSE '❌ Neither table exists' 
  END as table_status;

-- 2. Verify all performance indexes
SELECT 
  tablename,
  COUNT(*) as index_count,
  string_agg(indexname, ', ' ORDER BY indexname) as indexes
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
GROUP BY tablename
ORDER BY tablename;

-- 3. Check if unused tables were dropped
SELECT 
  table_name,
  CASE 
    WHEN table_name IN ('generation_requests', 'queue_jobs', 'sessions') 
    THEN '⚠️  Still exists (should be dropped if empty)'
    ELSE '✅ Active table'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name IN ('generation_requests', 'queue_jobs', 'sessions', 'credits', 'licenses', 'password_reset_tokens', 'subscriptions', 'usage_logs', 'users', 'sites', 'license_sites')
ORDER BY table_name;

-- 4. Check for missing indexes on foreign keys
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND tablename = tc.table_name 
      AND (indexdef LIKE '%' || kcu.column_name || '%' OR indexname LIKE '%' || kcu.column_name || '%')
    ) THEN '✅ Indexed'
    ELSE '⚠️  Missing index'
  END as index_status
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

-- 5. Check for tables without primary keys (data integrity issue)
SELECT 
  t.table_name,
  '⚠️  Missing primary key' as issue
FROM information_schema.tables t
LEFT JOIN information_schema.table_constraints tc
  ON t.table_schema = tc.table_schema
  AND t.table_name = tc.table_name
  AND tc.constraint_type = 'PRIMARY KEY'
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND tc.constraint_name IS NULL
ORDER BY t.table_name;

-- 6. Check for missing unique constraints on important columns
SELECT 
  table_name,
  column_name,
  '⚠️  Should have unique constraint' as recommendation
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'users' AND column_name = 'email') OR
    (table_name = 'licenses' AND column_name = 'license_key') OR
    (table_name = 'subscriptions' AND column_name = 'stripe_subscription_id') OR
    (table_name = 'password_reset_tokens' AND column_name = 'token_hash')
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = information_schema.columns.table_name
      AND ccu.column_name = information_schema.columns.column_name
      AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
  )
ORDER BY table_name, column_name;

-- 7. Table size analysis
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size,
  pg_total_relation_size('public.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

-- ============================================
-- ADDITIONAL OPTIMIZATIONS (if needed)
-- ============================================

-- Add missing unique constraints (run only if verification shows they're missing)
/*
-- Ensure users.email is unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints 
    WHERE constraint_name = 'users_email_key'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
    RAISE NOTICE 'Added unique constraint on users.email';
  END IF;
END $$;

-- Ensure licenses.license_key is unique (should already exist, but verify)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints 
    WHERE constraint_name = 'licenses_license_key_key'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE licenses ADD CONSTRAINT licenses_license_key_key UNIQUE (license_key);
    RAISE NOTICE 'Added unique constraint on licenses.license_key';
  END IF;
END $$;

-- Ensure subscriptions.stripe_subscription_id is unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints 
    WHERE constraint_name = 'subscriptions_stripe_subscription_id_key'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
    RAISE NOTICE 'Added unique constraint on subscriptions.stripe_subscription_id';
  END IF;
END $$;

-- Ensure password_reset_tokens.token_hash is unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints 
    WHERE constraint_name = 'password_reset_tokens_token_hash_key'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);
    RAISE NOTICE 'Added unique constraint on password_reset_tokens.token_hash';
  END IF;
END $$;
*/

-- ============================================
-- CHECK FOR ORPHANED RECORDS
-- ============================================

-- Check for orphaned usage_logs (license_id pointing to non-existent license)
SELECT 
  'usage_logs' as table_name,
  COUNT(*) as orphaned_count
FROM usage_logs ul
LEFT JOIN licenses l ON ul.license_id = l.id
WHERE ul.license_id IS NOT NULL
  AND l.id IS NULL;

-- Check for orphaned usage_logs (user_id pointing to non-existent user)
SELECT 
  'usage_logs' as table_name,
  COUNT(*) as orphaned_count
FROM usage_logs ul
LEFT JOIN users u ON ul.user_id = u.id
WHERE ul.user_id IS NOT NULL
  AND u.id IS NULL;

-- Check for orphaned licenses (user_id pointing to non-existent user)
SELECT 
  'licenses' as table_name,
  COUNT(*) as orphaned_count
FROM licenses l
LEFT JOIN users u ON l.user_id = u.id
WHERE l.user_id IS NOT NULL
  AND u.id IS NULL;

-- ============================================
-- PERFORMANCE RECOMMENDATIONS
-- ============================================

-- Check for large tables that might benefit from partitioning
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size,
  CASE 
    WHEN pg_total_relation_size('public.'||tablename) > 1073741824 THEN '⚠️  Consider partitioning (>1GB)'
    WHEN pg_total_relation_size('public.'||tablename) > 536870912 THEN '💡 Monitor size (>512MB)'
    ELSE '✅ OK'
  END as recommendation
FROM pg_tables
WHERE schemaname = 'public'
  AND pg_total_relation_size('public.'||tablename) > 104857600  -- >100MB
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

