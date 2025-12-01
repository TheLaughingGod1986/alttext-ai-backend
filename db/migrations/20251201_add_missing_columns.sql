-- Add missing columns to licenses and subscriptions tables
-- Date: 2025-12-01
-- Fixes errors:
-- - "Could not find the 'service' column of 'licenses'"
-- - "column subscriptions.user_email does not exist"

-- ============================================
-- STEP 1: Add service column to licenses table
-- ============================================

DO $$
BEGIN
  -- Check if service column exists in camelCase and rename to snake_case
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'service'
  ) THEN
    RAISE NOTICE '✅ licenses.service column already exists';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'licenses' 
    AND column_name = 'Service'
  ) THEN
    ALTER TABLE licenses RENAME COLUMN "Service" TO service;
    RAISE NOTICE '✅ Renamed licenses.Service to service';
  ELSE
    -- Column doesn't exist, create it
    ALTER TABLE licenses ADD COLUMN service VARCHAR(50) NOT NULL DEFAULT 'alttext-ai';
    RAISE NOTICE '✅ Added service column to licenses table';
  END IF;
END $$;

-- Create index for service column
CREATE INDEX IF NOT EXISTS idx_licenses_service ON licenses(service);

-- Update existing NULL values (shouldn't happen with NOT NULL, but just in case)
UPDATE licenses SET service = 'alttext-ai' WHERE service IS NULL;

-- ============================================
-- STEP 2: Ensure user_email column exists in subscriptions table
-- ============================================

DO $$
BEGIN
  -- Check if user_email column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'subscriptions' 
    AND column_name = 'user_email'
  ) THEN
    RAISE NOTICE '✅ subscriptions.user_email column already exists';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'subscriptions' 
    AND column_name = 'userEmail'
  ) THEN
    -- Rename camelCase to snake_case
    ALTER TABLE subscriptions RENAME COLUMN "userEmail" TO user_email;
    RAISE NOTICE '✅ Renamed subscriptions.userEmail to user_email';
  ELSE
    -- Column doesn't exist, create it
    ALTER TABLE subscriptions ADD COLUMN user_email TEXT NOT NULL DEFAULT '';
    RAISE NOTICE '✅ Added user_email column to subscriptions table';
    
    -- If there are existing rows, we need to populate user_email
    -- This is a problem - we can't determine user_email from existing data
    -- So we'll make it nullable temporarily, then the app should handle it
    ALTER TABLE subscriptions ALTER COLUMN user_email DROP NOT NULL;
    RAISE NOTICE '⚠️  Made user_email nullable - existing rows need manual update';
  END IF;
END $$;

-- Ensure unique constraint exists for (user_email, plugin_slug)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
    AND table_name = 'subscriptions' 
    AND constraint_name = 'subscriptions_email_plugin_unique'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_email_plugin_unique 
    ON subscriptions(user_email, plugin_slug) 
    WHERE user_email IS NOT NULL;
    RAISE NOTICE '✅ Created unique constraint on (user_email, plugin_slug)';
  END IF;
END $$;

-- Create index for user_email if it doesn't exist
CREATE INDEX IF NOT EXISTS subscriptions_email_idx ON subscriptions(user_email);

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
      AND column_name = 'service'
    ) THEN '✅ licenses.service exists'
    ELSE '❌ licenses.service MISSING'
  END as licenses_service_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'subscriptions' 
      AND column_name = 'user_email'
    ) THEN '✅ subscriptions.user_email exists'
    ELSE '❌ subscriptions.user_email MISSING'
  END as subscriptions_user_email_check;

