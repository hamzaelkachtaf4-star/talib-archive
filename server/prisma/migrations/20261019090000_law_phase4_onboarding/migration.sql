-- CreateTable
CREATE TABLE "LawFaculty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "LawFaculty_code_key" ON "LawFaculty"("code");

-- AlterTable (additive)
ALTER TABLE "LawUserProfile" ADD COLUMN "onboardingDraft" TEXT;
ALTER TABLE "LawUserProfile" ADD COLUMN "facultyCode" TEXT;
ALTER TABLE "LawUserProfile" ADD COLUMN "track" TEXT;
ALTER TABLE "LawUserProfile" ADD COLUMN "studyLang" TEXT;
ALTER TABLE "LawUserProfile" ADD COLUMN "examTrack" TEXT;

-- Existing students already use the app: they must not be forced through the full wizard.
UPDATE "LawUserProfile" SET "onboardingCompletedAt" = "createdAt" WHERE "onboardingCompletedAt" IS NULL;
