-- Fix licenses table column names (camelCase to snake_case)
-- Date: 2025-12-01
-- The code expects snake_case but the original migration used camelCase
-- Fixes: "Could not find the 'site_hash' column of 'licenses'"

-- ============================================
-- STEP 1: Fix site_hash column
-- ============================================

DO $$
BEGIN
  -- Check if site_hash exists in snake_case
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'site_hash'
  ) THEN
    RAISE NOTICE '✅ licenses.site_hash column already exists';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'siteHash'
  ) THEN
    -- Rename camelCase to snake_case
    ALTER TABLE licenses RENAME COLUMN "siteHash" TO site_hash;
    RAISE NOTICE '✅ Renamed licenses.siteHash to site_hash';
  ELSE
    -- Column doesn't exist, create it
    ALTER TABLE licenses ADD COLUMN site_hash VARCHAR(255);
    RAISE NOTICE '✅ Added site_hash column to licenses table';
  END IF;
END $$;

-- ============================================
-- STEP 2: Fix site_url column
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'site_url'
  ) THEN
    RAISE NOTICE '✅ licenses.site_url column already exists';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'siteUrl'
  ) THEN
    ALTER TABLE licenses RENAME COLUMN "siteUrl" TO site_url;
    RAISE NOTICE '✅ Renamed licenses.siteUrl to site_url';
  ELSE
    ALTER TABLE licenses ADD COLUMN site_url TEXT;
    RAISE NOTICE '✅ Added site_url column to licenses table';
  END IF;
END $$;

-- ============================================
-- STEP 3: Fix install_id column
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'install_id'
  ) THEN
    RAISE NOTICE '✅ licenses.install_id column already exists';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'installId'
  ) THEN
    ALTER TABLE licenses RENAME COLUMN "installId" TO install_id;
    RAISE NOTICE '✅ Renamed licenses.installId to install_id';
  ELSE
    ALTER TABLE licenses ADD COLUMN install_id VARCHAR(255);
    RAISE NOTICE '✅ Added install_id column to licenses table';
  END IF;
END $$;

-- ============================================
-- STEP 4: Recreate indexes with correct column names
-- ============================================

-- Drop old indexes if they exist (with camelCase names)
DROP INDEX IF EXISTS idx_licenses_site_hash;
DROP INDEX IF EXISTS licenses_site_hash_idx;

-- Create index for site_hash
CREATE INDEX IF NOT EXISTS idx_licenses_site_hash ON licenses(site_hash);

-- ============================================
-- STEP 5: Verify all columns exist
-- ============================================

SELECT 
  'VERIFICATION' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'licenses' 
      AND column_name = 'site_hash'
    ) THEN '✅ licenses.site_hash exists'
    ELSE '❌ licenses.site_hash MISSING'
  END as site_hash_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'licenses' 
      AND column_name = 'site_url'
    ) THEN '✅ licenses.site_url exists'
    ELSE '❌ licenses.site_url MISSING'
  END as site_url_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'licenses' 
      AND column_name = 'install_id'
    ) THEN '✅ licenses.install_id exists'
    ELSE '❌ licenses.install_id MISSING'
  END as install_id_check;

