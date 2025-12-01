-- Add created_at column to sites table
-- Date: 2025-12-01
-- This column was identified as missing during verification

-- Add created_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE sites ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE '✅ Added created_at column to sites table';
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

-- Verify the column was added
SELECT 
  'VERIFICATION' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'created_at'
    ) THEN '✅ sites.created_at column exists'
    ELSE '❌ sites.created_at column MISSING'
  END as status;

