-- Performance optimization indexes
-- Add indexes for frequently queried columns to improve query performance

-- Organizations table indexes
CREATE INDEX IF NOT EXISTS idx_organizations_reset_date ON organizations(reset_date);
CREATE INDEX IF NOT EXISTS idx_organizations_plan ON organizations(plan);

-- Organization members indexes
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_composite ON organization_members(organization_id, user_id);

-- Sites table indexes (if not already exist)
CREATE INDEX IF NOT EXISTS idx_sites_organization_id ON sites(organization_id);
CREATE INDEX IF NOT EXISTS idx_sites_is_active ON sites(is_active);
CREATE INDEX IF NOT EXISTS idx_sites_last_seen ON sites(last_seen DESC);

-- Usage logs indexes
CREATE INDEX IF NOT EXISTS idx_usage_logs_org_id_created ON usage_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at DESC);

-- Subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_email ON subscriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plugin_slug ON subscriptions(plugin_slug);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_composite ON subscriptions(user_email, plugin_slug, status);

-- Licenses indexes
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_service ON licenses(service);

-- Events table indexes (for credit calculations)
CREATE INDEX IF NOT EXISTS idx_events_identity_id ON events(identity_id);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_composite ON events(identity_id, event_type, created_at DESC);

-- Identities indexes
CREATE INDEX IF NOT EXISTS idx_identities_email ON identities(email);

-- Plugin identities indexes
CREATE INDEX IF NOT EXISTS idx_plugin_identities_email ON plugin_identities(email);
CREATE INDEX IF NOT EXISTS idx_plugin_identities_plugin_slug ON plugin_identities(plugin_slug);
CREATE INDEX IF NOT EXISTS idx_plugin_identities_composite ON plugin_identities(email, plugin_slug);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);


