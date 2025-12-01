-- Add license_key column to sites table
-- Date: 2025-12-01
-- Sites need to store the license key they're associated with
-- Fixes: "Could not find the 'license_key' column of 'sites' in the schema cache"

DO $$
BEGIN
  -- Check if license_key column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'license_key'
  ) THEN
    RAISE NOTICE '✅ sites.license_key column already exists';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'licenseKey'
  ) THEN
    -- Rename camelCase to snake_case
    ALTER TABLE sites RENAME COLUMN "licenseKey" TO license_key;
    RAISE NOTICE '✅ Renamed sites.licenseKey to license_key';
  ELSE
    -- Column doesn't exist, create it
    ALTER TABLE sites ADD COLUMN license_key VARCHAR(255);
    RAISE NOTICE '✅ Added license_key column to sites table';
  END IF;
END $$;

-- Create index for license_key if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_sites_license_key ON sites(license_key);

-- Verify the column exists
SELECT 
  'VERIFICATION' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'license_key'
    ) THEN '✅ sites.license_key exists'
    ELSE '❌ sites.license_key MISSING'
  END as license_key_check;

