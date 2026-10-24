-- CreateTable
CREATE TABLE "LawFollow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "followerId" INTEGER NOT NULL,
    "followeeId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    CONSTRAINT "LawFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawFollow_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawBlock" (
    "blockerId" INTEGER NOT NULL,
    "blockedId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("blockerId", "blockedId")
);

-- CreateTable
CREATE TABLE "LawPhoneHash" (
    "userId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" TEXT NOT NULL,
    "consentAt" DATETIME NOT NULL,
    CONSTRAINT "LawPhoneHash_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LawFollow_followeeId_status_idx" ON "LawFollow"("followeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LawFollow_followerId_followeeId_key" ON "LawFollow"("followerId", "followeeId");

-- CreateIndex
CREATE INDEX "LawBlock_blockedId_idx" ON "LawBlock"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "LawPhoneHash_hash_key" ON "LawPhoneHash"("hash");

-- CreateIndex
CREATE INDEX "LawNotification_userId_readAt_idx" ON "LawNotification"("userId", "readAt");

