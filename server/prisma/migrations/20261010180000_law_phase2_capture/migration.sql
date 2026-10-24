-- CreateTable
CREATE TABLE "LawAsset" (
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
    CONSTRAINT "LawAsset_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LawCaptureBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawCaptureBatch" (
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawUpload" (
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawJob" (
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawDerivative" (
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
    CONSTRAINT "LawDerivative_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "LawAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawDerivative_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LawCaptureBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LawAsset_sha256_key" ON "LawAsset"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "LawAsset_clientCaptureId_key" ON "LawAsset"("clientCaptureId");

-- CreateIndex
CREATE INDEX "LawAsset_batchId_orderInBatch_idx" ON "LawAsset"("batchId", "orderInBatch");

-- CreateIndex
CREATE INDEX "LawAsset_sessionId_idx" ON "LawAsset"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "LawCaptureBatch_clientBatchId_key" ON "LawCaptureBatch"("clientBatchId");

-- CreateIndex
CREATE INDEX "LawCaptureBatch_status_idx" ON "LawCaptureBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LawUpload_clientCaptureId_key" ON "LawUpload"("clientCaptureId");

-- CreateIndex
CREATE INDEX "LawUpload_expiresAt_idx" ON "LawUpload"("expiresAt");

-- CreateIndex
CREATE INDEX "LawJob_status_runAfter_priority_idx" ON "LawJob"("status", "runAfter", "priority");

-- CreateIndex
CREATE INDEX "LawJob_type_idx" ON "LawJob"("type");

-- CreateIndex
CREATE INDEX "LawDerivative_verificationStatus_idx" ON "LawDerivative"("verificationStatus");

-- CreateIndex
CREATE INDEX "LawDerivative_batchId_idx" ON "LawDerivative"("batchId");

