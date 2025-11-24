-- Migration: Add licenses table and usage_logs columns
-- Phase 1 Backend Enhancements

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

-- Create index on licenseKey for fast lookups
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses("licenseKey");
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses("userId");
CREATE INDEX IF NOT EXISTS idx_licenses_organization_id ON licenses("organizationId");
CREATE INDEX IF NOT EXISTS idx_licenses_site_hash ON licenses("siteHash");

-- Add WordPress user tracking columns to usage_logs
ALTER TABLE usage_logs 
  ADD COLUMN IF NOT EXISTS "wp_user_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "wp_user_name" VARCHAR(255);

-- Create index on wp_user_id for auditing
CREATE INDEX IF NOT EXISTS idx_usage_logs_wp_user_id ON usage_logs("wp_user_id");

