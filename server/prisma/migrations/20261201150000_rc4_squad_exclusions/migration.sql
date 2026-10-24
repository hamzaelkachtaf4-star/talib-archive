-- RC4: removed members cannot rejoin a public group through the listing
CREATE TABLE "LawSquadExclusion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "squadId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawSquadExclusion_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "LawSquad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LawSquadExclusion_squadId_userId_key" ON "LawSquadExclusion"("squadId", "userId");
