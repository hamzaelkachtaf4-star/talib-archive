-- CreateTable
CREATE TABLE "LawConcept" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleFr" TEXT,
    "domain" TEXT NOT NULL,
    "moduleIds" TEXT NOT NULL DEFAULT '[]',
    "legalRefs" TEXT NOT NULL DEFAULT '[]',
    "reviewed" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "LawConfusionPair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conceptAId" TEXT NOT NULL,
    "conceptBId" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "contrastMd" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "LawDrillItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pairId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "explanation" TEXT,
    "citedIds" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'BANK',
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LawLearnerMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL DEFAULT '',
    "confusionPairId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'SUSPECTED',
    "strength" REAL NOT NULL DEFAULT 0,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "summaryAr" TEXT NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "lastRemediatedAt" DATETIME,
    "dismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawLearnerMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawLearnerEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memoryId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "excerpt" TEXT,
    "weight" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawLearnerEvidence_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "LawLearnerMemory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawConceptMastery" (
    "userId" INTEGER NOT NULL,
    "conceptId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "conceptId"),
    CONSTRAINT "LawConceptMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawAiCorrection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "reporterId" INTEGER NOT NULL,
    "claim" TEXT NOT NULL,
    "correction" TEXT NOT NULL,
    "citations" TEXT NOT NULL,
    "rootCause" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "topicKeys" TEXT NOT NULL DEFAULT '[]',
    "reviewerId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME
);

-- CreateTable
CREATE TABLE "LawRateCounter" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable (additive ADD COLUMN: preferences, path nodes and flashcards keep every row and index untouched)
ALTER TABLE "LawUserPreferences" ADD COLUMN "memoryEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LawPathNode" ADD COLUMN "conceptIds" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "LawFlashcard" ADD COLUMN "conceptIds" TEXT NOT NULL DEFAULT '[]';

-- RedefineTables
-- (LawBlock / LawNoteReport / LawNoteCoAuthor / LawChangeRequest gain user foreign keys with ON DELETE CASCADE;
-- they were created in the previous migrations, so any rows are copied across)
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LawBlock" (
    "blockerId" INTEGER NOT NULL,
    "blockedId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("blockerId", "blockedId"),
    CONSTRAINT "LawBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawBlock" ("blockedId", "blockerId", "createdAt") SELECT "blockedId", "blockerId", "createdAt" FROM "LawBlock";
DROP TABLE "LawBlock";
ALTER TABLE "new_LawBlock" RENAME TO "LawBlock";
CREATE INDEX "LawBlock_blockedId_idx" ON "LawBlock"("blockedId");
CREATE TABLE "new_LawNoteReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "reporterId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawNoteReport_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "LawMasterNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawNoteReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawNoteReport" ("createdAt", "detail", "id", "noteId", "reason", "reporterId", "status") SELECT "createdAt", "detail", "id", "noteId", "reason", "reporterId", "status" FROM "LawNoteReport";
DROP TABLE "LawNoteReport";
ALTER TABLE "new_LawNoteReport" RENAME TO "LawNoteReport";
CREATE INDEX "LawNoteReport_noteId_status_idx" ON "LawNoteReport"("noteId", "status");
CREATE UNIQUE INDEX "LawNoteReport_noteId_reporterId_key" ON "LawNoteReport"("noteId", "reporterId");
CREATE TABLE "new_LawNoteCoAuthor" (
    "noteId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "viaChangeRequestId" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("noteId", "userId"),
    CONSTRAINT "LawNoteCoAuthor_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "LawMasterNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawNoteCoAuthor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawNoteCoAuthor" ("addedAt", "noteId", "userId", "viaChangeRequestId") SELECT "addedAt", "noteId", "userId", "viaChangeRequestId" FROM "LawNoteCoAuthor";
DROP TABLE "LawNoteCoAuthor";
ALTER TABLE "new_LawNoteCoAuthor" RENAME TO "LawNoteCoAuthor";
CREATE TABLE "new_LawChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "baseRevisionId" TEXT NOT NULL,
    "proposedRevisionId" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewerId" INTEGER,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    CONSTRAINT "LawChangeRequest_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "LawMasterNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawChangeRequest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawChangeRequest" ("authorId", "baseRevisionId", "createdAt", "decidedAt", "description", "id", "noteId", "proposedRevisionId", "reviewNote", "reviewerId", "status", "title") SELECT "authorId", "baseRevisionId", "createdAt", "decidedAt", "description", "id", "noteId", "proposedRevisionId", "reviewNote", "reviewerId", "status", "title" FROM "LawChangeRequest";
DROP TABLE "LawChangeRequest";
ALTER TABLE "new_LawChangeRequest" RENAME TO "LawChangeRequest";
CREATE INDEX "LawChangeRequest_noteId_status_idx" ON "LawChangeRequest"("noteId", "status");
CREATE INDEX "LawChangeRequest_authorId_idx" ON "LawChangeRequest"("authorId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "LawConcept_slug_key" ON "LawConcept"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LawConfusionPair_conceptAId_conceptBId_key" ON "LawConfusionPair"("conceptAId", "conceptBId");

-- CreateIndex
CREATE INDEX "LawDrillItem_pairId_reviewed_idx" ON "LawDrillItem"("pairId", "reviewed");

-- CreateIndex
CREATE INDEX "LawLearnerMemory_userId_status_idx" ON "LawLearnerMemory"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LawLearnerMemory_userId_kind_conceptId_confusionPairId_key" ON "LawLearnerMemory"("userId", "kind", "conceptId", "confusionPairId");

-- CreateIndex
CREATE INDEX "LawLearnerEvidence_memoryId_createdAt_idx" ON "LawLearnerEvidence"("memoryId", "createdAt");

-- CreateIndex
CREATE INDEX "LawAiCorrection_status_scope_idx" ON "LawAiCorrection"("status", "scope");

-- CreateIndex
CREATE INDEX "LawAiCorrection_reporterId_idx" ON "LawAiCorrection"("reporterId");

