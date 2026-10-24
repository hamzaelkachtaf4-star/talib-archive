// Phase 3 acceptance (spec §11) on a temp DB + temp FTS index, with SYNTHETIC fixture text only
// (no real statute text is ever written by the agent):
// - "الفصل 77" with or without diacritics, with ٧٧ or 77, returns DOC:77;
// - CPC rules before 24 Aug 2026 come from the 1974 code, after from Law 58.25;
// - no article is marked verified without the student's confirmation.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { db } = require("../../utils/law/dbClient");
const { closeFts } = require("../../utils/law/fts");
const { LawCorpus } = require("../../models/lawCorpus");
const { LawDecision } = require("../../models/lawDecision");
const { LawDoctrine } = require("../../models/lawDoctrine");
const { LawLink } = require("../../models/lawLink");
const { searchArticles } = require("../../utils/law/corpusSearch");

jest.setTimeout(60000);

let tmp;
let storage;
const ENV = process.env;
beforeEach(async () => {
  storage = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-corpus-"));
  process.env = { ...ENV, STORAGE_DIR: storage };
  tmp = await createTempDb();
});
afterEach(async () => {
  closeFts();
  await tmp.cleanup();
  process.env = ENV;
  fs.rmSync(storage, { recursive: true, force: true });
});

const day = (d) => new Date(`${d}T00:00:00Z`);

// Synthetic placeholder text in the shape of a code. NOT real statute text.
const DOC_FIXTURE = [
  "الكتاب الأول: نص تجريبي",
  "الفصل 76",
  "نص تجريبي للفصل السادس والسبعين عن العقد.",
  "الفصل 77",
  "كل فعل ارتكبه الإنسان عن بينة واختيار نص تجريبي للاختبار فقط ويُلزم بالتعويض.",
  "الفصل 78",
  "نص تجريبي عن الفسخ والالتزامات.",
].join("\n");

async function importAndCommit(codeSlug, text, validFrom, { confirm = () => false } = {}) {
  const { import: imp, error } = await LawCorpus.createImport({ codeSlug, validFrom, text });
  expect(error).toBeNull();
  const articles = imp.articles.map((a) => ({ ...a, confirmed: confirm(a) }));
  await LawCorpus.updateImport(imp.id, { articles });
  return LawCorpus.commitImport(imp.id);
}

async function search(q, code = null, atStr = "2026-10-10") {
  const at = day(atStr);
  return searchArticles({ q, codes: await LawCorpus.resolveCodes(code, at), at });
}

describe("search (acceptance)", () => {
  beforeEach(async () => {
    await importAndCommit("DOC", DOC_FIXTURE, "1913-08-12");
    await importAndCommit("CP", "الفصل 77\nنص تجريبي جنائي.", "1962-11-26");
  });

  test.each([["الفصل 77"], ["الفَصْلُ 77"], ["الفصل ٧٧"], ["الفَصْلُ ٧٧"], ["77"], ["٧٧"]])("%s → DOC:77", async (q) => {
    const results = await search(q);
    const ids = results.map((r) => r.canonicalId);
    expect(ids).toContain("DOC:77");
    expect(results.find((r) => r.canonicalId === "DOC:77").tierName).toBe("number");
  });

  test("restricting to DOC gives exactly DOC:77", async () => {
    const results = await search("الفصل ٧٧", "DOC");
    expect(results.map((r) => r.canonicalId)).toEqual(["DOC:77"]);
  });

  test("text search: diacritics, alef forms and light stems all find the article", async () => {
    expect((await search("الإنسان")).map((r) => r.canonicalId)).toContain("DOC:77");
    expect((await search("الانسان")).map((r) => r.canonicalId)).toContain("DOC:77");
    expect((await search("الإنْسَان")).map((r) => r.canonicalId)).toContain("DOC:77");
    const stem = await search("بالتعويض");
    expect(stem.map((r) => r.canonicalId)).toContain("DOC:77");
  });

  test("exact phrase ranks above normalized and stemmed matches", async () => {
    const r = await search("بينة واختيار");
    expect(r[0].canonicalId).toBe("DOC:77");
    expect(r[0].tierName).toBe("exact");
  });

  test("فسخ does not match انفساخ", async () => {
    await importAndCommit("CCOM", "المادة 1\nنص تجريبي عن الانفساخ فقط.", "1996-08-01");
    const r = await search("الفسخ");
    expect(r.map((x) => x.canonicalId)).toContain("DOC:78");
    expect(r.map((x) => x.canonicalId)).not.toContain("CCOM:1");
  });
});

describe("CPC succession at a date (acceptance)", () => {
  beforeEach(async () => {
    await importAndCommit("CPC-1974", "الفصل 32\nنص تجريبي قديم عن المقال الافتتاحي.", "1974-09-28");
    await importAndCommit("CPC-58.25", "المادة 32\nنص تجريبي جديد عن المقال الافتتاحي.", "2026-08-24");
  });

  test("before 24 Aug 2026 → 1974 text; from that day → Law 58.25", async () => {
    const before = await search("المقال الافتتاحي", "CPC", "2026-08-23");
    expect(before.map((r) => r.codeSlug)).toEqual(["CPC-1974"]);
    const after = await search("المقال الافتتاحي", "CPC", "2026-08-24");
    expect(after.map((r) => r.codeSlug)).toEqual(["CPC-58.25"]);
    const later = await search("32", "CPC", "2026-10-10");
    expect(later.map((r) => r.canonicalId)).toEqual(["CPC-58.25:32"]);
  });

  test("an explicit CPC-1974 lookup still works after repeal (transitional files)", async () => {
    const r = await search("32", "CPC-1974", "2026-10-10");
    expect(r.map((x) => x.canonicalId)).toEqual(["CPC-1974:32"]);
    const art = await LawCorpus.article("CPC-1974:32", day("2026-10-10"));
    expect(art.codeInForceAtDate).toBe(false);
    expect(art.current.textAr).toContain("قديم");
  });
});

describe("versioning and verification", () => {
  test("nothing is verified without explicit confirmation", async () => {
    const r = await importAndCommit("DOC", DOC_FIXTURE, "1913-08-12", { confirm: (a) => a.number === "77" });
    expect(r.summary).toEqual({ created: 3, versioned: 0, corrected: 0, unchanged: 0, verified: 1 });
    const versions = await db().lawArticleVersion.findMany({ include: { article: true } });
    expect(Object.fromEntries(versions.map((v) => [v.article.canonicalId, v.verifiedByUser]))).toEqual({
      "DOC:76": false,
      "DOC:77": true,
      "DOC:78": false,
    });
  });

  test("an amendment opens version 2 and closes version 1; unchanged text is a no-op", async () => {
    await importAndCommit("DOC", DOC_FIXTURE, "1913-08-12");
    const amended = DOC_FIXTURE.replace("ويُلزم بالتعويض", "ويُلزم بالتعويض كاملا");
    const r = await importAndCommit("DOC", amended, "2020-01-01");
    expect(r.summary.versioned).toBe(1);
    expect(r.summary.unchanged).toBe(2);
    const old = await LawCorpus.article("DOC:77", day("2019-12-31"));
    const cur = await LawCorpus.article("DOC:77", day("2020-01-01"));
    expect(old.current.textAr).not.toContain("كاملا");
    expect(cur.current.textAr).toContain("كاملا");
    expect(cur.versions).toHaveLength(2);
    expect(cur.versions[0].validTo.toISOString().slice(0, 10)).toBe("2020-01-01");
    // Search at an old date returns the old version.
    const hits = await search("كاملا", "DOC", "2019-06-01");
    expect(hits).toHaveLength(0);
  });

  test("importing an older text afterwards is inserted as history", async () => {
    await importAndCommit("DOC", DOC_FIXTURE, "2000-01-01");
    await importAndCommit("DOC", DOC_FIXTURE.replace("نص تجريبي للاختبار", "نص أقدم"), "1913-08-12");
    const v = await db().lawArticleVersion.findMany({ where: { article: { canonicalId: "DOC:77" } }, orderBy: { validFrom: "asc" } });
    expect(v).toHaveLength(2);
    expect(v[0].validTo.toISOString().slice(0, 10)).toBe("2000-01-01");
    expect(v[1].validTo).toBeNull();
  });

  test("duplicate numbers block the commit until fixed in review", async () => {
    const { import: imp } = await LawCorpus.createImport({ codeSlug: "DOC", validFrom: "1913-08-12", text: "الفصل 1\nأ\nالفصل 1\nب" });
    expect((await LawCorpus.commitImport(imp.id)).error).toMatch(/duplicate/);
    expect(await db().lawArticle.count()).toBe(0);
  });

  test("resolve: existing, unknown and malformed ids", async () => {
    await importAndCommit("DOC", DOC_FIXTURE, "1913-08-12", { confirm: () => true });
    const r = await LawCorpus.resolve(["doc:٧٧", "DOC:999", "nonsense"], day("2026-10-10"));
    expect(r["doc:٧٧"]).toMatchObject({ canonicalId: "DOC:77", exists: true, validAtDate: true, verifiedByUser: true });
    expect(r["DOC:999"].exists).toBe(false);
    expect(r.nonsense.exists).toBe(false);
  });
});

describe("decisions, doctrine, links", () => {
  test("decision: unique, verification needs a source, editing the citation un-verifies", async () => {
    const { decision } = await LawDecision.create({ decisionNumber: "١٢٣", decisionDate: "2020-05-12", principle: "مبدأ تجريبي عن المسؤولية" });
    expect(decision.decisionNumber).toBe("123");
    expect((await LawDecision.create({ decisionNumber: "123", decisionDate: "2020-05-12" })).error).toMatch(/exists/);
    expect((await LawDecision.update(decision.id, { verified: true })).error).toMatch(/source/);
    const v = await LawDecision.update(decision.id, { verified: true, sourceUrl: "https://juriscassation.cspj.ma/x" });
    expect(v.decision.verified).toBe(true);
    const edited = await LawDecision.update(decision.id, { decisionNumber: "124" });
    expect(edited.decision.verified).toBe(false);
    expect((await LawDecision.list({ q: "المسؤولية" })).map((d) => d.id)).toEqual([decision.id]);
  });

  test("doctrine quotes are capped (copyright)", async () => {
    expect((await LawDoctrine.create({ author: "أ", work: "ب", paraphrase: "ج", shortQuote: "x".repeat(301) })).error).toMatch(/300/);
    expect((await LawDoctrine.create({ author: "أ", work: "ب", paraphrase: "ج", shortQuote: "قصير" })).doctrine.id).toBeTruthy();
  });

  test("links are validated and visible from both ends", async () => {
    await importAndCommit("DOC", DOC_FIXTURE, "1913-08-12");
    const { decision } = await LawDecision.create({ decisionNumber: "9", decisionDate: "2021-01-01" });
    expect((await LawLink.create({ fromType: "decision", fromId: decision.id, toType: "article", toId: "DOC:77", relation: "nope" })).error).toBeTruthy();
    expect((await LawLink.create({ fromType: "decision", fromId: decision.id, toType: "article", toId: "DOC:999", relation: "applies" })).error).toBe("unknown endpoint");
    const { link } = await LawLink.create({ fromType: "decision", fromId: decision.id, toType: "article", toId: "doc:٧٧", relation: "applies" });
    const article = await db().lawArticle.findUnique({ where: { canonicalId: "DOC:77" } });
    const fromArticle = await LawLink.forEntity("article", article.id);
    expect(fromArticle.map((l) => [l.id, l.direction])).toEqual([[link.id, "in"]]);
  });
});

describe("PDF import path", () => {
  test("uploaded PDF → parse job → review session (never straight into the corpus)", async () => {
    const crypto = require("crypto");
    const { LawUpload } = require("../../models/lawUpload");
    const worker = require("../../utils/law/worker");
    const dir = path.join(__dirname, "../../node_modules/pdf-parse/test/data");
    const pdf = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".pdf"))));
    const sha = crypto.createHash("sha256").update(pdf).digest("hex");
    const { upload } = await LawUpload.init({ clientCaptureId: "corpus-pdf-0001", sha256: sha, bytes: pdf.length, mime: "application/pdf" });
    for (let i = 0; i < upload.chunkCount; i++)
      await LawUpload.putChunk(upload.uploadId, i, pdf.subarray(i * upload.chunkSize, (i + 1) * upload.chunkSize));
    const { asset } = await LawUpload.complete(upload.uploadId);

    const r = await LawCorpus.createImport({ codeSlug: "CT", validFrom: "2004-06-08", assetId: asset.id });
    expect(r.needsJob).toBe(true);
    const { LawJob } = require("../../models/lawJob");
    await LawJob.enqueue("parse_corpus_import", { importId: r.import.id });
    const outcome = await worker.runOnce();
    expect(outcome.status).toBe("succeeded");
    const imp = await LawCorpus.getImport(r.import.id);
    expect(imp.status).toBe("review");
    expect(imp.rawText.length).toBeGreaterThan(1000);
    expect(imp.warnings).toContain("no articles detected"); // an English paper, not a code
    expect(await db().lawArticle.count()).toBe(0);
  });
});
