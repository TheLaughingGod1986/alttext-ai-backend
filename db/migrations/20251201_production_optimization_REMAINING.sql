-- Production Database Optimization - REMAINING STEPS
-- Date: 2025-12-01
-- Run this to complete the optimization (Steps 1-3)

-- ============================================
-- STEP 1: FIX TABLE NAME MISMATCH
-- ============================================

-- Rename license_sites to sites if sites doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'sites'
  ) AND EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'license_sites'
  ) THEN
    ALTER TABLE license_sites RENAME TO sites;
    RAISE NOTICE 'Renamed license_sites to sites';
  END IF;
END $$;

-- ============================================
-- STEP 2: ADD PERFORMANCE INDEXES
-- ============================================

-- Licenses table indexes
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);

-- Usage logs indexes (frequently queried - critical for performance)
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_license_id ON usage_logs(license_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_site_hash ON usage_logs(site_hash);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);

-- Credits table indexes
CREATE INDEX IF NOT EXISTS idx_credits_user_id ON credits(user_id);

-- Subscriptions table indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Password reset tokens indexes
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Sites table indexes (works for both 'sites' and 'license_sites')
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'sites'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_sites_license_id ON sites(license_id);
    CREATE INDEX IF NOT EXISTS idx_sites_site_hash ON sites(site_hash);
  ELSIF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'license_sites'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_license_sites_license_id ON license_sites(license_id);
    CREATE INDEX IF NOT EXISTS idx_license_sites_site_hash ON license_sites(site_hash);
  END IF;
END $$;

-- ============================================
-- STEP 3: CLEAN UP EMPTY UNUSED TABLES
-- ============================================

-- Drop empty unused tables (safe - only if they have 0 rows)
DO $$
DECLARE
  row_count INTEGER;
BEGIN
  -- Drop generation_requests if empty
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'generation_requests'
  ) THEN
    SELECT COUNT(*) INTO row_count FROM generation_requests;
    IF row_count = 0 THEN
      DROP TABLE IF EXISTS generation_requests CASCADE;
      RAISE NOTICE 'Dropped empty generation_requests table';
    END IF;
  END IF;

  -- Drop queue_jobs if empty
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'queue_jobs'
  ) THEN
    SELECT COUNT(*) INTO row_count FROM queue_jobs;
    IF row_count = 0 THEN
      DROP TABLE IF EXISTS queue_jobs CASCADE;
      RAISE NOTICE 'Dropped empty queue_jobs table';
    END IF;
  END IF;

  -- Drop sessions if empty
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'sessions'
  ) THEN
    SELECT COUNT(*) INTO row_count FROM sessions;
    IF row_count = 0 THEN
      DROP TABLE IF EXISTS sessions CASCADE;
      RAISE NOTICE 'Dropped empty sessions table';
    END IF;
  END IF;
END $$;

