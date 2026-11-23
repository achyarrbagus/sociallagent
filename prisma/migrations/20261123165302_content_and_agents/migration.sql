-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('idle', 'running', 'paused', 'error');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('idea', 'in_production', 'awaiting_owner', 'changes_requested', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('text', 'image', 'carousel', 'video');

-- CreateEnum
CREATE TYPE "ContentDecisionKind" AS ENUM ('select_idea', 'approve', 'request_changes', 'reject');

-- CreateEnum
CREATE TYPE "ProductionRole" AS ENUM ('creative', 'strategy', 'copywriting', 'design', 'seo', 'marketing', 'analysis');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "agent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "reportsToId" TEXT,
    "instructions" TEXT NOT NULL,
    "paletteId" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'idle',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'idea',
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "approvedRevisionNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_revision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "idea" TEXT NOT NULL DEFAULT '',
    "hook" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "script" TEXT NOT NULL DEFAULT '',
    "cta" TEXT NOT NULL DEFAULT '',
    "format" "ContentFormat" NOT NULL DEFAULT 'text',
    "targetAccount" TEXT NOT NULL DEFAULT '',
    "brandUpdatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3) NOT NULL,
    "campaignObjective" TEXT,
    "createdByType" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_decision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "decision" "ContentDecisionKind" NOT NULL,
    "note" TEXT,
    "decidedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "role" "ProductionRole" NOT NULL,
    "instructions" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'queued',
    "baseRevisionNumber" INTEGER NOT NULL,
    "resultRevisionNumber" INTEGER,
    "summary" TEXT,
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "content_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_organizationId_idx" ON "agent"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_organizationId_slug_key" ON "agent"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "content_organizationId_status_idx" ON "content"("organizationId", "status");

-- CreateIndex
CREATE INDEX "content_brandId_idx" ON "content"("brandId");

-- CreateIndex
CREATE INDEX "content_campaignId_idx" ON "content"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "content_revision_contentId_revisionNumber_key" ON "content_revision"("contentId", "revisionNumber");

-- CreateIndex
CREATE INDEX "content_decision_contentId_revisionNumber_idx" ON "content_decision"("contentId", "revisionNumber");

-- CreateIndex
CREATE INDEX "content_task_contentId_idx" ON "content_task"("contentId");

-- CreateIndex
CREATE INDEX "content_task_organizationId_status_idx" ON "content_task"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "agent" ADD CONSTRAINT "agent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent" ADD CONSTRAINT "agent_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_decision" ADD CONSTRAINT "content_decision_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_task" ADD CONSTRAINT "content_task_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_task" ADD CONSTRAINT "content_task_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
