-- Combined Migration: Organizations and Organization Members
-- Run this script to create both tables in the correct order

-- ============================================================================
-- STEP 1: Create Organizations Table
-- ============================================================================
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

-- ============================================================================
-- STEP 2: Create Organization Members Table
-- ============================================================================
-- Organization Members Table
-- Links users to organizations with roles (owner, admin, member)
-- Enables multi-user organization management

CREATE TABLE IF NOT EXISTS public.organization_members (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_organization_members_organization 
    FOREIGN KEY (organization_id) 
    REFERENCES public.organizations(id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_organization_members_user 
    FOREIGN KEY (user_id) 
    REFERENCES public.users(id) 
    ON DELETE CASCADE,
    
  -- Ensure unique membership (one user can only be in an org once)
  CONSTRAINT unique_organization_member 
    UNIQUE (organization_id, user_id),
    
  -- Ensure valid role
  CONSTRAINT check_role 
    CHECK (role IN ('owner', 'admin', 'member'))
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id 
  ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_org_id 
  ON public.organization_members(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_composite 
  ON public.organization_members(organization_id, user_id);

-- Add comments for documentation
COMMENT ON TABLE public.organization_members IS 'Links users to organizations with specific roles (owner, admin, member)';
COMMENT ON COLUMN public.organization_members.role IS 'User role in organization: owner, admin, or member';

