-- Final Database Optimizations
-- Date: 2025-12-01
-- Run this AFTER verifying with 20251201_verify_and_additional_optimizations.sql
-- Only run sections that are needed based on verification results

-- ============================================
-- 1. ADD MISSING UNIQUE CONSTRAINTS
-- ============================================
-- Run this section if verification query #6 shows missing unique constraints

-- Ensure users.email is unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints 
    WHERE constraint_name = 'users_email_key'
    AND table_schema = 'public'
  ) THEN
    -- Check for duplicate emails first
    IF EXISTS (
      SELECT email, COUNT(*) 
      FROM users 
      WHERE email IS NOT NULL 
      GROUP BY email 
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE '⚠️  Duplicate emails found. Clean up duplicates before adding unique constraint.';
    ELSE
      ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
      RAISE NOTICE '✅ Added unique constraint on users.email';
    END IF;
  ELSE
    RAISE NOTICE '✅ users.email already has unique constraint';
  END IF;
END $$;

-- Ensure licenses.license_key is unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints 
    WHERE constraint_name = 'licenses_license_key_key'
    AND table_schema = 'public'
  ) THEN
    -- Check for duplicate license keys first
    IF EXISTS (
      SELECT license_key, COUNT(*) 
      FROM licenses 
      WHERE license_key IS NOT NULL 
      GROUP BY license_key 
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE '⚠️  Duplicate license keys found. Clean up duplicates before adding unique constraint.';
    ELSE
      ALTER TABLE licenses ADD CONSTRAINT licenses_license_key_key UNIQUE (license_key);
      RAISE NOTICE '✅ Added unique constraint on licenses.license_key';
    END IF;
  ELSE
    RAISE NOTICE '✅ licenses.license_key already has unique constraint';
  END IF;
END $$;

-- Ensure subscriptions.stripe_subscription_id is unique (where not null)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints 
    WHERE constraint_name = 'subscriptions_stripe_subscription_id_key'
    AND table_schema = 'public'
  ) THEN
    -- Check for duplicate stripe_subscription_ids first
    IF EXISTS (
      SELECT stripe_subscription_id, COUNT(*) 
      FROM subscriptions 
      WHERE stripe_subscription_id IS NOT NULL 
      GROUP BY stripe_subscription_id 
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE '⚠️  Duplicate stripe_subscription_ids found. Clean up duplicates before adding unique constraint.';
    ELSE
      ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
      RAISE NOTICE '✅ Added unique constraint on subscriptions.stripe_subscription_id';
    END IF;
  ELSE
    RAISE NOTICE '✅ subscriptions.stripe_subscription_id already has unique constraint';
  END IF;
END $$;

-- Ensure password_reset_tokens.token_hash is unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.table_constraints 
    WHERE constraint_name = 'password_reset_tokens_token_hash_key'
    AND table_schema = 'public'
  ) THEN
    -- Check for duplicate token hashes first
    IF EXISTS (
      SELECT token_hash, COUNT(*) 
      FROM password_reset_tokens 
      WHERE token_hash IS NOT NULL 
      GROUP BY token_hash 
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE '⚠️  Duplicate token hashes found. Clean up duplicates before adding unique constraint.';
    ELSE
      ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);
      RAISE NOTICE '✅ Added unique constraint on password_reset_tokens.token_hash';
    END IF;
  ELSE
    RAISE NOTICE '✅ password_reset_tokens.token_hash already has unique constraint';
  END IF;
END $$;

-- ============================================
-- 2. ADD MISSING FOREIGN KEY INDEXES
-- ============================================
-- Run this section if verification query #4 shows missing indexes on foreign keys

-- Add indexes for any foreign keys that are missing indexes
-- (Adjust based on verification results)

-- Example: If usage_logs.license_id doesn't have an index
-- CREATE INDEX IF NOT EXISTS idx_usage_logs_license_id ON usage_logs(license_id);

-- Example: If licenses.user_id doesn't have an index
-- CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);

-- ============================================
-- 3. CLEAN UP ORPHANED RECORDS
-- ============================================
-- Run this section if verification queries show orphaned records

-- Clean up orphaned usage_logs (license_id pointing to non-existent license)
-- DELETE FROM usage_logs 
-- WHERE license_id IS NOT NULL 
-- AND NOT EXISTS (SELECT 1 FROM licenses WHERE licenses.id = usage_logs.license_id);

-- Clean up orphaned usage_logs (user_id pointing to non-existent user)
-- DELETE FROM usage_logs 
-- WHERE user_id IS NOT NULL 
-- AND NOT EXISTS (SELECT 1 FROM users WHERE users.id = usage_logs.user_id);

-- Clean up orphaned licenses (user_id pointing to non-existent user)
-- DELETE FROM licenses 
-- WHERE user_id IS NOT NULL 
-- AND NOT EXISTS (SELECT 1 FROM users WHERE users.id = licenses.user_id);

-- ============================================
-- 4. ADD PRIMARY KEYS TO TABLES WITHOUT THEM
-- ============================================
-- Run this section if verification query #5 shows tables without primary keys
-- (Adjust based on verification results - this is just an example)

-- Example: If a table needs a primary key
-- ALTER TABLE table_name ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;

-- ============================================
-- 5. UPDATE TABLE STATISTICS
-- ============================================
-- Always run this to ensure query planner has up-to-date statistics

ANALYZE users;
ANALYZE licenses;
ANALYZE subscriptions;
ANALYZE usage_logs;
ANALYZE credits;
ANALYZE password_reset_tokens;
ANALYZE sites;

-- ============================================
-- VERIFICATION AFTER OPTIMIZATIONS
-- ============================================

-- Quick check: Show all unique constraints
SELECT 
  tc.table_name,
  tc.constraint_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- Quick check: Show all indexes
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

