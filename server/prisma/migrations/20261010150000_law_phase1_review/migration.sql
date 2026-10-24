-- CreateTable
CREATE TABLE "LawSubject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameFr" TEXT,
    "code" TEXT,
    "semester" TEXT NOT NULL DEFAULT 'S3',
    "professorName" TEXT,
    "professorNotes" TEXT,
    "examDate" DATETIME,
    "examFormat" TEXT,
    "dissertationRules" TEXT,
    "coursePlan" TEXT,
    "color" TEXT NOT NULL DEFAULT '#0f2a3f',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "anythingllmWorkspaceId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawTimetableSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'amphi',
    "room" TEXT,
    "placeholder" BOOLEAN NOT NULL DEFAULT false,
    "activeFrom" TEXT,
    "activeTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawTimetableSlot_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "LawSubject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawClassSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT NOT NULL,
    "slotId" TEXT,
    "date" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'captured',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawClassSession_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "LawSubject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawClassSession_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "LawTimetableSlot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawFlashcard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'basic',
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "noteAtomId" TEXT,
    "canonicalIds" TEXT NOT NULL DEFAULT '[]',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" REAL NOT NULL DEFAULT 0,
    "difficulty" REAL NOT NULL DEFAULT 0,
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'new',
    "lastReview" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawFlashcard_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "LawSubject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawReviewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewedAt" DATETIME NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "stateBefore" TEXT NOT NULL,
    "deviceId" TEXT,
    "clientReviewId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawReviewLog_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "LawFlashcard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawStudyDay" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "retrievalMinutes" REAL NOT NULL DEFAULT 0,
    "reviewsDone" INTEGER NOT NULL DEFAULT 0,
    "newCardsLearned" INTEGER NOT NULL DEFAULT 0,
    "casesSolved" INTEGER NOT NULL DEFAULT 0,
    "dissertationsWorked" INTEGER NOT NULL DEFAULT 0,
    "goalMet" BOOLEAN NOT NULL DEFAULT false,
    "freezeUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawStreak" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "current" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "freezesAvailable" INTEGER NOT NULL DEFAULT 0,
    "freezesEarnedTotal" INTEGER NOT NULL DEFAULT 0,
    "weeklyTargetMinutes" INTEGER NOT NULL DEFAULT 140,
    "lastComputedDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "LawTimetableSlot_weekday_idx" ON "LawTimetableSlot"("weekday");

-- CreateIndex
CREATE INDEX "LawClassSession_subjectId_date_idx" ON "LawClassSession"("subjectId", "date");

-- CreateIndex
CREATE INDEX "LawFlashcard_subjectId_due_idx" ON "LawFlashcard"("subjectId", "due");

-- CreateIndex
CREATE INDEX "LawFlashcard_due_idx" ON "LawFlashcard"("due");

-- CreateIndex
CREATE UNIQUE INDEX "LawReviewLog_clientReviewId_key" ON "LawReviewLog"("clientReviewId");

-- CreateIndex
CREATE INDEX "LawReviewLog_cardId_reviewedAt_idx" ON "LawReviewLog"("cardId", "reviewedAt");

-- CreateIndex
CREATE INDEX "LawReviewLog_reviewedAt_idx" ON "LawReviewLog"("reviewedAt");

