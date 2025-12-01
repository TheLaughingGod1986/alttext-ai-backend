-- Ensure identities table exists
-- Date: 2025-12-01
-- The CreditsService requires this table for credit tracking

-- Create identities table if it doesn't exist
CREATE TABLE IF NOT EXISTS identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT identities_email_ck CHECK (email <> '')
);

-- Add credits_balance column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'identities' 
    AND column_name = 'credits_balance'
  ) THEN
    ALTER TABLE identities ADD COLUMN credits_balance INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE '✅ Added credits_balance column to identities table';
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS identities_email_idx ON identities (email);
CREATE INDEX IF NOT EXISTS identities_last_seen_idx ON identities (last_seen_at);
CREATE INDEX IF NOT EXISTS identities_credits_balance_idx ON identities (credits_balance);

-- Verify the table was created
SELECT 
  'VERIFICATION' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'identities'
    ) THEN '✅ identities table exists'
    ELSE '❌ identities table MISSING'
  END as status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'identities' 
      AND column_name = 'credits_balance'
    ) THEN '✅ credits_balance column exists'
    ELSE '❌ credits_balance column MISSING'
  END as credits_column_status;

