-- ============================================================
-- Multi-User Organization Licensing - SQL Commands
-- ============================================================
-- Quick reference for managing licenses in production
-- Copy and paste these commands as needed
-- ============================================================

-- ============================================================
-- CREATING LICENSES
-- ============================================================

-- Create Agency License (10 sites, 10,000/month quota)
INSERT INTO organizations (name, "licenseKey", plan, service, "maxSites", "tokensRemaining", "createdAt", "updatedAt")
VALUES (
    'Customer Agency Name',
    gen_random_uuid(),  -- PostgreSQL generates unique UUID
    'agency',
    'alttext-ai',
    10,                  -- Max 10 sites
    10000,              -- 10,000 generations per month
    NOW(),
    NOW()
) RETURNING id, "licenseKey", name, plan, "maxSites", "tokensRemaining";

-- Copy the returned license key and send to customer!


-- Create Pro License (1 site, 1,000/month quota)
INSERT INTO organizations (name, "licenseKey", plan, service, "maxSites", "tokensRemaining", "createdAt", "updatedAt")
VALUES (
    'Customer Pro License',
    gen_random_uuid(),
    'pro',
    'alttext-ai',
    1,                  -- Single site only
    1000,              -- 1,000 generations per month
    NOW(),
    NOW()
) RETURNING id, "licenseKey", name, plan, "maxSites", "tokensRemaining";


-- Create Free License (1 site, 50/month quota)
INSERT INTO organizations (name, "licenseKey", plan, service, "maxSites", "tokensRemaining", "createdAt", "updatedAt")
VALUES (
    'Customer Free License',
    gen_random_uuid(),
    'free',
    'alttext-ai',
    1,                  -- Single site only
    50,                -- 50 generations per month
    NOW(),
    NOW()
) RETURNING id, "licenseKey", name, plan, "maxSites", "tokensRemaining";


-- Create Test License (for testing deployments)
INSERT INTO organizations (name, "licenseKey", plan, service, "maxSites", "tokensRemaining", "createdAt", "updatedAt")
VALUES (
    'Test Agency License',
    gen_random_uuid(),
    'agency',
    'alttext-ai',
    10,
    10000,
    NOW(),
    NOW()
) RETURNING id, "licenseKey", name, plan, "maxSites", "tokensRemaining";


-- ============================================================
-- VIEWING LICENSES
-- ============================================================

-- View all licenses with usage info
SELECT
    o.id,
    o.name,
    o.plan,
    o."licenseKey",
    o."maxSites",
    o."tokensRemaining",
    o."resetDate",
    COUNT(s.id) FILTER (WHERE s."isActive" = true) as active_sites,
    COUNT(s.id) as total_sites
FROM organizations o
LEFT JOIN sites s ON s."organizationId" = o.id
GROUP BY o.id
ORDER BY o."createdAt" DESC;


-- View specific license by key
SELECT
    o.id,
    o.name,
    o.plan,
    o."licenseKey",
    o."maxSites",
    o."tokensRemaining",
    o."resetDate",
    o."createdAt"
FROM organizations o
WHERE o."licenseKey" = 'PASTE_LICENSE_KEY_HERE';


-- View license with active sites
SELECT
    o.name as organization,
    o.plan,
    o."tokensRemaining",
    s."siteUrl",
    s."isActive",
    s."lastSeen",
    s."pluginVersion"
FROM organizations o
LEFT JOIN sites s ON s."organizationId" = o.id
WHERE o."licenseKey" = 'PASTE_LICENSE_KEY_HERE'
ORDER BY s."lastSeen" DESC;


-- ============================================================
-- MANAGING SITES
-- ============================================================

-- View all active sites for an organization
SELECT
    s.id,
    s."siteUrl",
    s."isActive",
    s."firstSeen",
    s."lastSeen",
    s."pluginVersion",
    s."wordpressVersion"
FROM sites s
JOIN organizations o ON s."organizationId" = o.id
WHERE o."licenseKey" = 'PASTE_LICENSE_KEY_HERE'
AND s."isActive" = true
ORDER BY s."lastSeen" DESC;


-- Deactivate a site (to free up slot)
UPDATE sites
SET "isActive" = false
WHERE id = SITE_ID_HERE;


-- Reactivate a site
UPDATE sites
SET "isActive" = true
WHERE id = SITE_ID_HERE;


-- View sites that haven't been seen in 30+ days (inactive)
SELECT
    s.id,
    s."siteUrl",
    s."lastSeen",
    o.name as organization,
    EXTRACT(DAY FROM NOW() - s."lastSeen") as days_since_seen
FROM sites s
JOIN organizations o ON s."organizationId" = o.id
WHERE s."isActive" = true
AND s."lastSeen" < NOW() - INTERVAL '30 days'
ORDER BY s."lastSeen" ASC;


-- ============================================================
-- QUOTA MANAGEMENT
-- ============================================================

-- Check current quota for a license
SELECT
    o.name,
    o.plan,
    o."tokensRemaining",
    o."resetDate",
    CASE
        WHEN o.plan = 'free' THEN 50
        WHEN o.plan = 'pro' THEN 1000
        WHEN o.plan = 'agency' THEN 10000
    END as monthly_limit
FROM organizations o
WHERE o."licenseKey" = 'PASTE_LICENSE_KEY_HERE';


-- Add bonus tokens to a license (one-time credit)
UPDATE organizations
SET "tokensRemaining" = "tokensRemaining" + 500
WHERE "licenseKey" = 'PASTE_LICENSE_KEY_HERE'
RETURNING name, "tokensRemaining";


-- Add credits (permanent, don't reset monthly)
UPDATE organizations
SET credits = credits + 100
WHERE "licenseKey" = 'PASTE_LICENSE_KEY_HERE'
RETURNING name, credits;


-- Manually reset quota (if needed)
UPDATE organizations
SET "tokensRemaining" = CASE
    WHEN plan = 'free' THEN 50
    WHEN plan = 'pro' THEN 1000
    WHEN plan = 'agency' THEN 10000
END,
"resetDate" = NOW()
WHERE "licenseKey" = 'PASTE_LICENSE_KEY_HERE'
RETURNING name, plan, "tokensRemaining", "resetDate";


-- ============================================================
-- USAGE ANALYTICS
-- ============================================================

-- View recent usage for a license
SELECT
    ul."createdAt",
    u.email as user,
    ul.used,
    ul.endpoint,
    ul."imageId"
FROM usage_logs ul
JOIN organizations o ON ul."organizationId" = o.id
LEFT JOIN users u ON ul."userId" = u.id
WHERE o."licenseKey" = 'PASTE_LICENSE_KEY_HERE'
ORDER BY ul."createdAt" DESC
LIMIT 50;


-- Daily usage summary for a license (last 30 days)
SELECT
    DATE(ul."createdAt") as usage_date,
    COUNT(*) as generations,
    COUNT(DISTINCT ul."userId") as unique_users
FROM usage_logs ul
JOIN organizations o ON ul."organizationId" = o.id
WHERE o."licenseKey" = 'PASTE_LICENSE_KEY_HERE'
AND ul."createdAt" >= NOW() - INTERVAL '30 days'
GROUP BY DATE(ul."createdAt")
ORDER BY usage_date DESC;


-- Top organizations by usage (current month)
SELECT
    o.name,
    o.plan,
    COUNT(ul.id) as generations_this_month,
    o."tokensRemaining"
FROM organizations o
LEFT JOIN usage_logs ul ON ul."organizationId" = o.id
    AND DATE_TRUNC('month', ul."createdAt") = DATE_TRUNC('month', NOW())
GROUP BY o.id
ORDER BY generations_this_month DESC
LIMIT 20;


-- ============================================================
-- ORGANIZATION MEMBERS
-- ============================================================

-- Add user to organization (team member)
INSERT INTO organization_members ("organizationId", "userId", role, "createdAt", "updatedAt")
VALUES (
    1,          -- Organization ID (get from organizations table)
    2,          -- User ID (get from users table)
    'member',   -- Role: 'owner', 'admin', or 'member'
    NOW(),
    NOW()
);


-- View all members of an organization
SELECT
    u.id as user_id,
    u.email,
    om.role,
    om."createdAt" as joined_at
FROM organization_members om
JOIN users u ON om."userId" = u.id
JOIN organizations o ON om."organizationId" = o.id
WHERE o."licenseKey" = 'PASTE_LICENSE_KEY_HERE'
ORDER BY om.role ASC, om."createdAt" ASC;


-- Remove member from organization
DELETE FROM organization_members
WHERE "organizationId" = ORG_ID_HERE
AND "userId" = USER_ID_HERE;


-- Change member role
UPDATE organization_members
SET role = 'admin'  -- or 'owner' or 'member'
WHERE "organizationId" = ORG_ID_HERE
AND "userId" = USER_ID_HERE;


-- ============================================================
-- LICENSE MODIFICATIONS
-- ============================================================

-- Upgrade license from Pro to Agency
UPDATE organizations
SET
    plan = 'agency',
    "maxSites" = 10,
    "tokensRemaining" = "tokensRemaining" + (10000 - 1000),  -- Add difference
    "updatedAt" = NOW()
WHERE "licenseKey" = 'PASTE_LICENSE_KEY_HERE'
RETURNING name, plan, "maxSites", "tokensRemaining";


-- Downgrade license from Agency to Pro
UPDATE organizations
SET
    plan = 'pro',
    "maxSites" = 1,
    "tokensRemaining" = LEAST("tokensRemaining", 1000),  -- Cap at Pro limit
    "updatedAt" = NOW()
WHERE "licenseKey" = 'PASTE_LICENSE_KEY_HERE'
RETURNING name, plan, "maxSites", "tokensRemaining";


-- Increase site limit for agency
UPDATE organizations
SET "maxSites" = 20  -- or any number
WHERE "licenseKey" = 'PASTE_LICENSE_KEY_HERE'
RETURNING name, "maxSites";


-- Rename organization
UPDATE organizations
SET name = 'New Organization Name'
WHERE "licenseKey" = 'PASTE_LICENSE_KEY_HERE'
RETURNING name, "licenseKey";


-- ============================================================
-- STRIPE INTEGRATION
-- ============================================================

-- Link Stripe customer to organization
UPDATE organizations
SET "stripeCustomerId" = 'cus_xxxxxxxxxxxxx'
WHERE "licenseKey" = 'PASTE_LICENSE_KEY_HERE'
RETURNING name, "stripeCustomerId";


-- Link Stripe subscription to organization
UPDATE organizations
SET
    "stripeCustomerId" = 'cus_xxxxxxxxxxxxx',
    "stripeSubscriptionId" = 'sub_xxxxxxxxxxxxx'
WHERE "licenseKey" = 'PASTE_LICENSE_KEY_HERE'
RETURNING name, "stripeCustomerId", "stripeSubscriptionId";


-- View organizations with active Stripe subscriptions
SELECT
    o.name,
    o.plan,
    o."stripeCustomerId",
    o."stripeSubscriptionId",
    o."tokensRemaining"
FROM organizations o
WHERE o."stripeSubscriptionId" IS NOT NULL;


-- ============================================================
-- TROUBLESHOOTING
-- ============================================================

-- Find organization by site URL
SELECT
    o.id,
    o.name,
    o.plan,
    o."licenseKey",
    s."siteUrl",
    s."isActive"
FROM organizations o
JOIN sites s ON s."organizationId" = o.id
WHERE s."siteUrl" LIKE '%example.com%';


-- Find user's organizations
SELECT
    o.id,
    o.name,
    o.plan,
    o."licenseKey",
    om.role
FROM organizations o
JOIN organization_members om ON om."organizationId" = o.id
JOIN users u ON om."userId" = u.id
WHERE u.email = 'user@example.com';


-- Check why site activation might be failing
SELECT
    o."licenseKey",
    o."maxSites",
    COUNT(s.id) FILTER (WHERE s."isActive" = true) as active_sites,
    o."maxSites" - COUNT(s.id) FILTER (WHERE s."isActive" = true) as available_slots
FROM organizations o
LEFT JOIN sites s ON s."organizationId" = o.id
WHERE o."licenseKey" = 'PASTE_LICENSE_KEY_HERE'
GROUP BY o.id;


-- View all usage for debugging
SELECT
    ul."createdAt",
    COALESCE(o.name, 'No Org') as organization,
    u.email,
    ul.used,
    ul.endpoint
FROM usage_logs ul
JOIN users u ON ul."userId" = u.id
LEFT JOIN organizations o ON ul."organizationId" = o.id
WHERE ul."createdAt" >= NOW() - INTERVAL '1 hour'
ORDER BY ul."createdAt" DESC;


-- ============================================================
-- BULK OPERATIONS
-- ============================================================

-- Create multiple agency licenses at once
INSERT INTO organizations (name, "licenseKey", plan, service, "maxSites", "tokensRemaining", "createdAt", "updatedAt")
VALUES
    ('Agency Customer 1', gen_random_uuid(), 'agency', 'alttext-ai', 10, 10000, NOW(), NOW()),
    ('Agency Customer 2', gen_random_uuid(), 'agency', 'alttext-ai', 10, 10000, NOW(), NOW()),
    ('Agency Customer 3', gen_random_uuid(), 'agency', 'alttext-ai', 10, 10000, NOW(), NOW())
RETURNING id, name, "licenseKey";


-- Reset all monthly quotas (run via cron monthly)
UPDATE organizations
SET "tokensRemaining" = CASE
    WHEN plan = 'free' THEN 50
    WHEN plan = 'pro' THEN 1000
    WHEN plan = 'agency' THEN 10000
END,
"resetDate" = NOW()
WHERE "resetDate" < NOW() - INTERVAL '30 days';


-- Deactivate sites not seen in 90+ days
UPDATE sites
SET "isActive" = false
WHERE "lastSeen" < NOW() - INTERVAL '90 days'
AND "isActive" = true
RETURNING id, "siteUrl", "lastSeen";


-- ============================================================
-- REPORTING
-- ============================================================

-- Monthly revenue report (if tracking revenue)
SELECT
    DATE_TRUNC('month', o."createdAt") as month,
    COUNT(*) as new_organizations,
    COUNT(*) FILTER (WHERE o.plan = 'agency') as new_agencies,
    COUNT(*) FILTER (WHERE o.plan = 'pro') as new_pros,
    COUNT(*) FILTER (WHERE o.plan = 'free') as new_frees
FROM organizations o
WHERE o."createdAt" >= NOW() - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', o."createdAt")
ORDER BY month DESC;


-- Active organizations summary
SELECT
    plan,
    COUNT(*) as total_orgs,
    SUM("maxSites") as total_site_slots,
    COUNT(DISTINCT s.id) FILTER (WHERE s."isActive" = true) as active_sites,
    SUM("tokensRemaining") as total_tokens_remaining
FROM organizations o
LEFT JOIN sites s ON s."organizationId" = o.id
GROUP BY plan
ORDER BY plan;


-- Usage by plan (current month)
SELECT
    o.plan,
    COUNT(DISTINCT o.id) as organizations,
    COUNT(ul.id) as total_generations,
    AVG(CASE WHEN ul.id IS NOT NULL THEN 1 ELSE 0 END) as avg_generations_per_org
FROM organizations o
LEFT JOIN usage_logs ul ON ul."organizationId" = o.id
    AND DATE_TRUNC('month', ul."createdAt") = DATE_TRUNC('month', NOW())
GROUP BY o.plan;


-- ============================================================
-- CLEANUP / MAINTENANCE
-- ============================================================

-- Remove test licenses (be careful!)
DELETE FROM organizations
WHERE name LIKE '%Test%'
OR name LIKE '%Demo%'
RETURNING name, "licenseKey";


-- Archive old usage logs (move to separate table or delete)
-- WARNING: Only run if you have a backup!
DELETE FROM usage_logs
WHERE "createdAt" < NOW() - INTERVAL '1 year';


-- Vacuum and analyze tables for performance
VACUUM ANALYZE organizations;
VACUUM ANALYZE organization_members;
VACUUM ANALYZE sites;
VACUUM ANALYZE usage_logs;


-- ============================================================
-- NOTES
-- ============================================================
--
-- License Keys:
-- - Format: UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
-- - Generated automatically by PostgreSQL with gen_random_uuid()
-- - Unique across all organizations
--
-- Plans:
-- - free: 50/month, 1 site
-- - pro: 1000/month, 1 site
-- - agency: 10000/month, 10 sites (customizable)
--
-- Roles:
-- - owner: Full control, can add/remove members
-- - admin: Can manage sites and invite members
-- - member: Can use organization quota
--
-- Site Limits:
-- - Free/Pro: 1 site max
-- - Agency: 10 sites default (can be increased)
-- - Sites can be deactivated/reactivated as needed
--
-- Reset Dates:
-- - Quotas reset monthly (day 1 of each month)
-- - Use cron job or manual query to reset
-- - Credits (not tokens) never reset
--
-- ============================================================
