-- AlterTable
ALTER TABLE "LawUserProfile" ADD COLUMN "shareCode" TEXT;

-- CreateTable
CREATE TABLE "LawSquadDoc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "squadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "url" TEXT,
    "headRevisionId" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawSquadDoc_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "LawSquad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawSquadDocRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "parentId" TEXT,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawSquadDocRevision_docId_fkey" FOREIGN KEY ("docId") REFERENCES "LawSquadDoc" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawSquadChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "baseRevisionId" TEXT NOT NULL,
    "proposedRevisionId" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewerId" INTEGER,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "decidedAt" DATETIME,
    CONSTRAINT "LawSquadChangeRequest_docId_fkey" FOREIGN KEY ("docId") REFERENCES "LawSquadDoc" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawCampusPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facultyCode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentId" TEXT,
    "authorId" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hiddenReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawCampusPost_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LawCampusPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawCampusPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawCampusReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "reporterId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawCampusReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "LawCampusPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawCampusReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LawSquadDoc_squadId_createdAt_idx" ON "LawSquadDoc"("squadId", "createdAt");

-- CreateIndex
CREATE INDEX "LawSquadDocRevision_docId_createdAt_idx" ON "LawSquadDocRevision"("docId", "createdAt");

-- CreateIndex
CREATE INDEX "LawSquadChangeRequest_docId_status_idx" ON "LawSquadChangeRequest"("docId", "status");

-- CreateIndex
CREATE INDEX "LawSquadChangeRequest_authorId_idx" ON "LawSquadChangeRequest"("authorId");

-- CreateIndex
CREATE INDEX "LawCampusPost_facultyCode_kind_createdAt_idx" ON "LawCampusPost"("facultyCode", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "LawCampusPost_parentId_idx" ON "LawCampusPost"("parentId");

-- CreateIndex
CREATE INDEX "LawCampusReport_postId_status_idx" ON "LawCampusReport"("postId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LawCampusReport_postId_reporterId_key" ON "LawCampusReport"("postId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "LawUserProfile_shareCode_key" ON "LawUserProfile"("shareCode");
