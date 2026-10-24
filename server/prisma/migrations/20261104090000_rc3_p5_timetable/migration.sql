-- AlterTable
ALTER TABLE "LawTimetableSlot" ADD COLUMN "groupLabel" TEXT;
ALTER TABLE "LawTimetableSlot" ADD COLUMN "moduleId" TEXT;
ALTER TABLE "LawTimetableSlot" ADD COLUMN "professor" TEXT;

-- CreateTable
CREATE TABLE "LawReminderPref" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "eveningBefore" BOOLEAN NOT NULL DEFAULT true,
    "minutesBefore" INTEGER,
    "lastEveningFor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawReminderPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LawReminderPref_userId_key" ON "LawReminderPref"("userId");
