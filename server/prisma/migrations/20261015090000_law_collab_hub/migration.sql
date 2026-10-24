-- CreateTable
CREATE TABLE "LawEndorsement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawEndorsement_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "LawMasterNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawEndorsement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Added in place (no table rebuild)
ALTER TABLE "LawUserProfile" ADD COLUMN "publicProfile" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LawMasterNote" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'squad';
ALTER TABLE "LawMasterNote" ADD COLUMN "publishedAt" DATETIME;
ALTER TABLE "LawMasterNote" ADD COLUMN "forkedFromId" TEXT REFERENCES "LawMasterNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LawMasterNote" ADD COLUMN "forkedFromAuthorName" TEXT;

-- CreateIndex
CREATE INDEX "LawMasterNote_visibility_idx" ON "LawMasterNote"("visibility");

-- CreateIndex
CREATE INDEX "LawMasterNote_forkedFromId_idx" ON "LawMasterNote"("forkedFromId");

-- CreateIndex
CREATE INDEX "LawEndorsement_userId_idx" ON "LawEndorsement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LawEndorsement_noteId_userId_key" ON "LawEndorsement"("noteId", "userId");
