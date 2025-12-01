-- Fix Column Naming and Add Missing Columns
-- Ensures auto_attach_status (snake_case) exists in licenses
-- Ensures created_at exists in sites
-- Date: 2025-12-01

-- ============================================
-- STEP 1: Fix auto_attach_status in licenses
-- ============================================

-- Check if column exists in camelCase and rename to snake_case
DO $$
BEGIN
  -- If camelCase exists, rename to snake_case
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'autoAttachStatus'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'auto_attach_status'
  ) THEN
    ALTER TABLE licenses RENAME COLUMN "autoAttachStatus" TO auto_attach_status;
    RAISE NOTICE '✅ Renamed autoAttachStatus to auto_attach_status';
  END IF;
  
  -- If column doesn't exist at all, create it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND (column_name = 'auto_attach_status' OR column_name = 'autoAttachStatus')
  ) THEN
    ALTER TABLE licenses ADD COLUMN auto_attach_status VARCHAR(50) DEFAULT 'manual';
    RAISE NOTICE '✅ Added auto_attach_status column';
  END IF;
  
  -- Update existing licenses that have associated sites to 'attached' status
  -- A license is considered 'attached' if it has at least one site in the sites table
  UPDATE licenses
  SET auto_attach_status = 'attached'
  WHERE EXISTS (
    SELECT 1 FROM sites 
    WHERE sites.license_id = licenses.id
  )
  AND auto_attach_status = 'manual';
  
  RAISE NOTICE '✅ Updated existing licenses with site info to attached status';
END $$;

-- Recreate index with correct column name
DROP INDEX IF EXISTS licenses_auto_attach_status_idx;
CREATE INDEX IF NOT EXISTS licenses_auto_attach_status_idx ON licenses (auto_attach_status);

-- ============================================
-- STEP 2: Ensure created_at exists in sites
-- ============================================

DO $$
BEGIN
  -- Add created_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND (column_name = 'created_at' OR column_name = 'createdAt')
  ) THEN
    ALTER TABLE sites ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE '✅ Added created_at column to sites table';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'createdAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'created_at'
  ) THEN
    -- Rename camelCase to snake_case
    ALTER TABLE sites RENAME COLUMN "createdAt" TO created_at;
    RAISE NOTICE '✅ Renamed createdAt to created_at';
  ELSE
    RAISE NOTICE '✅ created_at column already exists';
  END IF;
  
  -- Update NULL values to use activated_at or current timestamp
  UPDATE sites
  SET created_at = COALESCE(activated_at, NOW())
  WHERE created_at IS NULL;
  
  RAISE NOTICE '✅ Updated NULL created_at values';
END $$;

-- Create index for created_at if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_sites_created_at ON sites(created_at);

-- ============================================
-- STEP 3: Verify both columns exist
-- ============================================

SELECT 
  'VERIFICATION' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'licenses' 
      AND column_name = 'auto_attach_status'
    ) THEN '✅ licenses.auto_attach_status exists'
    ELSE '❌ licenses.auto_attach_status MISSING'
  END as licenses_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'created_at'
    ) THEN '✅ sites.created_at exists'
    ELSE '❌ sites.created_at MISSING'
  END as sites_check;

