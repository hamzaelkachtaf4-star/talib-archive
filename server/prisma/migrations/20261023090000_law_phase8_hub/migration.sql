-- CreateTable
CREATE TABLE "LawNoteRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "parentId" TEXT,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawNoteRevision_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "LawMasterNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawChangeRequest" (
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
    CONSTRAINT "LawChangeRequest_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "LawMasterNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawNoteCoAuthor" (
    "noteId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "viaChangeRequestId" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("noteId", "userId"),
    CONSTRAINT "LawNoteCoAuthor_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "LawMasterNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawNoteReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "reporterId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawNoteReport_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "LawMasterNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (additive ADD COLUMN: existing master notes and their forks/endorsements are untouched)
ALTER TABLE "LawMasterNote" ADD COLUMN "headRevisionId" TEXT;
ALTER TABLE "LawMasterNote" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "LawMasterNote" ADD COLUMN "hiddenReason" TEXT;
ALTER TABLE "LawMasterNote" ADD COLUMN "appealedAt" DATETIME;


-- CreateIndex
CREATE INDEX "LawNoteRevision_noteId_createdAt_idx" ON "LawNoteRevision"("noteId", "createdAt");

-- CreateIndex
CREATE INDEX "LawChangeRequest_noteId_status_idx" ON "LawChangeRequest"("noteId", "status");

-- CreateIndex
CREATE INDEX "LawChangeRequest_authorId_idx" ON "LawChangeRequest"("authorId");

-- CreateIndex
CREATE INDEX "LawNoteReport_noteId_status_idx" ON "LawNoteReport"("noteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LawNoteReport_noteId_reporterId_key" ON "LawNoteReport"("noteId", "reporterId");

