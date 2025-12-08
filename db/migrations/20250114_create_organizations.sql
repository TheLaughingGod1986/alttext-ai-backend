-- Organizations Table
-- Stores organization/license information for multi-site management

CREATE TABLE IF NOT EXISTS public.organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  license_key VARCHAR(255) UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  max_sites INTEGER DEFAULT 1,
  maxSites INTEGER, -- Alternative naming (camelCase) for compatibility
  tokens_remaining INTEGER DEFAULT 50,
  tokensRemaining INTEGER, -- Alternative naming (camelCase) for compatibility
  reset_date DATE,
  resetDate DATE, -- Alternative naming (camelCase) for compatibility
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure valid plan
  CONSTRAINT check_plan 
    CHECK (plan IN ('free', 'pro', 'agency'))
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_organizations_license_key 
  ON public.organizations(license_key);

CREATE INDEX IF NOT EXISTS idx_organizations_plan 
  ON public.organizations(plan);

-- Add comments for documentation
COMMENT ON TABLE public.organizations IS 'Organizations/licenses for multi-site management';
COMMENT ON COLUMN public.organizations.license_key IS 'Unique license key for the organization';
COMMENT ON COLUMN public.organizations.plan IS 'Subscription plan: free, pro, or agency';
COMMENT ON COLUMN public.organizations.max_sites IS 'Maximum number of sites allowed for this organization';
COMMENT ON COLUMN public.organizations.tokens_remaining IS 'Remaining tokens/quota for this organization';

