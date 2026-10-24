-- RC4: work group module, visibility and who publishes
ALTER TABLE "LawSquad" ADD COLUMN "moduleTitle" TEXT;
ALTER TABLE "LawSquad" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';
ALTER TABLE "LawSquad" ADD COLUMN "publishMode" TEXT NOT NULL DEFAULT 'members_propose';
