-- CreateTable
CREATE TABLE "LawCaseExercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT,
    "title" TEXT NOT NULL,
    "factsAr" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'self_written',
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "targetQualifications" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawCaseAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exerciseId" TEXT NOT NULL,
    "timed" BOOLEAN NOT NULL DEFAULT false,
    "timeLimitSec" INTEGER,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" INTEGER,
    "phases" TEXT NOT NULL DEFAULT '{}',
    "submittedAt" DATETIME,
    "critique" TEXT,
    "rubricScores" TEXT,
    "citationCheck" TEXT,
    "suggestedCards" TEXT,
    "modelAnswer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawCaseAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "LawCaseExercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawDissertation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT,
    "topic" TEXT NOT NULL,
    "intro" TEXT NOT NULL DEFAULT '{"steps":[]}',
    "plan" TEXT NOT NULL DEFAULT '{"sections":[]}',
    "draftBody" TEXT,
    "critique" TEXT,
    "ruleViolations" TEXT,
    "citationCheck" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "LawCaseAttempt_exerciseId_idx" ON "LawCaseAttempt"("exerciseId");

