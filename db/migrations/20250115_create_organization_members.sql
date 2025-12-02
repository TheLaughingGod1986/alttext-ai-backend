-- Organization Members Table
-- Links users to organizations with roles (owner, admin, member)
-- Enables multi-user organization management

CREATE TABLE IF NOT EXISTS public.organization_members (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
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

-- Indexes for efficient queries (already referenced in performance indexes migration)
-- But creating them here to ensure they exist
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id 
  ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_org_id 
  ON public.organization_members(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_composite 
  ON public.organization_members(organization_id, user_id);

-- Add comment for documentation
COMMENT ON TABLE public.organization_members IS 'Links users to organizations with specific roles (owner, admin, member)';
COMMENT ON COLUMN public.organization_members.role IS 'User role in organization: owner, admin, or member';

