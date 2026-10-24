-- RC4: module recap counters
ALTER TABLE "LawModuleProfile" ADD COLUMN "sessionsAttended" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LawModuleProfile" ADD COLUMN "comprehension" INTEGER;
