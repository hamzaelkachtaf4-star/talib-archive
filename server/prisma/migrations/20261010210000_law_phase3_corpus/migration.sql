-- CreateTable
CREATE TABLE "LawSourceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "origin" TEXT NOT NULL,
    "url" TEXT,
    "retrievedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sha256" TEXT,
    "storagePath" TEXT,
    "assetId" TEXT,
    "title" TEXT,
    "boNumber" TEXT,
    "boDate" DATETIME,
    "parseStatus" TEXT NOT NULL DEFAULT 'pending',
    "parseNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleFr" TEXT,
    "lawNumber" TEXT,
    "dahirRef" TEXT,
    "originalBoRef" TEXT,
    "numberingLabel" TEXT NOT NULL DEFAULT 'المادة',
    "status" TEXT NOT NULL DEFAULT 'in_force',
    "inForceFrom" DATETIME,
    "inForceTo" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codeId" TEXT NOT NULL,
    "articleNumber" TEXT NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "headingPath" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawArticle_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "LawCode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawArticleVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "textAr" TEXT NOT NULL,
    "textFr" TEXT,
    "textNormalized" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME,
    "amendedByLaw" TEXT,
    "amendedByBoRef" TEXT,
    "sourceDocumentId" TEXT,
    "importId" TEXT,
    "checksum" TEXT NOT NULL,
    "verifiedByUser" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "LawArticle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawArticleVersion_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "LawSourceDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawCorpusImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codeId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "validFrom" DATETIME NOT NULL,
    "amendedByLaw" TEXT,
    "amendedByBoRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'parsing',
    "rawText" TEXT,
    "articles" TEXT NOT NULL DEFAULT '[]',
    "warnings" TEXT NOT NULL DEFAULT '[]',
    "committedAt" DATETIME,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LawCorpusImport_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "LawCode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LawCorpusImport_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "LawSourceDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LawDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "court" TEXT NOT NULL DEFAULT 'محكمة النقض',
    "decisionNumber" TEXT NOT NULL,
    "decisionDate" DATETIME NOT NULL,
    "chamber" TEXT,
    "fileNumber" TEXT,
    "subjectMatter" TEXT,
    "principle" TEXT,
    "fullTextAr" TEXT,
    "sourceUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawDoctrineRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author" TEXT NOT NULL,
    "work" TEXT NOT NULL,
    "edition" TEXT,
    "year" INTEGER,
    "page" TEXT,
    "paraphrase" TEXT NOT NULL,
    "shortQuote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LawLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "LawSourceDocument_sha256_idx" ON "LawSourceDocument"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "LawCode_slug_key" ON "LawCode"("slug");

-- CreateIndex
CREATE INDEX "LawCode_family_idx" ON "LawCode"("family");

-- CreateIndex
CREATE UNIQUE INDEX "LawArticle_canonicalId_key" ON "LawArticle"("canonicalId");

-- CreateIndex
CREATE INDEX "LawArticle_codeId_articleNumber_idx" ON "LawArticle"("codeId", "articleNumber");

-- CreateIndex
CREATE INDEX "LawArticleVersion_articleId_validFrom_idx" ON "LawArticleVersion"("articleId", "validFrom");

-- CreateIndex
CREATE INDEX "LawCorpusImport_status_idx" ON "LawCorpusImport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LawDecision_court_decisionNumber_decisionDate_key" ON "LawDecision"("court", "decisionNumber", "decisionDate");

-- CreateIndex
CREATE INDEX "LawLink_toType_toId_idx" ON "LawLink"("toType", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "LawLink_fromType_fromId_toType_toId_relation_key" ON "LawLink"("fromType", "fromId", "toType", "toId", "relation");

