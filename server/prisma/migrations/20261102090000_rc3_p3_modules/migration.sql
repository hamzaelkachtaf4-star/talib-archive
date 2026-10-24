-- CreateTable
CREATE TABLE "LawCurriculumSeed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "seededAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawCurriculumSeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawModuleProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT NOT NULL,
    "hasPolycopie" BOOLEAN,
    "strategy" TEXT,
    "viewStyle" TEXT NOT NULL DEFAULT 'reader',
    "depth" TEXT NOT NULL DEFAULT 'concise',
    "subjectId" TEXT,
    "setupDoneAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawModuleProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawModuleProfile_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LawCourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawProfessorCard" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT NOT NULL,
    "name" TEXT,
    "teachingStyle" TEXT,
    "attendanceFocus" TEXT,
    "examTendency" TEXT,
    "examFormat" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawProfessorCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawProfessorCard_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LawCourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawLectureSource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT NOT NULL,
    "lectureId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "batchId" TEXT,
    "clientBatchId" TEXT,
    "storageKey" TEXT,
    "keepRaw" BOOLEAN NOT NULL DEFAULT false,
    "extracted" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawLectureSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawLectureSource_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LawCourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawModuleNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'section',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "ord" INTEGER NOT NULL,
    "sourceRefs" TEXT NOT NULL DEFAULT '[]',
    "aiDraft" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawModuleNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawModuleNode_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LawCourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawModuleProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "nodeId" TEXT,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "baseBody" TEXT,
    "sourceRefs" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawModuleProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawModuleProposal_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LawCourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LawCourseModule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facultyCode" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "parcours" TEXT NOT NULL DEFAULT '',
    "ordinal" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'timetable',
    "verified" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "LawCourseModule_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawCourseModule" ("facultyCode", "id", "language", "ordinal", "parcours", "semester", "title", "track") SELECT "facultyCode", "id", "language", "ordinal", "parcours", "semester", "title", "track" FROM "LawCourseModule";
DROP TABLE "LawCourseModule";
ALTER TABLE "new_LawCourseModule" RENAME TO "LawCourseModule";
CREATE INDEX "LawCourseModule_ownerId_idx" ON "LawCourseModule"("ownerId");
CREATE UNIQUE INDEX "LawCourseModule_facultyCode_semester_track_language_parcours_ordinal_key" ON "LawCourseModule"("facultyCode", "semester", "track", "language", "parcours", "ordinal");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "LawCurriculumSeed_userId_key_key" ON "LawCurriculumSeed"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "LawModuleProfile_userId_moduleId_key" ON "LawModuleProfile"("userId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "LawProfessorCard_userId_moduleId_key" ON "LawProfessorCard"("userId", "moduleId");

-- CreateIndex
CREATE INDEX "LawLectureSource_userId_moduleId_idx" ON "LawLectureSource"("userId", "moduleId");

-- CreateIndex
CREATE INDEX "LawModuleNode_userId_moduleId_parentId_ord_idx" ON "LawModuleNode"("userId", "moduleId", "parentId", "ord");

-- CreateIndex
CREATE INDEX "LawModuleProposal_userId_moduleId_status_idx" ON "LawModuleProposal"("userId", "moduleId", "status");
