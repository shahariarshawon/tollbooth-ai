-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('LEAD', 'MEMBER', 'VIEWER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'TEAM_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'VIEWER';

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "teamId" UUID;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "allowedModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "monthlyBudget" DECIMAL(18,4),
ADD COLUMN     "teamId" UUID;

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "rateLimitRpm" INTEGER,
    "rateLimitRpd" INTEGER,
    "tokenLimitTpm" INTEGER,
    "tokenLimitTpd" INTEGER,
    "dailyBudget" DECIMAL(18,4),
    "monthlyBudget" DECIMAL(18,4),
    "allowedModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "TeamMemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "module" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "monthlyPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "monthlyBudgetLimit" DECIMAL(18,4) NOT NULL DEFAULT 100,
    "dailyBudgetLimit" DECIMAL(18,4),
    "requestsPerMinute" INTEGER NOT NULL DEFAULT 60,
    "requestsPerDay" INTEGER NOT NULL DEFAULT 10000,
    "tokensPerMinute" INTEGER NOT NULL DEFAULT 100000,
    "tokensPerDay" INTEGER NOT NULL DEFAULT 5000000,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMPTZ(3) NOT NULL,
    "monthlyBudgetLimit" DECIMAL(18,4),
    "dailyBudgetLimit" DECIMAL(18,4),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID,
    "category" VARCHAR(50) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teams_tenantId_idx" ON "teams"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_tenantId_name_key" ON "teams"("tenantId", "name");

-- CreateIndex
CREATE INDEX "team_members_userId_idx" ON "team_members"("userId");

-- CreateIndex
CREATE INDEX "team_members_teamId_idx" ON "team_members"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_teamId_userId_key" ON "team_members"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "billing_plans_code_key" ON "billing_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_subscriptions_tenantId_key" ON "tenant_subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "system_settings_tenantId_category_idx" ON "system_settings"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_tenantId_category_key_key" ON "system_settings"("tenantId", "category", "key");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "billing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

