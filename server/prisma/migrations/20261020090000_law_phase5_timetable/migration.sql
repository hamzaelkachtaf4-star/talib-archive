-- CreateTable
CREATE TABLE "LawTimetableSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facultyCode" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "parseLog" TEXT
);

-- CreateTable
CREATE TABLE "LawFdcSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "facultyCode" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "parcours" TEXT NOT NULL DEFAULT '',
    "groupCode" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COURS',
    "room" TEXT,
    "professor" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "LawFdcSession_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LawTimetableSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawTimetableSubscription" (
    "userId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "facultyCode" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "parcours" TEXT NOT NULL DEFAULT '',
    "groupCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawTimetableSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawTimetableOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "date" TEXT,
    "data" TEXT NOT NULL,
    "clientOpId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawTimetableOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LawTimetableSource_url_sha256_key" ON "LawTimetableSource"("url", "sha256");

-- CreateIndex
CREATE INDEX "LawFdcSession_facultyCode_semester_track_language_groupCode_published_idx" ON "LawFdcSession"("facultyCode", "semester", "track", "language", "groupCode", "published");

-- CreateIndex
CREATE INDEX "LawFdcSession_sourceId_idx" ON "LawFdcSession"("sourceId");

-- CreateIndex
CREATE INDEX "LawTimetableOverride_userId_idx" ON "LawTimetableOverride"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LawTimetableOverride_userId_clientOpId_key" ON "LawTimetableOverride"("userId", "clientOpId");

