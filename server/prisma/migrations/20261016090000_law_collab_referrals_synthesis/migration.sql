-- AlterTable
ALTER TABLE "LawUserProfile" ADD COLUMN "referralCode" TEXT;

-- CreateTable
CREATE TABLE "LawReferral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrerId" INTEGER NOT NULL,
    "referredUserId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "activatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawReferral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawReferral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawSessionSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawSessionSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "LawModuleWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawSessionSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LawReferral_referredUserId_key" ON "LawReferral"("referredUserId");

-- CreateIndex
CREATE INDEX "LawReferral_referrerId_status_idx" ON "LawReferral"("referrerId", "status");

-- CreateIndex
CREATE INDEX "LawReferral_code_idx" ON "LawReferral"("code");

-- CreateIndex
CREATE INDEX "LawSessionSource_workspaceId_sessionNumber_idx" ON "LawSessionSource"("workspaceId", "sessionNumber");

-- CreateIndex
CREATE INDEX "LawSessionSource_userId_idx" ON "LawSessionSource"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LawUserProfile_referralCode_key" ON "LawUserProfile"("referralCode");

