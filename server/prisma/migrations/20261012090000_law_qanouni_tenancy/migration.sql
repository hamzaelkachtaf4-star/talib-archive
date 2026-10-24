-- Qanouni multi-user (docs/plans/qanouni.md). Hand-edited after `prisma migrate diff`:
-- every existing LAW-OS row belongs to the owner, i.e. the first admin. If there is no admin yet, one is
-- created with an unusable password ("!" never matches a bcrypt hash); /law/setup gives it real credentials.
INSERT INTO "users" ("username", "password", "role")
  SELECT 'qanouni-owner', '!', 'admin'
  WHERE NOT EXISTS (SELECT 1 FROM "users" WHERE "role" = 'admin');

-- CreateTable
CREATE TABLE "LawUserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "university" TEXT NOT NULL DEFAULT 'FSJES Aïn Chock',
    "section" TEXT NOT NULL DEFAULT 'S3 Droit privé G01',
    "googleSub" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawUserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LawStudyDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "retrievalMinutes" REAL NOT NULL DEFAULT 0,
    "reviewsDone" INTEGER NOT NULL DEFAULT 0,
    "newCardsLearned" INTEGER NOT NULL DEFAULT 0,
    "casesSolved" INTEGER NOT NULL DEFAULT 0,
    "dissertationsWorked" INTEGER NOT NULL DEFAULT 0,
    "goalMet" BOOLEAN NOT NULL DEFAULT false,
    "freezeUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawStudyDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawStudyDay" ("id", "userId", "casesSolved", "createdAt", "date", "dissertationsWorked", "freezeUsed", "goalMet", "newCardsLearned", "retrievalMinutes", "reviewsDone", "updatedAt") SELECT lower(hex(randomblob(12))), (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "casesSolved", "createdAt", "date", "dissertationsWorked", "freezeUsed", "goalMet", "newCardsLearned", "retrievalMinutes", "reviewsDone", "updatedAt" FROM "LawStudyDay";
DROP TABLE "LawStudyDay";
ALTER TABLE "new_LawStudyDay" RENAME TO "LawStudyDay";
CREATE INDEX "LawStudyDay_userId_idx" ON "LawStudyDay"("userId");
CREATE UNIQUE INDEX "LawStudyDay_userId_date_key" ON "LawStudyDay"("userId", "date");
CREATE TABLE "new_LawDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "court" TEXT NOT NULL DEFAULT 'محكمة النقض',
    "decisionNumber" TEXT NOT NULL,
    "decisionDate" DATETIME NOT NULL,
    "chamber" TEXT,
    "fileNumber" TEXT,
    "subjectMatter" TEXT,
    "principle" TEXT,
    "fullTextAr" TEXT,
    "sourceUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawDecision" ("userId", "chamber", "court", "createdAt", "decisionDate", "decisionNumber", "fileNumber", "fullTextAr", "id", "principle", "sourceUrl", "subjectMatter", "updatedAt", "verified", "verifiedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "chamber", "court", "createdAt", "decisionDate", "decisionNumber", "fileNumber", "fullTextAr", "id", "principle", "sourceUrl", "subjectMatter", "updatedAt", "verified", "verifiedAt" FROM "LawDecision";
DROP TABLE "LawDecision";
ALTER TABLE "new_LawDecision" RENAME TO "LawDecision";
CREATE INDEX "LawDecision_userId_idx" ON "LawDecision"("userId");
CREATE UNIQUE INDEX "LawDecision_userId_court_decisionNumber_decisionDate_key" ON "LawDecision"("userId", "court", "decisionNumber", "decisionDate");
CREATE TABLE "new_LawDissertation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT,
    "topic" TEXT NOT NULL,
    "intro" TEXT NOT NULL DEFAULT '{"steps":[]}',
    "plan" TEXT NOT NULL DEFAULT '{"sections":[]}',
    "draftBody" TEXT,
    "critique" TEXT,
    "ruleViolations" TEXT,
    "citationCheck" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawDissertation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawDissertation" ("userId", "citationCheck", "createdAt", "critique", "draftBody", "id", "intro", "plan", "ruleViolations", "status", "subjectId", "topic", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "citationCheck", "createdAt", "critique", "draftBody", "id", "intro", "plan", "ruleViolations", "status", "subjectId", "topic", "updatedAt" FROM "LawDissertation";
DROP TABLE "LawDissertation";
ALTER TABLE "new_LawDissertation" RENAME TO "LawDissertation";
CREATE INDEX "LawDissertation_userId_idx" ON "LawDissertation"("userId");
CREATE TABLE "new_LawLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawLink" ("userId", "createdAt", "fromId", "fromType", "id", "note", "relation", "toId", "toType", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "createdAt", "fromId", "fromType", "id", "note", "relation", "toId", "toType", "updatedAt" FROM "LawLink";
DROP TABLE "LawLink";
ALTER TABLE "new_LawLink" RENAME TO "LawLink";
CREATE INDEX "LawLink_toType_toId_idx" ON "LawLink"("toType", "toId");
CREATE INDEX "LawLink_userId_idx" ON "LawLink"("userId");
CREATE UNIQUE INDEX "LawLink_userId_fromType_fromId_toType_toId_relation_key" ON "LawLink"("userId", "fromType", "fromId", "toType", "toId", "relation");
CREATE TABLE "new_LawTimetableSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'amphi',
    "room" TEXT,
    "placeholder" BOOLEAN NOT NULL DEFAULT false,
    "activeFrom" TEXT,
    "activeTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawTimetableSlot_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "LawSubject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LawTimetableSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawTimetableSlot" ("userId", "activeFrom", "activeTo", "createdAt", "endTime", "id", "kind", "placeholder", "room", "startTime", "subjectId", "updatedAt", "weekday") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "activeFrom", "activeTo", "createdAt", "endTime", "id", "kind", "placeholder", "room", "startTime", "subjectId", "updatedAt", "weekday" FROM "LawTimetableSlot";
DROP TABLE "LawTimetableSlot";
ALTER TABLE "new_LawTimetableSlot" RENAME TO "LawTimetableSlot";
CREATE INDEX "LawTimetableSlot_weekday_idx" ON "LawTimetableSlot"("weekday");
CREATE INDEX "LawTimetableSlot_userId_idx" ON "LawTimetableSlot"("userId");
CREATE TABLE "new_LawPushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "keys" TEXT NOT NULL,
    "deviceId" TEXT,
    "lastSuccessAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawPushSubscription" ("userId", "createdAt", "deviceId", "endpoint", "id", "keys", "lastSuccessAt", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "createdAt", "deviceId", "endpoint", "id", "keys", "lastSuccessAt", "updatedAt" FROM "LawPushSubscription";
DROP TABLE "LawPushSubscription";
ALTER TABLE "new_LawPushSubscription" RENAME TO "LawPushSubscription";
CREATE UNIQUE INDEX "LawPushSubscription_endpoint_key" ON "LawPushSubscription"("endpoint");
CREATE INDEX "LawPushSubscription_userId_idx" ON "LawPushSubscription"("userId");
CREATE TABLE "new_LawCaptureBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientBatchId" TEXT NOT NULL,
    "sessionId" TEXT,
    "subjectId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploading',
    "expectedParts" INTEGER,
    "receivedParts" INTEGER NOT NULL DEFAULT 0,
    "capturedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawCaptureBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawCaptureBatch" ("userId", "capturedAt", "clientBatchId", "createdAt", "expectedParts", "id", "kind", "receivedParts", "sessionId", "status", "subjectId", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "capturedAt", "clientBatchId", "createdAt", "expectedParts", "id", "kind", "receivedParts", "sessionId", "status", "subjectId", "updatedAt" FROM "LawCaptureBatch";
DROP TABLE "LawCaptureBatch";
ALTER TABLE "new_LawCaptureBatch" RENAME TO "LawCaptureBatch";
CREATE INDEX "LawCaptureBatch_status_idx" ON "LawCaptureBatch"("status");
CREATE INDEX "LawCaptureBatch_userId_idx" ON "LawCaptureBatch"("userId");
CREATE UNIQUE INDEX "LawCaptureBatch_userId_clientBatchId_key" ON "LawCaptureBatch"("userId", "clientBatchId");
CREATE TABLE "new_LawJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 4,
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "error" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" REAL NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER,
    CONSTRAINT "LawJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawJob" ("userId", "attempts", "createdAt", "durationMs", "error", "estimatedCostUsd", "id", "lockedAt", "lockedBy", "maxAttempts", "model", "payload", "priority", "provider", "runAfter", "status", "tokensIn", "tokensOut", "type", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "attempts", "createdAt", "durationMs", "error", "estimatedCostUsd", "id", "lockedAt", "lockedBy", "maxAttempts", "model", "payload", "priority", "provider", "runAfter", "status", "tokensIn", "tokensOut", "type", "updatedAt" FROM "LawJob";
DROP TABLE "LawJob";
ALTER TABLE "new_LawJob" RENAME TO "LawJob";
CREATE INDEX "LawJob_status_runAfter_priority_idx" ON "LawJob"("status", "runAfter", "priority");
CREATE INDEX "LawJob_type_idx" ON "LawJob"("type");
CREATE INDEX "LawJob_userId_idx" ON "LawJob"("userId");
CREATE TABLE "new_LawAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sha256" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "durationSec" REAL,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "storagePath" TEXT NOT NULL,
    "originalFilename" TEXT,
    "sessionId" TEXT,
    "subjectId" TEXT,
    "batchId" TEXT,
    "orderInBatch" INTEGER NOT NULL DEFAULT 0,
    "capturedAt" DATETIME,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCaptureId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawAsset_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LawCaptureBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LawAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawAsset" ("userId", "batchId", "bytes", "capturedAt", "clientCaptureId", "createdAt", "deviceId", "durationSec", "heightPx", "id", "kind", "mime", "orderInBatch", "originalFilename", "sessionId", "sha256", "storagePath", "subjectId", "updatedAt", "uploadedAt", "widthPx") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "batchId", "bytes", "capturedAt", "clientCaptureId", "createdAt", "deviceId", "durationSec", "heightPx", "id", "kind", "mime", "orderInBatch", "originalFilename", "sessionId", "sha256", "storagePath", "subjectId", "updatedAt", "uploadedAt", "widthPx" FROM "LawAsset";
DROP TABLE "LawAsset";
ALTER TABLE "new_LawAsset" RENAME TO "LawAsset";
CREATE INDEX "LawAsset_batchId_orderInBatch_idx" ON "LawAsset"("batchId", "orderInBatch");
CREATE INDEX "LawAsset_sessionId_idx" ON "LawAsset"("sessionId");
CREATE INDEX "LawAsset_userId_idx" ON "LawAsset"("userId");
CREATE UNIQUE INDEX "LawAsset_userId_sha256_key" ON "LawAsset"("userId", "sha256");
CREATE UNIQUE INDEX "LawAsset_userId_clientCaptureId_key" ON "LawAsset"("userId", "clientCaptureId");
CREATE TABLE "new_LawDerivative" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT,
    "batchId" TEXT,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "provider" TEXT,
    "model" TEXT,
    "jobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawDerivative_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "LawAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawDerivative_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LawCaptureBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawDerivative_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawDerivative" ("userId", "assetId", "batchId", "content", "createdAt", "id", "jobId", "kind", "language", "model", "provider", "updatedAt", "verificationStatus") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "assetId", "batchId", "content", "createdAt", "id", "jobId", "kind", "language", "model", "provider", "updatedAt", "verificationStatus" FROM "LawDerivative";
DROP TABLE "LawDerivative";
ALTER TABLE "new_LawDerivative" RENAME TO "LawDerivative";
CREATE INDEX "LawDerivative_verificationStatus_idx" ON "LawDerivative"("verificationStatus");
CREATE INDEX "LawDerivative_batchId_idx" ON "LawDerivative"("batchId");
CREATE INDEX "LawDerivative_userId_idx" ON "LawDerivative"("userId");
CREATE TABLE "new_LawAiCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "promptHash" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" REAL NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "status" TEXT NOT NULL,
    "validation" TEXT,
    "jobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER,
    CONSTRAINT "LawAiCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LawAiCall" ("userId", "createdAt", "estimatedCostUsd", "id", "jobId", "latencyMs", "model", "promptHash", "provider", "purpose", "status", "tokensIn", "tokensOut", "updatedAt", "validation") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "createdAt", "estimatedCostUsd", "id", "jobId", "latencyMs", "model", "promptHash", "provider", "purpose", "status", "tokensIn", "tokensOut", "updatedAt", "validation" FROM "LawAiCall";
DROP TABLE "LawAiCall";
ALTER TABLE "new_LawAiCall" RENAME TO "LawAiCall";
CREATE INDEX "LawAiCall_provider_createdAt_idx" ON "LawAiCall"("provider", "createdAt");
CREATE INDEX "LawAiCall_jobId_idx" ON "LawAiCall"("jobId");
CREATE INDEX "LawAiCall_userId_idx" ON "LawAiCall"("userId");
CREATE TABLE "new_LawNoteAtom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT NOT NULL,
    "sessionId" TEXT,
    "provenance" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "headingPath" TEXT NOT NULL DEFAULT '[]',
    "sourceAssetId" TEXT,
    "sourceTimestampSec" REAL,
    "sourcePage" INTEGER,
    "articleVersionId" TEXT,
    "decisionId" TEXT,
    "doctrineRefId" TEXT,
    "examRelevant" BOOLEAN NOT NULL DEFAULT true,
    "profEmphasis" BOOLEAN NOT NULL DEFAULT false,
    "profDivergent" BOOLEAN NOT NULL DEFAULT false,
    "mentionBridge" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "fromDerivativeId" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawNoteAtom_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawNoteAtom" ("userId", "articleVersionId", "body", "createdAt", "decisionId", "deletedAt", "doctrineRefId", "examRelevant", "fromDerivativeId", "headingPath", "id", "mentionBridge", "profDivergent", "profEmphasis", "provenance", "sessionId", "sourceAssetId", "sourcePage", "sourceTimestampSec", "subjectId", "tags", "updatedAt", "verificationStatus") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "articleVersionId", "body", "createdAt", "decisionId", "deletedAt", "doctrineRefId", "examRelevant", "fromDerivativeId", "headingPath", "id", "mentionBridge", "profDivergent", "profEmphasis", "provenance", "sessionId", "sourceAssetId", "sourcePage", "sourceTimestampSec", "subjectId", "tags", "updatedAt", "verificationStatus" FROM "LawNoteAtom";
DROP TABLE "LawNoteAtom";
ALTER TABLE "new_LawNoteAtom" RENAME TO "LawNoteAtom";
CREATE INDEX "LawNoteAtom_subjectId_provenance_idx" ON "LawNoteAtom"("subjectId", "provenance");
CREATE INDEX "LawNoteAtom_sessionId_idx" ON "LawNoteAtom"("sessionId");
CREATE INDEX "LawNoteAtom_userId_idx" ON "LawNoteAtom"("userId");
CREATE TABLE "new_LawStreak" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "current" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "freezesAvailable" INTEGER NOT NULL DEFAULT 0,
    "freezesEarnedTotal" INTEGER NOT NULL DEFAULT 0,
    "weeklyTargetMinutes" INTEGER NOT NULL DEFAULT 140,
    "lastComputedDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawStreak" ("userId", "createdAt", "current", "freezesAvailable", "freezesEarnedTotal", "id", "lastComputedDate", "longest", "updatedAt", "weeklyTargetMinutes") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "createdAt", "current", "freezesAvailable", "freezesEarnedTotal", lower(hex(randomblob(12))), "lastComputedDate", "longest", "updatedAt", "weeklyTargetMinutes" FROM "LawStreak";
DROP TABLE "LawStreak";
ALTER TABLE "new_LawStreak" RENAME TO "LawStreak";
CREATE UNIQUE INDEX "LawStreak_userId_key" ON "LawStreak"("userId");
CREATE TABLE "new_LawDoctrineRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author" TEXT NOT NULL,
    "work" TEXT NOT NULL,
    "edition" TEXT,
    "year" INTEGER,
    "page" TEXT,
    "paraphrase" TEXT NOT NULL,
    "shortQuote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawDoctrineRef_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawDoctrineRef" ("userId", "author", "createdAt", "edition", "id", "page", "paraphrase", "shortQuote", "updatedAt", "work", "year") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "author", "createdAt", "edition", "id", "page", "paraphrase", "shortQuote", "updatedAt", "work", "year" FROM "LawDoctrineRef";
DROP TABLE "LawDoctrineRef";
ALTER TABLE "new_LawDoctrineRef" RENAME TO "LawDoctrineRef";
CREATE INDEX "LawDoctrineRef_userId_idx" ON "LawDoctrineRef"("userId");
CREATE TABLE "new_LawUpload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientCaptureId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "batchId" TEXT,
    "orderInBatch" INTEGER NOT NULL DEFAULT 0,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "chunkSize" INTEGER NOT NULL,
    "chunkCount" INTEGER NOT NULL,
    "receivedChunks" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawUpload" ("userId", "batchId", "bytes", "chunkCount", "chunkSize", "clientCaptureId", "createdAt", "expiresAt", "id", "kind", "meta", "mime", "orderInBatch", "receivedChunks", "sha256", "status", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "batchId", "bytes", "chunkCount", "chunkSize", "clientCaptureId", "createdAt", "expiresAt", "id", "kind", "meta", "mime", "orderInBatch", "receivedChunks", "sha256", "status", "updatedAt" FROM "LawUpload";
DROP TABLE "LawUpload";
ALTER TABLE "new_LawUpload" RENAME TO "LawUpload";
CREATE INDEX "LawUpload_expiresAt_idx" ON "LawUpload"("expiresAt");
CREATE INDEX "LawUpload_userId_idx" ON "LawUpload"("userId");
CREATE UNIQUE INDEX "LawUpload_userId_clientCaptureId_key" ON "LawUpload"("userId", "clientCaptureId");
CREATE TABLE "new_LawFlashcard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'basic',
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "noteAtomId" TEXT,
    "canonicalIds" TEXT NOT NULL DEFAULT '[]',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" REAL NOT NULL DEFAULT 0,
    "difficulty" REAL NOT NULL DEFAULT 0,
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'new',
    "lastReview" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawFlashcard_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "LawSubject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawFlashcard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawFlashcard" ("userId", "back", "canonicalIds", "createdAt", "deletedAt", "difficulty", "due", "elapsedDays", "front", "id", "lapses", "lastReview", "learningSteps", "noteAtomId", "origin", "reps", "scheduledDays", "stability", "state", "subjectId", "suspended", "type", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "back", "canonicalIds", "createdAt", "deletedAt", "difficulty", "due", "elapsedDays", "front", "id", "lapses", "lastReview", "learningSteps", "noteAtomId", "origin", "reps", "scheduledDays", "stability", "state", "subjectId", "suspended", "type", "updatedAt" FROM "LawFlashcard";
DROP TABLE "LawFlashcard";
ALTER TABLE "new_LawFlashcard" RENAME TO "LawFlashcard";
CREATE INDEX "LawFlashcard_subjectId_due_idx" ON "LawFlashcard"("subjectId", "due");
CREATE INDEX "LawFlashcard_due_idx" ON "LawFlashcard"("due");
CREATE INDEX "LawFlashcard_userId_idx" ON "LawFlashcard"("userId");
CREATE TABLE "new_LawReviewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewedAt" DATETIME NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "stateBefore" TEXT NOT NULL,
    "deviceId" TEXT,
    "clientReviewId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawReviewLog_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "LawFlashcard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawReviewLog" ("userId", "cardId", "clientReviewId", "createdAt", "deviceId", "durationMs", "id", "rating", "reviewedAt", "stateBefore", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "cardId", "clientReviewId", "createdAt", "deviceId", "durationMs", "id", "rating", "reviewedAt", "stateBefore", "updatedAt" FROM "LawReviewLog";
DROP TABLE "LawReviewLog";
ALTER TABLE "new_LawReviewLog" RENAME TO "LawReviewLog";
CREATE UNIQUE INDEX "LawReviewLog_clientReviewId_key" ON "LawReviewLog"("clientReviewId");
CREATE INDEX "LawReviewLog_cardId_reviewedAt_idx" ON "LawReviewLog"("cardId", "reviewedAt");
CREATE INDEX "LawReviewLog_reviewedAt_idx" ON "LawReviewLog"("reviewedAt");
CREATE INDEX "LawReviewLog_userId_idx" ON "LawReviewLog"("userId");
CREATE TABLE "new_LawWeeklyRecap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawWeeklyRecap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawWeeklyRecap" ("userId", "content", "createdAt", "generatedAt", "id", "updatedAt", "viewedAt", "weekStart") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "content", "createdAt", "generatedAt", "id", "updatedAt", "viewedAt", "weekStart" FROM "LawWeeklyRecap";
DROP TABLE "LawWeeklyRecap";
ALTER TABLE "new_LawWeeklyRecap" RENAME TO "LawWeeklyRecap";
CREATE INDEX "LawWeeklyRecap_userId_idx" ON "LawWeeklyRecap"("userId");
CREATE UNIQUE INDEX "LawWeeklyRecap_userId_weekStart_key" ON "LawWeeklyRecap"("userId", "weekStart");
CREATE TABLE "new_LawCaseExercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT,
    "title" TEXT NOT NULL,
    "factsAr" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'self_written',
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "targetQualifications" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawCaseExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawCaseExercise" ("userId", "createdAt", "difficulty", "factsAr", "id", "source", "subjectId", "targetQualifications", "title", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "createdAt", "difficulty", "factsAr", "id", "source", "subjectId", "targetQualifications", "title", "updatedAt" FROM "LawCaseExercise";
DROP TABLE "LawCaseExercise";
ALTER TABLE "new_LawCaseExercise" RENAME TO "LawCaseExercise";
CREATE INDEX "LawCaseExercise_userId_idx" ON "LawCaseExercise"("userId");
CREATE TABLE "new_LawSubject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameFr" TEXT,
    "code" TEXT,
    "semester" TEXT NOT NULL DEFAULT 'S3',
    "professorName" TEXT,
    "professorNotes" TEXT,
    "examDate" DATETIME,
    "examFormat" TEXT,
    "dissertationRules" TEXT,
    "coursePlan" TEXT,
    "color" TEXT NOT NULL DEFAULT '#0f2a3f',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "anythingllmWorkspaceId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawSubject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawSubject" ("userId", "anythingllmWorkspaceId", "archived", "code", "color", "coursePlan", "createdAt", "dissertationRules", "examDate", "examFormat", "id", "name", "nameFr", "professorName", "professorNotes", "semester", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "anythingllmWorkspaceId", "archived", "code", "color", "coursePlan", "createdAt", "dissertationRules", "examDate", "examFormat", "id", "name", "nameFr", "professorName", "professorNotes", "semester", "updatedAt" FROM "LawSubject";
DROP TABLE "LawSubject";
ALTER TABLE "new_LawSubject" RENAME TO "LawSubject";
CREATE INDEX "LawSubject_userId_idx" ON "LawSubject"("userId");
CREATE TABLE "new_LawClassSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT NOT NULL,
    "slotId" TEXT,
    "date" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'captured',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawClassSession_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "LawSubject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawClassSession_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "LawTimetableSlot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LawClassSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawClassSession" ("userId", "createdAt", "date", "id", "slotId", "status", "subjectId", "title", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "createdAt", "date", "id", "slotId", "status", "subjectId", "title", "updatedAt" FROM "LawClassSession";
DROP TABLE "LawClassSession";
ALTER TABLE "new_LawClassSession" RENAME TO "LawClassSession";
CREATE INDEX "LawClassSession_subjectId_date_idx" ON "LawClassSession"("subjectId", "date");
CREATE INDEX "LawClassSession_userId_idx" ON "LawClassSession"("userId");
CREATE TABLE "new_LawCaseAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exerciseId" TEXT NOT NULL,
    "timed" BOOLEAN NOT NULL DEFAULT false,
    "timeLimitSec" INTEGER,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" INTEGER,
    "phases" TEXT NOT NULL DEFAULT '{}',
    "submittedAt" DATETIME,
    "critique" TEXT,
    "rubricScores" TEXT,
    "citationCheck" TEXT,
    "suggestedCards" TEXT,
    "modelAnswer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawCaseAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "LawCaseExercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawCaseAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawCaseAttempt" ("userId", "citationCheck", "createdAt", "critique", "durationSec", "exerciseId", "id", "modelAnswer", "phases", "rubricScores", "startedAt", "status", "submittedAt", "suggestedCards", "timeLimitSec", "timed", "updatedAt") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "citationCheck", "createdAt", "critique", "durationSec", "exerciseId", "id", "modelAnswer", "phases", "rubricScores", "startedAt", "status", "submittedAt", "suggestedCards", "timeLimitSec", "timed", "updatedAt" FROM "LawCaseAttempt";
DROP TABLE "LawCaseAttempt";
ALTER TABLE "new_LawCaseAttempt" RENAME TO "LawCaseAttempt";
CREATE INDEX "LawCaseAttempt_exerciseId_idx" ON "LawCaseAttempt"("exerciseId");
CREATE INDEX "LawCaseAttempt_userId_idx" ON "LawCaseAttempt"("userId");
CREATE TABLE "new_LawDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "userAgent" TEXT,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "LawDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LawDevice" ("userId", "createdAt", "id", "lastSeenAt", "name", "updatedAt", "userAgent") SELECT (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1), "createdAt", "id", "lastSeenAt", "name", "updatedAt", "userAgent" FROM "LawDevice";
DROP TABLE "LawDevice";
ALTER TABLE "new_LawDevice" RENAME TO "LawDevice";
CREATE INDEX "LawDevice_userId_idx" ON "LawDevice"("userId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "LawUserProfile_userId_key" ON "LawUserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LawUserProfile_email_key" ON "LawUserProfile"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LawUserProfile_googleSub_key" ON "LawUserProfile"("googleSub");


-- Study preferences and per-user bookkeeping move to the owner's namespace (models/lawSetting.js).
UPDATE "LawSetting"
  SET "key" = 'u:' || (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1) || ':' || "key"
  WHERE "key" IN ('examLockdownDays', 'newCardsPerDay', 'dailyGoalMinutes', 'desiredRetention', 'weeklyTargetMinutes');
UPDATE "LawSetting"
  SET "key" = 'meta:u:' || (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "id" LIMIT 1) || ':timetableSeeded'
  WHERE "key" = 'meta:timetableSeeded';
