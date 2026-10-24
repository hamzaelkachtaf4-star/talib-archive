-- AlterTable (additive ADD COLUMN)
ALTER TABLE "LawDrillItem" ADD COLUMN "ownerUserId" INTEGER;
ALTER TABLE "LawNodeProgress" ADD COLUMN "xpAwarded" BOOLEAN NOT NULL DEFAULT false;
-- completions that existed before this migration keep their XP
UPDATE "LawNodeProgress" SET "xpAwarded" = true WHERE "state" = 'COMPLETED';

-- RedefineTables (LawAiCorrection gains a user foreign key with ON DELETE CASCADE; existing rows are copied across)
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LawAiCorrection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "reporterId" INTEGER NOT NULL,
    "claim" TEXT NOT NULL,
    "correction" TEXT NOT NULL,
    "citations" TEXT NOT NULL,
    "rootCause" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "topicKeys" TEXT NOT NULL DEFAULT '[]',
    "reviewerId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    CONSTRAINT "LawAiCorrection_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawAiCorrection" ("citations", "claim", "correction", "createdAt", "decidedAt", "id", "messageId", "reporterId", "reviewerId", "rootCause", "scope", "status", "topicKeys") SELECT "citations", "claim", "correction", "createdAt", "decidedAt", "id", "messageId", "reporterId", "reviewerId", "rootCause", "scope", "status", "topicKeys" FROM "LawAiCorrection";
DROP TABLE "LawAiCorrection";
ALTER TABLE "new_LawAiCorrection" RENAME TO "LawAiCorrection";
CREATE INDEX "LawAiCorrection_status_scope_idx" ON "LawAiCorrection"("status", "scope");
CREATE INDEX "LawAiCorrection_reporterId_idx" ON "LawAiCorrection"("reporterId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
