-- CreateTable
CREATE TABLE "LawStudentCourse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "subjectId" TEXT,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "topicCount" INTEGER NOT NULL DEFAULT 0,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawStudentCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawCourseTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "parentId" TEXT,
    "ord" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "headingPath" TEXT NOT NULL DEFAULT '[]',
    "text" TEXT NOT NULL DEFAULT '',
    "emphasis" TEXT NOT NULL DEFAULT '[]',
    "charCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LawCourseTopic_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LawStudentCourse" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawCourseTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LawStudentCourse_userId_idx" ON "LawStudentCourse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LawStudentCourse_userId_sourceHash_key" ON "LawStudentCourse"("userId", "sourceHash");

-- CreateIndex
CREATE INDEX "LawCourseTopic_courseId_parentId_ord_idx" ON "LawCourseTopic"("courseId", "parentId", "ord");

-- CreateIndex
CREATE INDEX "LawCourseTopic_userId_idx" ON "LawCourseTopic"("userId");

