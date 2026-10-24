-- CreateTable
CREATE TABLE "LawReformEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'MA',
    "status" TEXT NOT NULL,
    "lawNumber" TEXT,
    "boRef" TEXT,
    "publishedAt" DATETIME,
    "inForceAt" DATETIME,
    "affectedArticleIds" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "summaryVerified" BOOLEAN NOT NULL DEFAULT false,
    "sourceDocumentIds" TEXT NOT NULL DEFAULT '[]',
    "seedKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawWeeklyRecap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawPushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "keys" TEXT NOT NULL,
    "deviceId" TEXT,
    "lastSuccessAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "LawReformEvent_seedKey_key" ON "LawReformEvent"("seedKey");

-- CreateIndex
CREATE UNIQUE INDEX "LawWeeklyRecap_weekStart_key" ON "LawWeeklyRecap"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "LawPushSubscription_endpoint_key" ON "LawPushSubscription"("endpoint");

