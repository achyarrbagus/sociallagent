-- CreateEnum
CREATE TYPE "AiUsageSource" AS ENUM ('task', 'chat');

-- CreateTable
CREATE TABLE "ai_usage_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" "AiUsageSource" NOT NULL,
    "agentId" TEXT,
    "userId" TEXT,
    "brandId" TEXT,
    "contentId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_event_organizationId_createdAt_idx" ON "ai_usage_event"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_event_brandId_createdAt_idx" ON "ai_usage_event"("brandId", "createdAt");
