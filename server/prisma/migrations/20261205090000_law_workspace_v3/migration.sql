-- Talib v3 workspace: a session marked understood, the exam set-up per subject, and content error reports. Additive only.
ALTER TABLE "LawModuleNode" ADD COLUMN "doneAt" DATETIME;
ALTER TABLE "LawModuleProfile" ADD COLUMN "examConfig" TEXT;

CREATE TABLE "LawNodeReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawNodeReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LawNodeReport_userId_createdAt_idx" ON "LawNodeReport"("userId", "createdAt");
