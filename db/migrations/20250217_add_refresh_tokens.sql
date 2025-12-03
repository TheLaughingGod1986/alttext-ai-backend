-- Add Refresh Token Support to Identities Table
-- Enables JWT refresh token storage for unified authentication

-- Add refresh_token column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'identities' AND column_name = 'refresh_token') THEN
    ALTER TABLE identities ADD COLUMN refresh_token TEXT;
  END IF;
END $$;

-- Add refresh_token_expires_at column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'identities' AND column_name = 'refresh_token_expires_at') THEN
    ALTER TABLE identities ADD COLUMN refresh_token_expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create index on refresh_token for fast lookups
CREATE INDEX IF NOT EXISTS identities_refresh_token_idx ON identities (refresh_token)
  WHERE refresh_token IS NOT NULL;

