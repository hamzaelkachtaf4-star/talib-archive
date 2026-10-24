-- RC4: article bookmarks and article-to-module links
CREATE TABLE "LawArticleBookmark" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawArticleBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LawArticleBookmark_userId_canonicalId_key" ON "LawArticleBookmark"("userId", "canonicalId");
CREATE INDEX "LawArticleBookmark_userId_createdAt_idx" ON "LawArticleBookmark"("userId", "createdAt");

CREATE TABLE "LawModuleArticle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "moduleId" TEXT NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LawModuleArticle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawModuleArticle_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LawCourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LawModuleArticle_userId_moduleId_canonicalId_key" ON "LawModuleArticle"("userId", "moduleId", "canonicalId");
CREATE INDEX "LawModuleArticle_userId_moduleId_idx" ON "LawModuleArticle"("userId", "moduleId");
