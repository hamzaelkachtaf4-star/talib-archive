-- AlterTable
ALTER TABLE "LawUserProfile" ADD COLUMN "friendCode" TEXT;

-- CreateTable
CREATE TABLE "LawEmailCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purpose" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "payload" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastSentAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawQrLogin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "pollSecretHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userId" INTEGER,
    "requesterAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LawFriendship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterId" INTEGER NOT NULL,
    "addresseeId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawFriendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawFriendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LawEmailCode_purpose_email_key" ON "LawEmailCode"("purpose", "email");

-- CreateIndex
CREATE UNIQUE INDEX "LawQrLogin_tokenHash_key" ON "LawQrLogin"("tokenHash");

-- CreateIndex
CREATE INDEX "LawQrLogin_expiresAt_idx" ON "LawQrLogin"("expiresAt");

-- CreateIndex
CREATE INDEX "LawFriendship_addresseeId_idx" ON "LawFriendship"("addresseeId");

-- CreateIndex
CREATE UNIQUE INDEX "LawFriendship_requesterId_addresseeId_key" ON "LawFriendship"("requesterId", "addresseeId");

-- CreateIndex
CREATE UNIQUE INDEX "LawUserProfile_friendCode_key" ON "LawUserProfile"("friendCode");

