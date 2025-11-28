-- Site-Based Usage Tracking Migration
-- Adds quota tracking fields to sites table and creates usage_tracking table

-- Ensure sites table exists (it may already exist from previous migrations)
-- Add quota tracking columns if they don't exist
DO $$ 
BEGIN
  -- Add license_key column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sites' AND column_name = 'license_key') THEN
    ALTER TABLE sites ADD COLUMN license_key VARCHAR(64);
  END IF;

  -- Add plan column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sites' AND column_name = 'plan') THEN
    ALTER TABLE sites ADD COLUMN plan VARCHAR(20) DEFAULT 'free';
  END IF;

  -- Add token_limit column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sites' AND column_name = 'token_limit') THEN
    ALTER TABLE sites ADD COLUMN token_limit INT DEFAULT 50;
  END IF;

  -- Add tokens_used column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sites' AND column_name = 'tokens_used') THEN
    ALTER TABLE sites ADD COLUMN tokens_used INT DEFAULT 0;
  END IF;

  -- Add tokens_remaining column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sites' AND column_name = 'tokens_remaining') THEN
    ALTER TABLE sites ADD COLUMN tokens_remaining INT DEFAULT 50;
  END IF;

  -- Add reset_date column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sites' AND column_name = 'reset_date') THEN
    ALTER TABLE sites ADD COLUMN reset_date DATE;
  END IF;

  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sites' AND column_name = 'created_at') THEN
    ALTER TABLE sites ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
  END IF;

  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'sites' AND column_name = 'updated_at') THEN
    ALTER TABLE sites ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;
END $$;

-- Create index on site_hash if it doesn't exist (for fast lookups)
CREATE INDEX IF NOT EXISTS idx_sites_site_hash ON sites(site_hash);

-- Create index on license_key if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_sites_license_key ON sites(license_key);

-- Create usage_tracking table for per-site usage logs
CREATE TABLE IF NOT EXISTS usage_tracking (
  id BIGSERIAL PRIMARY KEY,
  site_hash VARCHAR(64) NOT NULL,
  tokens_used INT DEFAULT 1,
  generated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_usage_tracking_site_hash 
    FOREIGN KEY (site_hash) REFERENCES sites(site_hash) ON DELETE CASCADE
);

-- Create indexes on usage_tracking table
CREATE INDEX IF NOT EXISTS idx_usage_tracking_site_hash ON usage_tracking(site_hash);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_generated_at ON usage_tracking(generated_at);

-- Add comment to document the table
COMMENT ON TABLE usage_tracking IS 'Tracks usage per site (via site_hash), not per user. All users on the same site share the same quota.';

