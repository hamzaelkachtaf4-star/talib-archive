-- Talib v3 settings: a notification category for the forum and the reading groups (replies, shared documents, edit requests).
ALTER TABLE "LawUserPreferences" ADD COLUMN "notifyForum" BOOLEAN NOT NULL DEFAULT true;
