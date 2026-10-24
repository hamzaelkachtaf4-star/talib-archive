-- Talib v3 workspace, second round: the share of each kind of source per subject, and notes the mentor remembers about the student. Additive only.
ALTER TABLE "LawModuleProfile" ADD COLUMN "sourceMix" TEXT;

CREATE TABLE "LawMentorMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'student',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawMentorMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LawMentorMemory_userId_moduleId_idx" ON "LawMentorMemory"("userId", "moduleId");
