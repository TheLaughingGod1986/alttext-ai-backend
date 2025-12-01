-- Make license_id nullable in sites table
-- Date: 2025-12-01
-- Sites can be created without a license (free tier users)
-- The NOT NULL constraint is preventing site creation

-- First, check if there are any NULL license_id values that need to be handled
-- (This should be safe since we're making it nullable)

-- Drop the NOT NULL constraint on license_id
DO $$
BEGIN
  -- Check if the constraint exists and remove it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'license_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE sites ALTER COLUMN license_id DROP NOT NULL;
    RAISE NOTICE '✅ Made license_id nullable in sites table';
  ELSE
    RAISE NOTICE '✅ license_id is already nullable';
  END IF;
END $$;

-- Verify the change
SELECT 
  'VERIFICATION' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'license_id'
      AND is_nullable = 'YES'
    ) THEN '✅ license_id is now nullable'
    ELSE '❌ license_id is still NOT NULL'
  END as status;

