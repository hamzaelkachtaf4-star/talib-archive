-- The unique keys below did not exist when the first version of this feature shipped, and its check-then-insert could have
-- stored the same device batch twice. Keep the oldest source of each duplicated batch so the indexes can be created.
DELETE FROM "LawLectureSource" WHERE "clientBatchId" IS NOT NULL AND "id" NOT IN (SELECT MIN("id") FROM "LawLectureSource" WHERE "clientBatchId" IS NOT NULL GROUP BY "userId", "clientBatchId");
DELETE FROM "LawLectureSource" WHERE "batchId" IS NOT NULL AND "id" NOT IN (SELECT MIN("id") FROM "LawLectureSource" WHERE "batchId" IS NOT NULL GROUP BY "userId", "batchId");

-- AlterTable
ALTER TABLE "LawModuleProposal" ADD COLUMN "baseTitle" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LawLectureSource_userId_clientBatchId_key" ON "LawLectureSource"("userId", "clientBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "LawLectureSource_userId_batchId_key" ON "LawLectureSource"("userId", "batchId");
