// RC4 Phase 7: the code's heading tree, bookmarks, and linking an article to a module (the mentor then reads it).
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startHarness } = require("../../utils/law/testing/harness");
const { LawCorpus } = require("../../models/lawCorpus");
const { rawDb } = require("../../utils/law/dbClient");
const { ingestFile } = require("../../utils/law/corpusIngest");
const { asSystem } = require("../../utils/law/tenant");

jest.setTimeout(60000);
let h; let dir;
beforeEach(async () => { h = await startHarness(); dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-reader-")); });
afterEach(async () => { await h.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

// Invented test text: it only exercises the tree and the bookkeeping, it is not law.
const SAMPLE = [
  "الكتاب الأول: نص تجريبي", "الباب الأول: باب تجريبي", "الفصل 1", "نص تجريبي للفصل الأول المتعلق بالمسؤولية.",
  "الفصل 2", "نص تجريبي للفصل الثاني المتعلق بالخطأ.", "الباب الثاني: باب آخر", "الفصل 3", "نص تجريبي للفصل الثالث المتعلق بالضرر.",
].join("\n");
async function ingest() {
  const f = path.join(dir, "doc.txt");
  fs.writeFileSync(f, SAMPLE, "utf8");
  await asSystem(() => ingestFile({ slug: "DOC", filePath: f, sourceUrl: "https://src.example.invalid/doc.pdf", consolidatedAsOf: "2026-09-30", commit: true }, { LawCorpus, rawDb }));
}
const SCOPE = { facultyCode: "FSJES-AC", track: "PRIVE", studyLang: "AR", semester: "S3" };
async function student() {
  const u = await h.signUp("سلمى", "r@example.ma");
  await h.tmp.client.lawUserProfile.update({ where: { userId: u.user.id }, data: SCOPE });
  const mid = (await h.call("GET", "/law/modules?semester=S3", { token: u.token })).body.modules[0].id;
  return { u, mid };
}
const articleId = async () => (await h.tmp.client.lawArticle.findFirst({ where: { articleNumber: "2" } })).canonicalId;

describe("code tree", () => {
  test("headings in order with their articles, no article text", async () => {
    await ingest();
    const { u } = await student();
    const r = await h.call("GET", "/law/corpus/codes/DOC/tree", { token: u.token });
    expect(r.status).toBe(200);
    expect(r.body.code).toMatchObject({ slug: "DOC", articleCount: 3 });
    const flat = JSON.stringify(r.body.tree);
    expect(flat).toContain("الباب الأول");
    expect(flat).toContain("الباب الثاني");
    expect(flat).not.toContain("نص تجريبي للفصل");
    const leaves = (n) => (n.articles || []).map((a) => a.number).concat((n.children || []).flatMap(leaves));
    expect(r.body.tree.flatMap(leaves)).toEqual(["1", "2", "3"]);
    expect((await h.call("GET", "/law/corpus/codes/NOPE/tree", { token: u.token })).status).toBe(404);
  });
});

describe("bookmarks", () => {
  test("add is idempotent, list shows code and number, remove works, other students never see them", async () => {
    await ingest();
    const { u } = await student();
    const o = await h.signUp("يوسف", "o3@example.ma");
    const id = await articleId();
    expect((await h.call("PUT", `/law/corpus/bookmarks/${id}`, { token: u.token })).status).toBe(200);
    expect((await h.call("PUT", `/law/corpus/bookmarks/${id}`, { token: u.token })).status).toBe(200);
    const list = (await h.call("GET", "/law/corpus/bookmarks", { token: u.token })).body.bookmarks;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ canonicalId: id, number: "2", code: { slug: "DOC" } });
    expect((await h.call("GET", "/law/corpus/bookmarks", { token: o.token })).body.bookmarks).toEqual([]);
    expect((await h.call("DELETE", `/law/corpus/bookmarks/${id}`, { token: u.token })).status).toBe(200);
    expect((await h.call("GET", "/law/corpus/bookmarks", { token: u.token })).body.bookmarks).toEqual([]);
    expect((await h.call("PUT", "/law/corpus/bookmarks/does-not-exist", { token: u.token })).status).toBe(404);
  });
});

describe("module links", () => {
  test("link, list per module, unlink; only the owner's modules; the mentor reads the linked article", async () => {
    await ingest();
    const { u, mid } = await student();
    const id = await articleId();
    expect((await h.call("PUT", `/law/modules/${mid}/articles/${id}`, { token: u.token })).status).toBe(200);
    expect((await h.call("PUT", `/law/modules/${mid}/articles/${id}`, { token: u.token })).status).toBe(200); // idempotent
    const linked = (await h.call("GET", `/law/modules/${mid}/articles`, { token: u.token })).body.articles;
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ canonicalId: id, number: "2", code: { slug: "DOC" } });
    // the module's study material now includes the article text, so the mentor and the drills can cite it
    const { materialOf } = require("../../utils/law/moduleMaterial");
    const { pieces } = await asSystem(() => materialOf(u.user.id, mid));
    expect(pieces.some((p) => p.ref === `a:${id}` && p.text.includes("المتعلق بالخطأ"))).toBe(true);
    const o = await h.signUp("يوسف", "o4@example.ma");
    expect((await h.call("PUT", `/law/modules/${mid}/articles/${id}`, { token: o.token })).status).toBe(404);
    expect((await h.call("PUT", `/law/modules/${mid}/articles/missing`, { token: u.token })).status).toBe(404);
    expect((await h.call("DELETE", `/law/modules/${mid}/articles/${id}`, { token: u.token })).status).toBe(200);
    expect((await h.call("GET", `/law/modules/${mid}/articles`, { token: u.token })).body.articles).toEqual([]);
  });
});
