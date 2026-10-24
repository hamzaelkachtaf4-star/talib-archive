-- CreateTable
CREATE TABLE "LawExamDate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "room" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawExamDate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawExamDate_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LawCourseModule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawDrillAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "promptJson" TEXT NOT NULL,
    "answerJson" TEXT,
    "feedbackJson" TEXT,
    "score" REAL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawDrillAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawDrillAttempt_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LawCourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LawExamDate_userId_startsAt_idx" ON "LawExamDate"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "LawDrillAttempt_userId_moduleId_type_idx" ON "LawDrillAttempt"("userId", "moduleId", "type");
