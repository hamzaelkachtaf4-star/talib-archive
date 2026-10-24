-- CreateTable
CREATE TABLE "LawNoteAtom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT NOT NULL,
    "sessionId" TEXT,
    "provenance" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "headingPath" TEXT NOT NULL DEFAULT '[]',
    "sourceAssetId" TEXT,
    "sourceTimestampSec" REAL,
    "sourcePage" INTEGER,
    "articleVersionId" TEXT,
    "decisionId" TEXT,
    "doctrineRefId" TEXT,
    "examRelevant" BOOLEAN NOT NULL DEFAULT true,
    "profEmphasis" BOOLEAN NOT NULL DEFAULT false,
    "profDivergent" BOOLEAN NOT NULL DEFAULT false,
    "mentionBridge" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "fromDerivativeId" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "LawNoteAtom_subjectId_provenance_idx" ON "LawNoteAtom"("subjectId", "provenance");

-- CreateIndex
CREATE INDEX "LawNoteAtom_sessionId_idx" ON "LawNoteAtom"("sessionId");

