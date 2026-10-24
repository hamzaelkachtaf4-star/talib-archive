-- Talib v3 forum: subject visibility and colour, note document type, shared exams. Additive only.
ALTER TABLE "LawModuleProfile" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LawModuleProfile" ADD COLUMN "color" TEXT;
ALTER TABLE "LawMasterNote" ADD COLUMN "docType" TEXT;

-- CreateTable
CREATE TABLE "LawSharedExam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" INTEGER NOT NULL,
    "sourceDrillId" INTEGER,
    "facultyCode" TEXT NOT NULL,
    "moduleTitle" TEXT NOT NULL,
    "semester" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'qcm',
    "questionCount" INTEGER NOT NULL,
    "promptJson" TEXT NOT NULL,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "helpful" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawSharedExam_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawSharedExamVote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "examId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawSharedExamVote_examId_fkey" FOREIGN KEY ("examId") REFERENCES "LawSharedExam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawSharedExamVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LawSharedExam_facultyCode_status_createdAt_idx" ON "LawSharedExam"("facultyCode", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LawSharedExam_authorId_idx" ON "LawSharedExam"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "LawSharedExamVote_examId_userId_kind_key" ON "LawSharedExamVote"("examId", "userId", "kind");

