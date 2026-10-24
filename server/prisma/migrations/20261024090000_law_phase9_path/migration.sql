-- CreateTable
CREATE TABLE "LawCourseModule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facultyCode" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "parcours" TEXT NOT NULL DEFAULT '',
    "ordinal" INTEGER NOT NULL,
    "title" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "LawPathNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "legalRefs" TEXT NOT NULL DEFAULT '[]',
    "prereqIds" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "LawPathNode_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LawCourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawNodeProgress" (
    "userId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "nodeId"),
    CONSTRAINT "LawNodeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawNodeProgress_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LawPathNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawPathPin" (
    "userId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "nodeId", "noteId"),
    CONSTRAINT "LawPathPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawPathPin_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LawPathNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LawCourseModule_facultyCode_semester_track_language_parcours_ordinal_key" ON "LawCourseModule"("facultyCode", "semester", "track", "language", "parcours", "ordinal");

-- CreateIndex
CREATE INDEX "LawPathNode_moduleId_ordinal_idx" ON "LawPathNode"("moduleId", "ordinal");

