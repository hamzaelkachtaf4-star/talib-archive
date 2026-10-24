-- CreateTable
CREATE TABLE "LawTodo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "refType" TEXT,
    "refId" TEXT,
    "dueDate" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawTodo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LawTodo_userId_dueDate_idx" ON "LawTodo"("userId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "LawTodo_userId_clientId_key" ON "LawTodo"("userId", "clientId");
