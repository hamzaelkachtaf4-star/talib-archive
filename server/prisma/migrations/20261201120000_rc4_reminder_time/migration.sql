-- RC4: the evening reminder time is the student's choice (default 20:00)
ALTER TABLE "LawReminderPref" ADD COLUMN "eveningTime" TEXT NOT NULL DEFAULT '20:00';
