// Legal graph API: bundle shape, per-student isolation, reviewed-only concepts, ETag, propose-only auto-link, tours.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));

const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const fsx = require("fs");
const osx = require("os");
const pathx = require("path");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { lawEndpoints } = require("../../endpoints/law");
const { resetRateLimits } = require("../../endpoints/law/auth");
const { LawAccount } = require("../../models/lawAccount");
const { setMailTransport } = require("../../utils/law/mailer");
const { closeFts } = require("../../utils/law/fts");
const { asSystem } = require("../../utils/law/tenant");
const { LawCorpus } = require("../../models/lawCorpus");
const { resetGraphCache } = require("../../utils/law/legalGraph");

jest.setTimeout(60000);
const ENV = process.env;
const PASSWORD = "Motdepasse-solide-1";
let tmp, server, base, mails, storageDir;

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, headers: res.headers };
}
const lastCode = () => mails.at(-1).text.match(/\b(\d{6})\b/)[1];
async function signUp(name, email) {
  expect((await call("POST", "/law/auth/register", { body: { fullName: name, email, password: PASSWORD } })).status).toBe(202);
  const v = await call("POST", "/law/auth/register/verify", { body: { email, code: lastCode() } });
  expect(v.status).toBe(201);
  await call("POST", "/law/auth/consent", { token: v.body.token, body: { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" } });
  return v.body;
}
const makeAdmin = async () => { const a = await signUp("المشرف", "admin@example.ma"); await tmp.client.users.update({ where: { id: a.user.id }, data: { role: "admin" } }); return a; };
const bundle = (s) => call("GET", "/law/graph/bundle", { token: s.token });

beforeEach(async () => {
  process.env = { ...ENV, JWT_SECRET: "test-secret-for-qanouni", STORAGE_DIR: (storageDir = fsx.mkdtempSync(pathx.join(osx.tmpdir(), "lawos-graph-"))) };
  delete process.env.AUTH_TOKEN;
  tmp = await createTempDb();
  globalThis.__lawTestPrisma = tmp.client;
  resetRateLimits();
  resetGraphCache();
  mails = [];
  setMailTransport(async (m) => { mails.push(m); return { delivered: true }; });
  // Synthetic statute text (fixtures, not real law).
  await asSystem(async () => {
    for (const [slug, text] of [
      ["DOC", "الفصل 77\nنص تجريبي يحيل على الفصل 78 من هذا القانون وعلى الفصل 3 من مجموعة القانون الجنائي.\nالفصل 78\nنص تجريبي يحيل على الفصل 999 وعلى الفصل 5 من الدستور."],
      ["CP", "الفصل 3\nنص تجريبي أول.\nالفصل 4\nنص تجريبي ثان."],
    ]) {
      const { import: imp } = await LawCorpus.createImport({ codeSlug: slug, validFrom: "1913-08-12", text });
      await LawCorpus.commitImport(imp.id);
    }
  });
  await LawAccount.enableMultiUserMode();
  const app = express();
  app.use(bodyParser.json({ limit: "20mb" }));
  const r = express.Router();
  lawEndpoints(r);
  app.use("/api", r);
  server = http.createServer(app);
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => {
  setMailTransport(null);
  await new Promise((r) => server.close(r));
  closeFts();
  await tmp.cleanup();
  fsx.rmSync(storageDir, { recursive: true, force: true });
  globalThis.__lawTestPrisma = null;
  process.env = ENV;
});

const edgeKey = (e) => `${e.k}:${e.s}>${e.t}`;

test("requires a signed-in student", async () => {
  expect((await call("GET", "/law/graph/bundle")).status).toBe(401);
});

test("explicit citations become edges; unresolved and foreign-text refs are dropped", async () => {
  const a = await signUp("سلمى", "a@example.ma");
  const r = await bundle(a);
  expect(r.status).toBe(200);
  const keys = r.body.edges.map(edgeKey);
  expect(keys).toEqual(expect.arrayContaining(["explicit:DOC:77>DOC:78", "explicit:DOC:77>CP:3"]));
  expect(keys.some((k) => k.includes("999"))).toBe(false);
  expect(r.body.edges.every((e) => e.x === true || e.k !== "explicit")).toBe(true);
  expect(r.body.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["DOC:77", "DOC:78", "CP:3"]));
  expect(r.body.stats.droppedRefs).toBeGreaterThanOrEqual(1);
  const n = r.body.nodes.find((x) => x.id === "DOC:77");
  expect(n.summary.length).toBeLessThanOrEqual(141);
});

test("a student's own links are theirs alone", async () => {
  const a = await signUp("سلمى", "a@example.ma");
  const b = await signUp("يوسف", "b@example.ma");
  const [c3, c4] = await Promise.all(["CP:3", "CP:4"].map((canonicalId) => tmp.client.lawArticle.findUnique({ where: { canonicalId } })));
  await tmp.client.lawLink.create({ data: { userId: a.user.id, fromType: "article", fromId: c3.id, toType: "article", toId: c4.id, relation: "interprets", note: "ملاحظة" } });
  expect((await bundle(a)).body.edges.map(edgeKey)).toContain("link:CP:3>CP:4");
  expect((await bundle(b)).body.edges.map(edgeKey)).not.toContain("link:CP:3>CP:4");
});

test("only reviewed concepts and pairs reach students; concept refs must resolve", async () => {
  const a = await signUp("سلمى", "a@example.ma");
  const mk = (slug, reviewed, refs) => tmp.client.lawConcept.create({ data: { slug, titleAr: slug, domain: "CIVIL", reviewed, legalRefs: JSON.stringify(refs) } });
  const c1 = await mk("alpha", true, [{ slug: "DOC", number: "77" }, { slug: "DOC", number: "424242" }]);
  const c2 = await mk("beta", true, []);
  const c3 = await mk("gamma", false, [{ slug: "DOC", number: "78" }]);
  await tmp.client.lawConfusionPair.create({ data: { conceptAId: c1.id, conceptBId: c2.id, labelAr: "ألفا بيتا", reviewed: true } });
  await tmp.client.lawConfusionPair.create({ data: { conceptAId: c1.id, conceptBId: c3.id, labelAr: "ألفا غاما", reviewed: true } }); // member unreviewed
  const body = (await bundle(a)).body;
  const ids = body.nodes.map((n) => n.id);
  expect(ids).toEqual(expect.arrayContaining(["c:alpha", "c:beta"]));
  expect(ids).not.toContain("c:gamma");
  expect(body.nodes.filter((n) => n.type === "pair").map((n) => n.labelAr)).toEqual(["ألفا بيتا"]);
  const keys = body.edges.map(edgeKey);
  expect(keys).toContain("concept:c:alpha>DOC:77");
  expect(keys.some((k) => k.includes("424242"))).toBe(false);
});

test("ETag: matching If-None-Match answers 304, a change in the student's data busts it", async () => {
  const a = await signUp("سلمى", "a@example.ma");
  const first = await bundle(a);
  const etag = first.headers.get("etag");
  expect(etag).toBeTruthy();
  expect((await call("GET", "/law/graph/bundle", { token: a.token, headers: { "If-None-Match": etag } })).status).toBe(304);
  const [c3, c4] = await Promise.all(["CP:3", "CP:4"].map((canonicalId) => tmp.client.lawArticle.findUnique({ where: { canonicalId } })));
  await tmp.client.lawLink.create({ data: { userId: a.user.id, fromType: "article", fromId: c3.id, toType: "article", toId: c4.id, relation: "confirms" } });
  const again = await call("GET", "/law/graph/bundle", { token: a.token, headers: { "If-None-Match": etag } });
  expect(again.status).toBe(200);
  expect(again.headers.get("etag")).not.toBe(etag);
});

test("tours keep only steps that resolve in the corpus, with statute text from the corpus", async () => {
  const a = await signUp("سلمى", "a@example.ma");
  const { tours } = (await bundle(a)).body;
  const tort = tours.find((t) => t.id === "tort-liability");
  expect(tort.steps.map((s) => s.id)).toEqual(["DOC:77", "DOC:78"]); // DOC:85 and the unreviewed pair are absent
  expect(tort.steps[0].text).toContain("نص تجريبي");
  expect(tours.find((t) => t.id === "contract-nullity")).toBeUndefined(); // fewer than two steps resolve
});

test("auto-link is admin only and propose-only", async () => {
  const a = await signUp("سلمى", "a@example.ma");
  expect((await call("POST", "/law/graph/auto-link", { token: a.token, body: {} })).status).toBe(403);
  const adm = await makeAdmin();
  const before = await tmp.client.lawLink.count();
  const r = await call("POST", "/law/graph/auto-link", { token: adm.token, body: {} });
  expect(r.status).toBe(200);
  expect(r.body.proposals).toEqual(expect.arrayContaining([{ from: "DOC:77", to: "DOC:78", relation: "references", explicit: true }]));
  expect(r.body.droppedUnresolved).toBeGreaterThanOrEqual(1);
  expect(await tmp.client.lawLink.count()).toBe(before);
});

test("a graph flashcard keeps its article and concept ids; malformed conceptIds are refused", async () => {
  const a = await signUp("سلمى", "a@example.ma");
  const subject = await tmp.client.lawSubject.create({ data: { name: "مادة", userId: a.user.id } });
  const body = { subjectId: subject.id, origin: "manual", type: "basic", front: "ما العلاقة؟", back: "يحيل على", canonicalIds: ["DOC:77", "DOC:78"], conceptIds: ["k1"] };
  const ok = await call("POST", "/law/cards", { token: a.token, body });
  expect(ok.status).toBe(201);
  const row = await tmp.client.lawFlashcard.findUnique({ where: { id: ok.body.card.id } });
  expect(JSON.parse(row.conceptIds)).toEqual(["k1"]);
  for (const bad of ["k1", [1], Array(11).fill("k")])
    expect((await call("POST", "/law/cards", { token: a.token, body: { ...body, conceptIds: bad } })).status).toBe(400);
});

test("a family reference (قانون المسطرة المدنية) is dropped when the family has several codes, since the numbering era is unknowable", async () => {
  const a = await signUp("سلمى", "a@example.ma");
  await asSystem(async () => {
    for (const [slug, text] of [
      ["CPC-1974", "الفصل 1\nنص تجريبي.\nالفصل 2\nنص تجريبي."],
      ["CPC-58.25", "المادة 1\nنص تجريبي.\nالمادة 2\nنص تجريبي."],
    ]) {
      const { import: imp } = await LawCorpus.createImport({ codeSlug: slug, validFrom: "1974-09-28", text });
      await LawCorpus.commitImport(imp.id);
    }
    const { import: imp } = await LawCorpus.createImport({ codeSlug: "CCOM", validFrom: "1996-08-01", text: "المادة 1\nنص يحيل على الفصل 2 من قانون المسطرة المدنية.\nالمادة 2\nنص تجريبي." });
    await LawCorpus.commitImport(imp.id);
  });
  const keys = (await bundle(a)).body.edges.map(edgeKey);
  expect(keys.some((k) => k.startsWith("explicit:CCOM:1>CPC"))).toBe(false);
});

test("un-reviewing a code removes its nodes and edges without a manual cache reset", async () => {
  const a = await signUp("سلمى", "a@example.ma");
  expect((await bundle(a)).body.nodes.map((n) => n.id)).toContain("CP:3");
  await tmp.client.lawCode.update({ where: { slug: "CP" }, data: { reviewed: false } });
  const after = (await bundle(a)).body;
  expect(after.nodes.some((n) => n.code === "CP")).toBe(false);
  expect(after.edges.some((e) => e.s.startsWith("CP:") || e.t.startsWith("CP:"))).toBe(false);
});

test("a cross-code citation into a code that replaced an older numbering (CPP) is dropped; same-code and stable targets stay", async () => {
  const a = await signUp("سلمى", "a@example.ma");
  await asSystem(async () => {
    for (const [slug, text] of [
      ["CPP", "المادة 1\nنص تجريبي يحيل على المادة 2.\nالمادة 2\nنص تجريبي.\nالمادة 663\nنص تجريبي."],
      ["CCOM", "المادة 1\nنص تجريبي يحيل على المادة 663 من المسطرة الجنائية وعلى الفصل 77 من ق.ل.ع.\nالمادة 2\nنص تجريبي."],
    ]) {
      const { import: imp } = await LawCorpus.createImport({ codeSlug: slug, validFrom: "2003-10-03", text });
      await LawCorpus.commitImport(imp.id);
    }
  });
  await tmp.client.lawCode.update({ where: { slug: "CPP" }, data: { reviewed: true } });
  const keys = (await bundle(a)).body.edges.map(edgeKey);
  expect(keys).toContain("explicit:CPP:1>CPP:2"); // same code
  expect(keys).toContain("explicit:CCOM:1>DOC:77"); // target numbering unchanged
  expect(keys).not.toContain("explicit:CCOM:1>CPP:663");
});
