-- Quick Database Health Check
-- Run this in Supabase SQL Editor to get a comprehensive health report
-- Date: 2025-12-01

-- ============================================
-- HEALTH CHECK SUMMARY
-- ============================================

WITH health_checks AS (
  -- 1. Table name check
  SELECT 
    'Table Name' as check_name,
    CASE 
      WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sites') 
      THEN '✅ PASS: sites table exists' 
      WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'license_sites') 
      THEN '⚠️  WARN: license_sites exists (should be renamed to sites)' 
      ELSE '❌ FAIL: Neither table exists' 
    END as status,
    1 as sort_order
  UNION ALL
  
  -- 2. Performance indexes count
  SELECT 
    'Performance Indexes' as check_name,
    CASE 
      WHEN COUNT(*) >= 10 THEN '✅ PASS: ' || COUNT(*) || ' indexes found'
      WHEN COUNT(*) >= 5 THEN '⚠️  WARN: Only ' || COUNT(*) || ' indexes (expected more)'
      ELSE '❌ FAIL: Only ' || COUNT(*) || ' indexes found'
    END as status,
    2 as sort_order
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
  UNION ALL
  
  -- 3. Unused tables cleanup
  SELECT 
    'Unused Tables' as check_name,
    CASE 
      WHEN COUNT(*) = 0 THEN '✅ PASS: All unused tables cleaned up'
      ELSE '⚠️  WARN: ' || COUNT(*) || ' unused tables still exist'
    END as status,
    3 as sort_order
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name IN ('generation_requests', 'queue_jobs', 'sessions')
  UNION ALL
  
  -- 4. Foreign key indexes
  SELECT 
    'Foreign Key Indexes' as check_name,
    CASE 
      WHEN COUNT(*) = 0 THEN '✅ PASS: All foreign keys have indexes'
      ELSE '⚠️  WARN: ' || COUNT(*) || ' foreign keys missing indexes'
    END as status,
    4 as sort_order
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND tablename = tc.table_name 
      AND (indexdef LIKE '%' || kcu.column_name || '%' OR indexname LIKE '%' || kcu.column_name || '%')
    )
  UNION ALL
  
  -- 5. Tables without primary keys
  SELECT 
    'Primary Keys' as check_name,
    CASE 
      WHEN COUNT(*) = 0 THEN '✅ PASS: All tables have primary keys'
      ELSE '❌ FAIL: ' || COUNT(*) || ' tables missing primary keys'
    END as status,
    5 as sort_order
  FROM information_schema.tables t
  LEFT JOIN information_schema.table_constraints tc
    ON t.table_schema = tc.table_schema
    AND t.table_name = tc.table_name
    AND tc.constraint_type = 'PRIMARY KEY'
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND tc.constraint_name IS NULL
  UNION ALL
  
  -- 6. Missing unique constraints
  SELECT 
    'Unique Constraints' as check_name,
    CASE 
      WHEN COUNT(*) = 0 THEN '✅ PASS: All critical columns have unique constraints'
      ELSE '⚠️  WARN: ' || COUNT(*) || ' columns missing unique constraints'
    END as status,
    6 as sort_order
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
  UNION ALL
  
  -- 7. Orphaned records
  SELECT 
    'Orphaned Records' as check_name,
    CASE 
      WHEN (
        (SELECT COUNT(*) FROM usage_logs ul LEFT JOIN licenses l ON ul.license_id = l.id WHERE ul.license_id IS NOT NULL AND l.id IS NULL) +
        (SELECT COUNT(*) FROM usage_logs ul LEFT JOIN users u ON ul.user_id = u.id WHERE ul.user_id IS NOT NULL AND u.id IS NULL) +
        (SELECT COUNT(*) FROM licenses l LEFT JOIN users u ON l.user_id = u.id WHERE l.user_id IS NOT NULL AND u.id IS NULL)
      ) = 0 THEN '✅ PASS: No orphaned records found'
      ELSE '⚠️  WARN: Some orphaned records found (check details below)'
    END as status,
    7 as sort_order
  UNION ALL
  
  -- 8. Large tables
  SELECT 
    'Table Sizes' as check_name,
    CASE 
      WHEN COUNT(*) = 0 THEN '✅ PASS: No tables larger than 100MB'
      WHEN COUNT(*) FILTER (WHERE pg_total_relation_size('public.'||tablename) > 1073741824) = 0 
      THEN '💡 INFO: ' || COUNT(*) || ' tables > 100MB (monitor growth)'
      ELSE '⚠️  WARN: ' || COUNT(*) || ' large tables (consider partitioning)'
    END as status,
    8 as sort_order
  FROM pg_tables
  WHERE schemaname = 'public'
    AND pg_total_relation_size('public.'||tablename) > 104857600
)
SELECT 
  check_name,
  status
FROM health_checks
ORDER BY sort_order;

-- ============================================
-- DETAILED RESULTS (if warnings found)
-- ============================================

-- Show all performance indexes
SELECT 
  '📊 Performance Indexes' as section,
  tablename,
  COUNT(*) as index_count,
  string_agg(indexname, ', ' ORDER BY indexname) as indexes
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
GROUP BY tablename
ORDER BY tablename;

-- Show missing foreign key indexes
SELECT 
  '🔗 Missing Foreign Key Indexes' as section,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = tc.table_name 
    AND (indexdef LIKE '%' || kcu.column_name || '%' OR indexname LIKE '%' || kcu.column_name || '%')
  )
ORDER BY tc.table_name, kcu.column_name;

-- Show missing unique constraints
SELECT 
  '🔑 Missing Unique Constraints' as section,
  table_name,
  column_name
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

-- Show orphaned records details
SELECT 
  '🔍 Orphaned Records Details' as section,
  'usage_logs (license_id)' as check_type,
  COUNT(*) as orphaned_count
FROM usage_logs ul
LEFT JOIN licenses l ON ul.license_id = l.id
WHERE ul.license_id IS NOT NULL AND l.id IS NULL
UNION ALL
SELECT 
  '🔍 Orphaned Records Details' as section,
  'usage_logs (user_id)' as check_type,
  COUNT(*) as orphaned_count
FROM usage_logs ul
LEFT JOIN users u ON ul.user_id = u.id
WHERE ul.user_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 
  '🔍 Orphaned Records Details' as section,
  'licenses (user_id)' as check_type,
  COUNT(*) as orphaned_count
FROM licenses l
LEFT JOIN users u ON l.user_id = u.id
WHERE l.user_id IS NOT NULL AND u.id IS NULL;

-- Show table sizes
SELECT 
  '📏 Table Sizes' as section,
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size,
  CASE 
    WHEN pg_total_relation_size('public.'||tablename) > 1073741824 THEN '⚠️  Consider partitioning (>1GB)'
    WHEN pg_total_relation_size('public.'||tablename) > 536870912 THEN '💡 Monitor size (>512MB)'
    ELSE '✅ OK'
  END as recommendation
FROM pg_tables
WHERE schemaname = 'public'
  AND pg_total_relation_size('public.'||tablename) > 104857600
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

