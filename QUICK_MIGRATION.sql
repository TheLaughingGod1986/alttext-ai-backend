-- SEO AI Meta Generator - Database Migration
-- Run this in Render Dashboard SQL Editor

-- Add service column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "service" TEXT NOT NULL DEFAULT 'alttext-ai';

-- Create index for users.service
CREATE INDEX IF NOT EXISTS "users_service_idx" ON "users"("service");

-- Add service column to usage_logs table
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "service" TEXT NOT NULL DEFAULT 'alttext-ai';

-- Create composite index for usage_logs
CREATE INDEX IF NOT EXISTS "usage_logs_userId_service_idx" ON "usage_logs"("userId", "service");

-- Verification query (run separately to check)
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'service';



