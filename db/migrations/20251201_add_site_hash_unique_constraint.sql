-- Add unique constraint on site_hash in sites table
-- Date: 2025-12-01
-- Required for upsert operations using ON CONFLICT (site_hash)
-- Fixes: "there is no unique or exclusion constraint matching the ON CONFLICT specification"

DO $$
BEGIN
  -- Check if unique constraint already exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sites_site_hash_unique' 
    AND conrelid = 'public.sites'::regclass
  ) THEN
    RAISE NOTICE '✅ Unique constraint sites_site_hash_unique already exists';
  ELSIF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sites_site_hash_key' 
    AND conrelid = 'public.sites'::regclass
  ) THEN
    RAISE NOTICE '✅ Unique constraint sites_site_hash_key already exists';
  ELSE
    -- Create unique constraint on site_hash
    ALTER TABLE sites ADD CONSTRAINT sites_site_hash_unique UNIQUE (site_hash);
    RAISE NOTICE '✅ Created unique constraint sites_site_hash_unique on site_hash';
  END IF;
END $$;

-- Verify the constraint exists
SELECT 
  'VERIFICATION' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname IN ('sites_site_hash_unique', 'sites_site_hash_key')
      AND conrelid = 'public.sites'::regclass
    ) THEN '✅ sites.site_hash has unique constraint'
    ELSE '❌ sites.site_hash MISSING unique constraint'
  END as site_hash_constraint_check;

