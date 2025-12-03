-- Confirm Required Columns Are Added
-- Run this to verify both columns exist
-- Date: 2025-12-01

-- ============================================
-- FINAL VERIFICATION
-- ============================================

SELECT 
  '✅ VERIFICATION COMPLETE' as status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'licenses' 
      AND column_name = 'auto_attach_status'
    ) THEN '✅ licenses.auto_attach_status EXISTS'
    ELSE '❌ licenses.auto_attach_status MISSING'
  END as licenses_column,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'created_at'
    ) THEN '✅ sites.created_at EXISTS'
    ELSE '❌ sites.created_at MISSING'
  END as sites_column,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'licenses' 
      AND column_name = 'auto_attach_status'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'created_at'
    ) THEN '✅ ALL COLUMNS ADDED SUCCESSFULLY'
    ELSE '⚠️  SOME COLUMNS STILL MISSING'
  END as final_status;

-- ============================================
-- DETAILED COLUMN INFORMATION
-- ============================================

-- Show licenses.auto_attach_status details
SELECT 
  'licenses.auto_attach_status' as column_info,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'licenses'
  AND column_name = 'auto_attach_status';

-- Show sites.created_at details
SELECT 
  'sites.created_at' as column_info,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sites'
  AND column_name = 'created_at';

-- ============================================
-- INDEX VERIFICATION
-- ============================================

-- Check if indexes exist
SELECT 
  'Index Check' as check_type,
  indexname as index_name,
  tablename as table_name,
  CASE 
    WHEN indexname LIKE '%auto_attach%' THEN '✅ auto_attach_status index'
    WHEN indexname LIKE '%created_at%' AND tablename = 'sites' THEN '✅ created_at index'
    ELSE 'Other index'
  END as description
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    (tablename = 'licenses' AND indexname LIKE '%auto_attach%')
    OR (tablename = 'sites' AND indexname LIKE '%created_at%')
  )
ORDER BY tablename, indexname;

