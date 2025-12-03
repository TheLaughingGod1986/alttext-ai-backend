-- Add missing columns to sites table
-- Date: 2025-12-01
-- The siteService.js expects these columns: plan, token_limit, tokens_remaining, reset_date, updated_at

DO $$
BEGIN
  -- Add plan column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'plan'
  ) THEN
    ALTER TABLE sites ADD COLUMN plan VARCHAR(50) DEFAULT 'free';
    RAISE NOTICE '✅ Added plan column to sites table';
  END IF;
  
  -- Add token_limit column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'token_limit'
  ) THEN
    ALTER TABLE sites ADD COLUMN token_limit INTEGER DEFAULT 50;
    RAISE NOTICE '✅ Added token_limit column to sites table';
  END IF;
  
  -- Add tokens_remaining column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'tokens_remaining'
  ) THEN
    ALTER TABLE sites ADD COLUMN tokens_remaining INTEGER DEFAULT 50;
    RAISE NOTICE '✅ Added tokens_remaining column to sites table';
  END IF;
  
  -- Add reset_date column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'reset_date'
  ) THEN
    ALTER TABLE sites ADD COLUMN reset_date DATE;
    RAISE NOTICE '✅ Added reset_date column to sites table';
  END IF;
  
  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE sites ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE '✅ Added updated_at column to sites table';
  END IF;
  
  -- Update NULL values
  UPDATE sites
  SET 
    plan = COALESCE(plan, 'free'),
    token_limit = COALESCE(token_limit, 50),
    tokens_remaining = COALESCE(tokens_remaining, 50),
    updated_at = COALESCE(updated_at, NOW())
  WHERE plan IS NULL 
     OR token_limit IS NULL 
     OR tokens_remaining IS NULL 
     OR updated_at IS NULL;
  
  RAISE NOTICE '✅ Updated NULL values with defaults';
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sites_plan ON sites(plan);
CREATE INDEX IF NOT EXISTS idx_sites_reset_date ON sites(reset_date);
CREATE INDEX IF NOT EXISTS idx_sites_updated_at ON sites(updated_at);

-- Verify all columns were added
SELECT 
  'VERIFICATION' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'plan'
    ) THEN '✅ sites.plan'
    ELSE '❌ sites.plan MISSING'
  END as plan_column,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'token_limit'
    ) THEN '✅ sites.token_limit'
    ELSE '❌ sites.token_limit MISSING'
  END as token_limit_column,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'tokens_remaining'
    ) THEN '✅ sites.tokens_remaining'
    ELSE '❌ sites.tokens_remaining MISSING'
  END as tokens_remaining_column,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'reset_date'
    ) THEN '✅ sites.reset_date'
    ELSE '❌ sites.reset_date MISSING'
  END as reset_date_column,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'sites' 
      AND column_name = 'updated_at'
    ) THEN '✅ sites.updated_at'
    ELSE '❌ sites.updated_at MISSING'
  END as updated_at_column;

