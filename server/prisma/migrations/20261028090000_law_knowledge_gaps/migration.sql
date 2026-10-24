-- CreateTable
CREATE TABLE "LawKnowledgeGap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "sectionTitle" TEXT,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "areaTouched" BOOLEAN NOT NULL DEFAULT true,
    "topicId" TEXT,
    "conceptId" TEXT NOT NULL DEFAULT '',
    "coverage" REAL NOT NULL,
    "severity" REAL NOT NULL,
    "signals" TEXT NOT NULL DEFAULT '{}',
    "quote" TEXT NOT NULL,
    "explanationAr" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "analysisVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawKnowledgeGap_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LawStudentCourse" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawKnowledgeGap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LawKnowledgeGap_courseId_status_severity_idx" ON "LawKnowledgeGap"("courseId", "status", "severity");

-- CreateIndex
CREATE INDEX "LawKnowledgeGap_userId_idx" ON "LawKnowledgeGap"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LawKnowledgeGap_courseId_canonicalId_kind_key" ON "LawKnowledgeGap"("courseId", "canonicalId", "kind");

