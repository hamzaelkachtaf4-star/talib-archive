-- AlterTable (a plain ADD COLUMN: no table rebuild needed for a NOT NULL column with a default)
ALTER TABLE "LawExamDate" ADD COLUMN "hasTime" BOOLEAN NOT NULL DEFAULT true;
