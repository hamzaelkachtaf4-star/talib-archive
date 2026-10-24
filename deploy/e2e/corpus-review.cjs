// Phase 3 acceptance in a real browser: import (pasted, SYNTHETIC text) → review → confirm one article →
// commit → search "الفصل ٧٧" (Arabic-Indic digits, with diacritics) → article reader shows the verified
// badge only for the confirmed article. Everything it created is deleted from the DB afterwards and the
// FTS index rebuilt, so no synthetic text stays in the corpus.
//
//   CHROME_BIN=... node deploy/e2e/corpus-review.cjs collector/node_modules/puppeteer http://localhost:3001 server/storage/anythingllm.db
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs"); // Qanouni: every run signs in
const DB_FILE = path.resolve(process.argv[4] || "server/storage/anythingllm.db");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MARK = `e2e-${Date.now()}`;
const TEXT = [`الفصل 77`, `نص تجريبي ${MARK} للاختبار الآلي فقط وليس نصا قانونيا.`, `الفصل 78`, `نص تجريبي ثان ${MARK}.`].join("\n");

const clickText = (page, text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("button, a")].find((b) => b.innerText.trim().startsWith(t));
    if (!el) throw new Error(`no button: ${t}`);
    el.click();
  }, text);

function cleanup(importId) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(DB_FILE);
  const imp = db.prepare('SELECT "sourceDocumentId" FROM "LawCorpusImport" WHERE id = ?').get(importId);
  const articleIds = db.prepare('SELECT DISTINCT "articleId" AS id FROM "LawArticleVersion" WHERE "importId" = ?').all(importId).map((r) => r.id);
  db.prepare('DELETE FROM "LawArticleVersion" WHERE "importId" = ?').run(importId);
  for (const id of articleIds) {
    const left = db.prepare('SELECT COUNT(*) AS n FROM "LawArticleVersion" WHERE "articleId" = ?').get(id).n;
    if (!left) db.prepare('DELETE FROM "LawArticle" WHERE id = ?').run(id);
  }
  db.prepare('DELETE FROM "LawCorpusImport" WHERE id = ?').run(importId);
  if (imp?.sourceDocumentId) db.prepare('DELETE FROM "LawSourceDocument" WHERE id = ?').run(imp.sourceDocumentId);
  db.close();
}

(async () => {
  await session.init(BASE);
  const results = {};
  let importId = null;
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined, userDataDir: process.env.PROFILE_DIR || undefined });
  const page = await browser.newPage();
  await session.attach(page);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${BASE}/law/corpus?tab=import`, { waitUntil: "networkidle0" });
    await page.waitForSelector("textarea");
    await page.select("select", "DOC");
    await page.evaluate(() => {
      const d = document.querySelector('input[type="date"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(d, "1913-08-12");
      d.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.evaluate((t) => {
      const ta = document.querySelector("textarea");
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, t);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }, TEXT);
    await clickText(page, "بدء المراجعة");
    await page.waitForFunction(() => location.pathname.startsWith("/law/corpus/import/"), { timeout: 15000 });
    importId = page.url().split("/").pop();
    await page.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]').length === 2, { timeout: 15000 });
    results.parsedArticles = 2;
    // Confirm only the first article (الفصل 77).
    await page.evaluate(() => document.querySelectorAll('input[type="checkbox"]')[0].click());
    await clickText(page, "إدراج");
    await page.waitForFunction(() => document.body.innerText.includes("أُدرج:"), { timeout: 15000 });
    results.commitMessage = await page.evaluate(() => [...document.querySelectorAll("p")].find((p) => p.innerText.includes("أُدرج:")).innerText);

    await page.goto(`${BASE}/law/corpus`, { waitUntil: "networkidle0" });
    await page.type("input", "الفَصْلُ ٧٧");
    await page.waitForFunction(() => [...document.querySelectorAll("a")].some((a) => a.href.includes("DOC%3A77")), { timeout: 15000 });
    results.searchFound = "DOC:77";
    await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.href.includes("DOC%3A77")).click());
    // The marker is also on the results page: wait for the article page itself before checking badges.
    await page.waitForFunction(() => location.pathname.startsWith("/law/corpus/a/"), { timeout: 15000 });
    await page.waitForFunction((m) => document.body.innerText.includes(m), { timeout: 15000 }, MARK);
    results.reader77Verified = await page.evaluate(() => document.body.innerText.includes("مُتحقق منه") && !document.body.innerText.includes("غير مُتحقق منه"));
    await page.screenshot({ path: path.join(process.env.SHOT_DIR || ".", "p3-reader.png") });

    await page.goto(`${BASE}/law/corpus/a/DOC%3A78`, { waitUntil: "networkidle0" });
    await page.waitForFunction((m) => document.body.innerText.includes(m), { timeout: 15000 }, MARK);
    results.reader78Unverified = await page.evaluate(() => document.body.innerText.includes("غير مُتحقق منه"));
    if (!results.reader77Verified || !results.reader78Unverified) throw new Error("verification badges wrong");

    console.log(JSON.stringify(results, null, 2));
    console.log("PASS");
  } catch (e) {
    console.error("FAIL:", e.message, JSON.stringify(results));
    console.error("page:", (await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 600));
    process.exitCode = 1;
  } finally {
    await browser.close();
    if (importId) {
      cleanup(importId);
      await fetch(`${BASE}/api/law/admin/rebuild-index`, { method: "POST" }).catch(() => {});
    }
  }
})();
