-- Verify Required Columns Exist
-- Check if auto_attach_status and created_at columns have been added
-- Date: 2025-12-01

-- ============================================
-- CHECK 1: auto_attach_status in licenses table
-- ============================================
SELECT 
  'licenses.auto_attach_status' as column_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'licenses' 
      AND column_name = 'auto_attach_status'
    ) THEN '✅ EXISTS (snake_case)'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'licenses' 
      AND column_name = 'autoAttachStatus'
    ) THEN '✅ EXISTS (camelCase)'
    ELSE '❌ MISSING'
  END as status,
  COALESCE(
    (SELECT data_type FROM information_schema.columns 
     WHERE table_schema = 'public' 
     AND table_name = 'licenses' 
     AND (column_name = 'auto_attach_status' OR column_name = 'autoAttachStatus')
     LIMIT 1),
    'N/A'
  ) as data_type,
  COALESCE(
    (SELECT column_default FROM information_schema.columns 
     WHERE table_schema = 'public' 
     AND table_name = 'licenses' 
     AND (column_name = 'auto_attach_status' OR column_name = 'autoAttachStatus')
     LIMIT 1),
    'N/A'
  ) as default_value;

-- ============================================
-- CHECK 2: created_at in sites table
-- ============================================
SELECT 
  'sites.created_at' as column_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'created_at'
    ) THEN '✅ EXISTS'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'createdAt'
    ) THEN '✅ EXISTS (camelCase)'
    ELSE '❌ MISSING'
  END as status,
  COALESCE(
    (SELECT data_type FROM information_schema.columns 
     WHERE table_schema = 'public' 
     AND table_name = 'sites' 
     AND (column_name = 'created_at' OR column_name = 'createdAt')
     LIMIT 1),
    'N/A'
  ) as data_type,
  COALESCE(
    (SELECT column_default FROM information_schema.columns 
     WHERE table_schema = 'public' 
     AND table_name = 'sites' 
     AND (column_name = 'created_at' OR column_name = 'createdAt')
     LIMIT 1),
    'N/A'
  ) as default_value;

-- ============================================
-- CHECK 3: Verify indexes exist
-- ============================================
SELECT 
  'Index Check' as check_type,
  indexname as index_name,
  tablename as table_name,
  CASE 
    WHEN indexname LIKE '%auto_attach%' OR indexname LIKE '%autoAttach%' 
    THEN '✅ auto_attach_status index exists'
    WHEN indexname LIKE '%created_at%' OR indexname LIKE '%createdAt%'
    THEN '✅ created_at index exists'
    ELSE 'Other index'
  END as description
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    indexname LIKE '%auto_attach%' 
    OR indexname LIKE '%autoAttach%'
    OR (tablename = 'sites' AND (indexname LIKE '%created_at%' OR indexname LIKE '%createdAt%'))
  )
ORDER BY tablename, indexname;

-- ============================================
-- SUMMARY CHECK
-- ============================================
SELECT 
  'SUMMARY' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'licenses' 
      AND (column_name = 'auto_attach_status' OR column_name = 'autoAttachStatus')
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND (column_name = 'created_at' OR column_name = 'createdAt')
    ) THEN '✅ ALL COLUMNS EXIST'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'licenses' 
      AND (column_name = 'auto_attach_status' OR column_name = 'autoAttachStatus')
    ) THEN '⚠️  MISSING: sites.created_at'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND (column_name = 'created_at' OR column_name = 'createdAt')
    ) THEN '⚠️  MISSING: licenses.auto_attach_status'
    ELSE '❌ MISSING: Both columns'
  END as status;

-- ============================================
-- SHOW ALL COLUMNS IN LICENSES TABLE (for reference)
-- ============================================
SELECT 
  'licenses table columns' as info,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'licenses'
ORDER BY ordinal_position;

-- ============================================
-- SHOW ALL COLUMNS IN SITES TABLE (for reference)
-- ============================================
SELECT 
  'sites table columns' as info,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sites'
ORDER BY ordinal_position;

