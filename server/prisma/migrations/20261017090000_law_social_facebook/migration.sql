-- AlterTable
ALTER TABLE "LawUserProfile" ADD COLUMN "facebookId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LawUserProfile_facebookId_key" ON "LawUserProfile"("facebookId");
