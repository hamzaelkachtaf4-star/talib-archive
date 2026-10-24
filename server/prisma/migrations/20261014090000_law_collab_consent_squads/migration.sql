-- CreateTable
CREATE TABLE "LawUserConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "academicNotice" BOOLEAN NOT NULL DEFAULT false,
    "privacyAccepted" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "acceptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "LawUserConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawSquad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cohortTag" TEXT NOT NULL DEFAULT 'FSJES-AinChock-S3-DP-G01',
    "inviteCode" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LawSquadMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "squadId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'contributor',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawSquadMember_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "LawSquad" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawSquadMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawModuleWorkspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "squadId" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "professorName" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL DEFAULT '2026/2027',
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawModuleWorkspace_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "LawSquad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawMasterNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "planJson" TEXT,
    "sourcePins" TEXT,
    "contributors" TEXT,
    "sectionAuthors" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawMasterNote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "LawModuleWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawSquadCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "canonicalIds" TEXT NOT NULL DEFAULT '[]',
    "createdById" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawSquadCard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "LawModuleWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Added in place (no table rebuild: existing profiles and flashcards are untouched)
ALTER TABLE "LawUserProfile" ADD COLUMN "faculty" TEXT NOT NULL DEFAULT 'FSJES Ain Chock';
ALTER TABLE "LawUserProfile" ADD COLUMN "semester" TEXT NOT NULL DEFAULT 'S3';
ALTER TABLE "LawUserProfile" ADD COLUMN "filiere" TEXT NOT NULL DEFAULT 'Droit Privé / القانون الخاص';
ALTER TABLE "LawUserProfile" ADD COLUMN "languageSection" TEXT NOT NULL DEFAULT 'Section Arabe / الفوج العربي';
ALTER TABLE "LawUserProfile" ADD COLUMN "tdGroup" TEXT NOT NULL DEFAULT 'G01';
ALTER TABLE "LawFlashcard" ADD COLUMN "squadCardId" TEXT REFERENCES "LawSquadCard" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "LawUserConsent_userId_key" ON "LawUserConsent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LawSquad_inviteCode_key" ON "LawSquad"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "LawSquadMember_userId_key" ON "LawSquadMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LawSquadMember_squadId_userId_key" ON "LawSquadMember"("squadId", "userId");

-- CreateIndex
CREATE INDEX "LawModuleWorkspace_squadId_idx" ON "LawModuleWorkspace"("squadId");

-- CreateIndex
CREATE UNIQUE INDEX "LawMasterNote_workspaceId_sessionNumber_key" ON "LawMasterNote"("workspaceId", "sessionNumber");

-- CreateIndex
CREATE INDEX "LawSquadCard_workspaceId_idx" ON "LawSquadCard"("workspaceId");


-- CreateIndex
CREATE INDEX "LawFlashcard_squadCardId_idx" ON "LawFlashcard"("squadCardId");
