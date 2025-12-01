-- Ensure plugin_identities table exists
-- Date: 2025-12-01
-- IdentityService requires this table for identity tracking
-- Fixes: "Could not find the table 'public.plugin_identities'"

-- Create plugin_identities table if it doesn't exist
CREATE TABLE IF NOT EXISTS plugin_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  plugin_slug TEXT NOT NULL,
  site_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT plugin_identities_email_plugin_unique UNIQUE (email, plugin_slug)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_plugin_identities_email ON plugin_identities (email);
CREATE INDEX IF NOT EXISTS idx_plugin_identities_plugin_slug ON plugin_identities (plugin_slug);
CREATE INDEX IF NOT EXISTS idx_plugin_identities_email_plugin ON plugin_identities (email, plugin_slug);

-- Verify the table was created
SELECT 
  'VERIFICATION' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'plugin_identities'
    ) THEN '✅ plugin_identities table exists'
    ELSE '❌ plugin_identities table MISSING'
  END as plugin_identities_table_check;

