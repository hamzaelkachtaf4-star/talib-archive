-- AlterTable
ALTER TABLE "LawUserProfile" ADD COLUMN "aiDailyLimitOverride" INTEGER;

-- CreateTable
CREATE TABLE "LawChatThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "title" TEXT,
    "scope" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" TEXT,
    "scopeSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "LawChatThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawChatAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "messageId" TEXT,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "extractedText" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawChatAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "LawChatMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawAiUsage" (
    "userId" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("userId", "day"),
    CONSTRAINT "LawAiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (additive ADD COLUMN: existing codes keep their rows; they were verified when seeded)
ALTER TABLE "LawCode" ADD COLUMN "normLevel" TEXT NOT NULL DEFAULT 'ORDINARY';
ALTER TABLE "LawCode" ADD COLUMN "domain" TEXT;
ALTER TABLE "LawCode" ADD COLUMN "reviewed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LawCode" ADD COLUMN "sourceUrl" TEXT;

-- Backfill the domain of the pre-seeded codes (slugs from the Phase 3 corpus seed)
UPDATE "LawCode" SET "domain" = 'CIVIL' WHERE "slug" = 'DOC';
UPDATE "LawCode" SET "domain" = 'CRIMINAL' WHERE "slug" = 'CP';
UPDATE "LawCode" SET "domain" = 'PROCEDURE_CIVIL' WHERE "slug" IN ('CPC-1974', 'CPC-58.25');
UPDATE "LawCode" SET "domain" = 'FAMILY' WHERE "slug" = 'MOUDAWANA';
UPDATE "LawCode" SET "domain" = 'LABOUR' WHERE "slug" = 'CT';
UPDATE "LawCode" SET "domain" = 'COMMERCIAL' WHERE "slug" = 'CCOM';


-- CreateIndex
CREATE INDEX "LawChatThread_userId_updatedAt_idx" ON "LawChatThread"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "LawChatMessage_threadId_createdAt_idx" ON "LawChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "LawChatAttachment_userId_createdAt_idx" ON "LawChatAttachment"("userId", "createdAt");

