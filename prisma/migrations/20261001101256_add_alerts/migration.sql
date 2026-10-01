-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('BUDGET_LIMIT', 'HIGH_USAGE', 'PROVIDER_ERROR', 'SECURITY_ALERT');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('UNREAD', 'READ');

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "AlertStatus" NOT NULL DEFAULT 'UNREAD',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_tenantId_status_createdAt_idx" ON "alerts"("tenantId", "status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
