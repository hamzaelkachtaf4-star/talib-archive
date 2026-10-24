-- CreateTable
CREATE TABLE "LawUserPreferences" (
    "userId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "animationsOn" BOOLEAN NOT NULL DEFAULT true,
    "notifyFriends" BOOLEAN NOT NULL DEFAULT true,
    "notifyHub" BOOLEAN NOT NULL DEFAULT true,
    "notifyReminders" BOOLEAN NOT NULL DEFAULT true,
    "reminderTime" TEXT,
    "dailyGoalMin" INTEGER NOT NULL DEFAULT 20,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawUserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (additive: ADD COLUMN keeps every existing row untouched)
ALTER TABLE "LawUserProfile" ADD COLUMN "handle" TEXT;
ALTER TABLE "LawUserProfile" ADD COLUMN "avatarConfig" TEXT;
ALTER TABLE "LawUserProfile" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LawUserProfile" ADD COLUMN "discoverable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LawUserProfile" ADD COLUMN "onboardingCompletedAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "LawUserProfile_handle_key" ON "LawUserProfile"("handle");
