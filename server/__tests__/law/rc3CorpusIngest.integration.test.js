// RC3 Phase 6: official-source ingestion (checksums, provenance, idempotency) and the catalog endpoint.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { startHarness } = require("../../utils/law/testing/harness");
const { LawCorpus } = require("../../models/lawCorpus");
const { rawDb } = require("../../utils/law/dbClient");
const { ingestFile, IngestError } = require("../../utils/law/corpusIngest");
const { asSystem } = require("../../utils/law/tenant");

jest.setTimeout(60000);
let h;
let dir;
beforeEach(async () => { h = await startHarness(); dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-ingest-")); });
afterEach(async () => { await h.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

// Invented test text: it only exercises the parser and the bookkeeping, it is not law.
const SAMPLE = "الفصل 1\nنص تجريبي للفصل الأول لأغراض الاختبار فقط.\nالفصل 2\nنص تجريبي للفصل الثاني لأغراض الاختبار فقط.\nالفصل 3\nنص تجريبي للفصل الثالث لأغراض الاختبار فقط.\n";
const write = (name, text) => { const f = path.join(dir, name); fs.writeFileSync(f, text, "utf8"); return f; };
const ARGS = (file, over = {}) => ({ slug: "DOC", filePath: file, sourceUrl: "https://sgg.example.invalid/doc.pdf", consolidatedAsOf: "2026-09-30", ...over });
const run = (args) => asSystem(() => ingestFile(args, { LawCorpus, rawDb }));
const admin = async () => { const u = await h.signUp("مسؤول", "admin@example.ma"); await h.tmp.client.users.update({ where: { id: u.user.id }, data: { role: "admin" } }); return u; };

describe("ingestFile", () => {
  test("stages a review import with the sha256 of the raw file, the URL and the consolidation date", async () => {
    const file = write("doc.txt", SAMPLE);
    const r = await run(ARGS(file));
    expect(r).toMatchObject({ status: "staged", articles: 3, slug: "DOC" });
    expect(r.sha256).toBe(require("crypto").createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
    const src = await h.tmp.client.lawSourceDocument.findFirst({ where: { sha256: r.sha256 } });
    expect(src).toMatchObject({ url: "https://sgg.example.invalid/doc.pdf", consolidatedAsOf: "2026-09-30", origin: "manual_upload" });
    const imp = await h.tmp.client.lawCorpusImport.findUnique({ where: { id: r.importId } });
    expect(imp.status).toBe("review");
    expect(await h.tmp.client.lawArticle.count()).toBe(0); // nothing is live before the commit
  });

  test("is idempotent: the same file for the same code is recorded once", async () => {
    const file = write("doc.txt", SAMPLE);
    const first = await run(ARGS(file));
    const again = await run(ARGS(file));
    expect(again).toMatchObject({ status: "unchanged", importId: first.importId, sha256: first.sha256 });
    expect(await h.tmp.client.lawCorpusImport.count()).toBe(1);
    expect(await h.tmp.client.lawSourceDocument.count()).toBe(1);
    // a different file is a new import; the same bytes under another code are not a duplicate of it
    const changed = await run(ARGS(write("doc2.txt", `${SAMPLE}الفصل 4\nنص تجريبي للفصل الرابع.\n`)));
    expect(changed.status).toBe("staged");
    expect(changed.importId).not.toBe(first.importId);
    const other = await run(ARGS(file, { slug: "CP" }));
    expect(other.status).toBe("staged");
  });

  test("--commit publishes the articles and the catalog then reports the text as ingested with its provenance", async () => {
    const file = write("doc.txt", SAMPLE);
    const r = await run(ARGS(file, { commit: true }));
    expect(r.status).toBe("committed");
    expect(await h.tmp.client.lawArticle.count()).toBe(3);
    const a = await admin();
    const cat = (await h.call("GET", "/law/corpus/catalog", { token: a.token })).body.categories;
    const doc = cat.flatMap((c) => c.entries).find((e) => e.slug === "DOC");
    expect(doc).toMatchObject({ status: "in_force", articleCount: 3, consolidatedAsOf: "2026-09-30", sourceUrl: "https://sgg.example.invalid/doc.pdf", sha256: r.sha256 });
  });

  test("staged first, then --commit on the same file publishes it (no silent 'unchanged')", async () => {
    const file = write("doc.txt", SAMPLE);
    expect((await run(ARGS(file))).status).toBe("staged");
    expect(await h.tmp.client.lawArticle.count()).toBe(0);
    const r = await run(ARGS(file, { commit: true }));
    expect(r.status).toBe("committed");
    expect(await h.tmp.client.lawArticle.count()).toBe(3);
    expect((await run(ARGS(file, { commit: true }))).status).toBe("unchanged");
  });

  test("text ingested with --commit stays flagged as not yet reviewed, for codes that already existed too", async () => {
    await run(ARGS(write("doc.txt", SAMPLE), { commit: true }));
    expect((await h.tmp.client.lawCode.findUnique({ where: { slug: "DOC" } })).reviewed).toBe(false);
  });

  test("a failed attempt (no articles recognised) does not make the same bytes 'unchanged' later", async () => {
    const file = write("none.txt", "لا عناوين مواد هنا.");
    await expect(run(ARGS(file))).rejects.toMatchObject({ code: "no_articles_found" });
    await expect(run(ARGS(file))).rejects.toMatchObject({ code: "no_articles_found" });
  });

  test("today's date is accepted (judged on the Casablanca calendar)", async () => {
    const { localDate } = require("../../utils/law/time");
    expect((await run(ARGS(write("doc.txt", SAMPLE), { consolidatedAsOf: localDate(new Date()) }))).status).toBe("staged");
  });

  test("a catalog entry that has no database row yet is created on first ingestion, unreviewed", async () => {
    const r = await run(ARGS(write("org.txt", SAMPLE.replace(/الفصل/g, "المادة")), { slug: "ORG-FINANCES", commit: true }));
    expect(r.status).toBe("committed");
    const code = await h.tmp.client.lawCode.findUnique({ where: { slug: "ORG-FINANCES" } });
    expect(code).toMatchObject({ normLevel: "ORGANIC", reviewed: false });
  });

  test("every refusal has its own code and stores nothing", async () => {
    const good = write("ok.txt", SAMPLE);
    const codeOf = async (args) => { try { await run(args); return "none"; } catch (e) { expect(e).toBeInstanceOf(IngestError); return e.code; } };
    expect(await codeOf(ARGS(good, { slug: "NOT-IN-CATALOG" }))).toBe("unknown_catalog_entry");
    expect(await codeOf(ARGS(good, { sourceUrl: "http://insecure.example/x" }))).toBe("invalid_source_url");
    expect(await codeOf(ARGS(good, { sourceUrl: "https://user:pw@example.org/x" }))).toBe("invalid_source_url");
    expect(await codeOf(ARGS(good, { sourceUrl: "not a url" }))).toBe("invalid_source_url");
    expect(await codeOf(ARGS(good, { sourceUrl: undefined }))).toBe("invalid_source_url");
    expect(await codeOf(ARGS(good, { consolidatedAsOf: "2026-02-30" }))).toBe("invalid_consolidation_date");
    expect(await codeOf(ARGS(good, { consolidatedAsOf: "2999-01-01" }))).toBe("invalid_consolidation_date");
    expect(await codeOf(ARGS(good, { consolidatedAsOf: undefined }))).toBe("invalid_consolidation_date");
    expect(await codeOf(ARGS(good, { validFrom: "yesterday" }))).toBe("invalid_valid_from");
    expect(await codeOf(ARGS(path.join(dir, "missing.txt")))).toBe("file_not_found");
    expect(await codeOf(ARGS(dir))).toBe("unsupported_file");
    expect(await codeOf(ARGS(write("x.pdf", "%PDF")))).toBe("unsupported_file");
    expect(await codeOf(ARGS(write("empty.txt", "")))).toBe("empty_file");
    const bin = path.join(dir, "bin.txt"); fs.writeFileSync(bin, Buffer.from([0x41, 0xff, 0xfe, 0x42, 0xc3, 0x28]));
    expect(await codeOf(ARGS(bin))).toBe("not_utf8");
    expect(await codeOf(ARGS(write("prose.txt", "هذا نص عادي بلا أي عناوين فصول أو مواد على الإطلاق.")))).toBe("no_articles_found");
    expect(await h.tmp.client.lawArticle.count()).toBe(0);
    expect(await h.tmp.client.lawCorpusImport.count({ where: { status: { in: ["review", "committed"] } } })).toBe(0);
  });
});

describe("catalog endpoint", () => {
  test("7 hierarchy tiers; only texts that were imported are listed; any signed-in student may read it", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    const r = await h.call("GET", "/law/corpus/catalog", { token: a.token });
    expect(r.status).toBe(200);
    expect(r.body.categories.map((c) => c.id)).toEqual(require("../../utils/law/corpusCatalog").LEVEL_IDS);
    // a fresh database holds no imported text, so nothing is listed: the Library never shows a placeholder card
    expect(r.body.categories.flatMap((c) => c.entries)).toEqual([]);
    expect((await h.call("GET", "/law/corpus/catalog")).status).toBe(401);
  });
});

describe("command line", () => {
  test("refuses to run without the provenance arguments (exit 2) and names what is missing", () => {
    const script = path.resolve(__dirname, "../../scripts/law/ingest-corpus.js");
    let out = "";
    try { execFileSync(process.execPath, [script, "--slug", "DOC", "--file", "x.txt"], { stdio: "pipe", cwd: path.resolve(__dirname, "../..") }); } catch (e) { out = String(e.stderr); expect(e.status).toBe(2); }
    expect(out).toMatch(/missing --source-url/);
  });
});
