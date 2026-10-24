-- RC4: priority tag on the daily to-do list (high / medium / normal)
ALTER TABLE "LawTodo" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal';
