-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "service" TEXT NOT NULL DEFAULT 'alttext-ai';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_service_idx" ON "users"("service");

-- AlterTable
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "service" TEXT NOT NULL DEFAULT 'alttext-ai';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "usage_logs_userId_service_idx" ON "usage_logs"("userId", "service");

