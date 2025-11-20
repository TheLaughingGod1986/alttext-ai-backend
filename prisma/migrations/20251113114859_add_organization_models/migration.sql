-- CreateTable
CREATE TABLE "organizations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "service" TEXT NOT NULL DEFAULT 'alttext-ai',
    "maxSites" INTEGER NOT NULL DEFAULT 1,
    "tokensRemaining" INTEGER NOT NULL DEFAULT 50,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "resetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "siteHash" TEXT NOT NULL,
    "siteUrl" TEXT,
    "installId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pluginVersion" TEXT,
    "wordpressVersion" TEXT,
    "phpVersion" TEXT,
    "isMultisite" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "usage_logs" ADD COLUMN "organizationId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_licenseKey_key" ON "organizations"("licenseKey");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripeCustomerId_key" ON "organizations"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "organizations_licenseKey_idx" ON "organizations"("licenseKey");

-- CreateIndex
CREATE INDEX "organizations_stripeCustomerId_idx" ON "organizations"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sites_siteHash_key" ON "sites"("siteHash");

-- CreateIndex
CREATE UNIQUE INDEX "sites_installId_key" ON "sites"("installId");

-- CreateIndex
CREATE INDEX "sites_organizationId_idx" ON "sites"("organizationId");

-- CreateIndex
CREATE INDEX "sites_siteHash_idx" ON "sites"("siteHash");

-- CreateIndex
CREATE INDEX "usage_logs_organizationId_createdAt_idx" ON "usage_logs"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
