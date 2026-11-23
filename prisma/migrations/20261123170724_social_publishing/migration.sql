-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('facebook', 'instagram', 'x', 'linkedin', 'tiktok');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "PublicationDispatch" AS ENUM ('manual', 'connector');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('scheduled', 'publishing', 'published', 'failed', 'unknown', 'cancelled');

-- AlterTable
ALTER TABLE "content_revision" ADD COLUMN     "assetIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "content_asset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_account" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "displayName" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "credentials" TEXT,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'active',
    "tokenExpiresAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "accountLabel" TEXT,
    "socialAccountId" TEXT,
    "dispatch" "PublicationDispatch" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'scheduled',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "postText" TEXT NOT NULL,
    "assetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checkpoint" JSONB,
    "claimedAt" TIMESTAMP(3),
    "providerPostId" TEXT,
    "externalUrl" TEXT,
    "failureReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_asset_storageKey_key" ON "content_asset"("storageKey");

-- CreateIndex
CREATE INDEX "content_asset_contentId_idx" ON "content_asset"("contentId");

-- CreateIndex
CREATE INDEX "social_account_organizationId_idx" ON "social_account"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "social_account_brandId_platform_key" ON "social_account"("brandId", "platform");

-- CreateIndex
CREATE INDEX "publication_status_dispatch_scheduledAt_idx" ON "publication"("status", "dispatch", "scheduledAt");

-- CreateIndex
CREATE INDEX "publication_organizationId_scheduledAt_idx" ON "publication"("organizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "publication_contentId_idx" ON "publication"("contentId");

-- AddForeignKey
ALTER TABLE "content_asset" ADD CONSTRAINT "content_asset_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication" ADD CONSTRAINT "publication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication" ADD CONSTRAINT "publication_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication" ADD CONSTRAINT "publication_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
