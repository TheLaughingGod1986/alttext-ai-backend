# Database Migrations

## Migration Process

Database migrations are managed manually through SQL files in the `/migrations` directory.

### Running Migrations

1. Connect to your Supabase database
2. Open the Supabase SQL Editor
3. Copy the contents of the migration file
4. Execute the SQL
5. Verify the changes

## Migration Files

### add_licenses_table.sql

**Date:** 2025-01-24  
**Purpose:** Create licenses table and add WordPress user tracking to usage_logs

**Changes:**
- Creates `licenses` table with:
  - License key (unique)
  - Plan, service, token limits
  - Site URL, site hash, install ID
  - Auto-attach status
  - User and organization references
  - Stripe customer/subscription IDs
  - Email status tracking
- Adds indexes for fast lookups
- Adds `wp_user_id` and `wp_user_name` columns to `usage_logs` table
- Creates index on `wp_user_id` for auditing

**SQL:**
```sql
-- Create licenses table
CREATE TABLE IF NOT EXISTS licenses (
  id SERIAL PRIMARY KEY,
  "licenseKey" VARCHAR(255) UNIQUE NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  service VARCHAR(50) NOT NULL DEFAULT 'alttext-ai',
  "tokenLimit" INTEGER NOT NULL DEFAULT 50,
  "tokensRemaining" INTEGER NOT NULL DEFAULT 50,
  "siteUrl" TEXT,
  "siteHash" VARCHAR(255),
  "installId" VARCHAR(255),
  "autoAttachStatus" VARCHAR(50) DEFAULT 'manual',
  "userId" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "organizationId" INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  "stripeCustomerId" VARCHAR(255),
  "stripeSubscriptionId" VARCHAR(255),
  "licenseEmailSentAt" TIMESTAMP,
  "emailStatus" VARCHAR(50) DEFAULT 'pending',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses("licenseKey");
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses("userId");
CREATE INDEX IF NOT EXISTS idx_licenses_organization_id ON licenses("organizationId");
CREATE INDEX IF NOT EXISTS idx_licenses_site_hash ON licenses("siteHash");

-- Add WordPress user tracking to usage_logs
ALTER TABLE usage_logs 
  ADD COLUMN IF NOT EXISTS "wp_user_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "wp_user_name" VARCHAR(255);

-- Create index on wp_user_id
CREATE INDEX IF NOT EXISTS idx_usage_logs_wp_user_id ON usage_logs("wp_user_id");
```

## Future Migrations

When creating new migrations:

1. Create a new SQL file in `/migrations/`
2. Name it descriptively: `YYYY-MM-DD_description.sql`
3. Use `IF NOT EXISTS` and `IF EXISTS` clauses for idempotency
4. Document the purpose and changes in this file
5. Test on a development database first
6. Backup production database before running

## Rollback

Currently, migrations do not include rollback scripts. To rollback:

1. Create a new migration file with reverse changes
2. Test thoroughly on development
3. Backup production before applying

## Migration Best Practices

- Always use `IF NOT EXISTS` / `IF EXISTS` for idempotency
- Test migrations on development database first
- Backup production database before running migrations
- Document all changes in this file
- Use transactions where possible
- Add indexes for frequently queried columns
- Consider performance impact of large migrations

