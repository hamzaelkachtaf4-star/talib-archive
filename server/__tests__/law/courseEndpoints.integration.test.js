// /api/law/courses/* over real HTTP. Authentication is replaced by a header that names the acting student
// (the real middleware is covered by tenancy.integration.test.js); everything else is the real route stack.
jest.mock("../../endpoints/law/helpers", () => {
  const actual = jest.requireActual("../../endpoints/law/helpers");
  const { asUser } = require("../../utils/law/tenant");
  const testAuth = (req, res, next) => {
    const id = Number(req.headers["x-test-user"]);
    if (!id) return res.status(401).json({ error: "unauthorized" });
    res.locals.lawUser = { id, role: "default" };
    return asUser(id, () => next());
  };
  return { ...actual, auth: [testAuth] };
});

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const bodyParser = require("body-parser");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { makeCtb, richText } = require("../../utils/law/testing/makeCtb");
const { lawEndpoints } = require("../../endpoints/law");
const { LawUpload } = require("../../models/lawUpload");
const { asUser } = require("../../utils/law/tenant");
const { closeFts } = require("../../utils/law/fts");

jest.setTimeout(60000);
const ENV = process.env;
let tmp, dir, server, base, ownerId, otherId;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-courseapi-"));
  process.env = { ...ENV, STORAGE_DIR: dir };
  tmp = await createTempDb();
  ownerId = tmp.ownerId;
  otherId = (await tmp.client.users.create({ data: { username: "other", password: "!", role: "default" } })).id;
  const app = express();
  app.use(bodyParser.json());
  const router = express.Router();
  lawEndpoints(router);
  app.use("/api", router);
  await new Promise((r) => (server = app.listen(0, "127.0.0.1", r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
afterEach(async () => {
  await new Promise((r) => server.close(r));
  closeFts();
  await tmp.cleanup();
  process.env = ENV;
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(method, url, { user = ownerId, body } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": String(user) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function uploadAs(user, data, mime) {
  return asUser(user, async () => {
    const decl = { clientCaptureId: `ctb-${crypto.randomBytes(6).toString("hex")}`, sha256: crypto.createHash("sha256").update(data).digest("hex"), bytes: data.length, mime };
    const { upload } = await LawUpload.init(decl);
    for (let i = 0; i < upload.chunkCount; i++) await LawUpload.putChunk(upload.uploadId, i, data.subarray(i * upload.chunkSize, (i + 1) * upload.chunkSize));
    return (await LawUpload.complete(upload.uploadId)).asset;
  });
}
const notebookBytes = () => {
  const f = makeCtb(path.join(dir, "up.ctb"), [
    { id: 1, name: "القانون التجاري", seq: 1, txt: richText(["مدخل ", { b: "مهم" }]) },
    { id: 2, name: "الأهلية التجارية", parent: 1, txt: richText(["الأهلية هي سن الرشد."]) },
    { id: 3, name: "القانون الجنائي", seq: 2, txt: richText(["الجريمة."]) },
  ]);
  return fs.readFileSync(f);
};

test("upload → preview → import → outline → topic → search → delete", async () => {
  const asset = await uploadAs(ownerId, notebookBytes(), "application/x-sqlite3");
  expect(asset.kind).toBe("other");
  const preview = await call("POST", "/law/courses/preview", { body: { assetId: asset.id } });
  expect(preview.status).toBe(200);
  expect(preview.body.roots.map((r) => [r.nodeId, r.topics])).toEqual([[1, 2], [3, 1]]);

  const imported = await call("POST", "/law/courses/import", { body: { assetId: asset.id, rootNodeIds: [1] } });
  expect(imported.status).toBe(201);
  expect(imported.body.courses.map((c) => c.status)).toEqual(["created"]);
  const id = imported.body.courses[0].id;

  expect((await call("GET", "/law/courses")).body.courses.map((c) => c.id)).toEqual([id]);
  const outline = await call("GET", `/law/courses/${id}`);
  expect(outline.body.topics.map((t) => t.title)).toEqual(["القانون التجاري", "الأهلية التجارية"]);
  const topic = await call("GET", `/law/courses/${id}/topics/${outline.body.topics[1].id}`);
  expect(topic.body.topic.text).toBe("الأهلية هي سن الرشد.");
  const found = await call("GET", `/law/courses/search?q=${encodeURIComponent("الاهلية")}`);
  expect(found.body.results.map((r) => r.title)).toEqual(["الأهلية التجارية"]);
  expect((await call("GET", "/law/courses/search?q=")).body.results).toEqual([]);

  expect((await call("DELETE", `/law/courses/${id}`)).body).toEqual({ ok: true });
  expect((await call("GET", `/law/courses/${id}`)).status).toBe(404);
});

test("another student cannot use, read or delete a notebook or course that is not theirs", async () => {
  const asset = await uploadAs(ownerId, notebookBytes(), "application/x-sqlite3");
  expect((await call("POST", "/law/courses/preview", { user: otherId, body: { assetId: asset.id } })).status).toBe(404);
  expect((await call("POST", "/law/courses/import", { user: otherId, body: { assetId: asset.id } })).status).toBe(404);
  const mine = (await call("POST", "/law/courses/import", { body: { assetId: asset.id } })).body.courses[0].id;
  expect((await call("GET", `/law/courses/${mine}`, { user: otherId })).status).toBe(404);
  expect((await call("DELETE", `/law/courses/${mine}`, { user: otherId })).status).toBe(404);
  expect((await call("GET", "/law/courses", { user: otherId })).body.courses).toEqual([]);
  expect((await call("GET", "/law/courses/search?q=" + encodeURIComponent("الأهلية"), { user: otherId })).body.results).toEqual([]);
  expect((await call("GET", "/law/courses", { user: null })).status).toBe(401);
});

test("bad input is a clear 400, never a 500", async () => {
  const junk = await uploadAs(ownerId, Buffer.from("this is not a database"), "application/x-sqlite3");
  expect((await call("POST", "/law/courses/preview", { body: { assetId: junk.id } })).body).toEqual({ error: "not_sqlite" });
  const pdf = await uploadAs(ownerId, Buffer.from("%PDF-1.4 fake"), "application/pdf");
  expect((await call("POST", "/law/courses/import", { body: { assetId: pdf.id } })).body).toEqual({ error: "not_a_notebook" });
  expect((await call("POST", "/law/courses/import", { body: {} })).status).toBe(404);
  expect((await call("POST", "/law/courses/import", { body: { assetId: "nope" } })).status).toBe(404);
  const good = await uploadAs(ownerId, notebookBytes(), "application/x-sqlite3");
  expect((await call("POST", "/law/courses/import", { body: { assetId: good.id, rootNodeIds: ["1"] } })).body).toEqual({ error: "invalid_rootNodeIds" });
  expect((await call("POST", "/law/courses/import", { body: { assetId: good.id, rootNodeIds: [999] } })).body).toEqual({ error: "no_such_course" });
});

test("imports are rate limited per student per day", async () => {
  process.env.COURSE_IMPORTS_PER_DAY = "2";
  const asset = await uploadAs(ownerId, notebookBytes(), "application/x-sqlite3");
  expect((await call("POST", "/law/courses/import", { body: { assetId: asset.id } })).status).toBe(201);
  expect((await call("POST", "/law/courses/import", { body: { assetId: asset.id } })).status).toBe(201);
  expect((await call("POST", "/law/courses/import", { body: { assetId: asset.id } })).status).toBe(429);
  expect((await call("POST", "/law/courses/import", { user: otherId, body: { assetId: (await uploadAs(otherId, notebookBytes(), "application/x-sqlite3")).id } })).status).toBe(201);
});

test("previews are rate limited too (they run the full untrusted parse)", async () => {
  process.env.COURSE_PREVIEWS_PER_DAY = "2";
  const asset = await uploadAs(ownerId, notebookBytes(), "application/x-sqlite3");
  expect((await call("POST", "/law/courses/preview", { body: { assetId: asset.id } })).status).toBe(200);
  expect((await call("POST", "/law/courses/preview", { body: { assetId: asset.id } })).status).toBe(200);
  expect((await call("POST", "/law/courses/preview", { body: { assetId: asset.id } })).status).toBe(429);
});

describe("gap radar routes", () => {
  const { rawDb } = require("../../utils/law/dbClient");
  async function seed() {
    const code = await rawDb().lawCode.create({ data: { slug: "TCOM", family: "TCOM", titleAr: "مدونة تجريبية (ليست قانونا)" } });
    const rows = [
      [1, ["الكتاب الأول", "الأهلية التجارية"], "يشترط لمباشرة التجارة بلوغ سن الرشد القانوني وتوافر الأهلية التجارية"],
      [2, ["الكتاب الأول", "الأهلية التجارية"], "يتقادم حق إبطال تصرفات القاصر بمرور سنة من تاريخ بلوغه سن الرشد"],
      [3, ["الكتاب الأول", "السجل التجاري"], "يجب على كل تاجر طلب تقييده في السجل التجاري خلال ثلاثة أشهر من بدء نشاطه"],
      [4, ["الكتاب الأول", "السجل التجاري"], "يمسك كاتب ضبط المحكمة السجل التجاري المحلي"],
    ];
    for (const [n, h, text] of rows) {
      const a = await rawDb().lawArticle.create({ data: { codeId: code.id, articleNumber: String(n), canonicalId: `TCOM:${n}`, headingPath: JSON.stringify(h) } });
      await rawDb().lawArticleVersion.create({ data: { articleId: a.id, textAr: text, textNormalized: text, validFrom: new Date("2000-01-01"), checksum: `c${n}` } });
    }
  }
  const course = async () => {
    const f = makeCtb(path.join(dir, "gaps.ctb"), [
      { id: 1, name: "القانون التجاري", seq: 1 },
      { id: 2, name: "الأهلية التجارية", parent: 1, txt: richText(["الأهلية التجارية تتطلب بلوغ سن الرشد القانوني وتوافر الأهلية التجارية الكاملة"]) },
      { id: 3, name: "السجل التجاري", parent: 1, txt: richText(["السجل التجاري يمسكه كاتب ضبط المحكمة"]) },
    ]);
    const asset = await uploadAs(ownerId, fs.readFileSync(f), "application/x-sqlite3");
    return (await call("POST", "/law/courses/import", { body: { assetId: asset.id } })).body.courses[0].id;
  };

  test("analyze → list → dismiss → readiness", async () => {
    await seed();
    const id = await course();
    const a = await call("POST", `/law/courses/${id}/gaps/analyze`, { body: { codes: ["TCOM"] } });
    expect(a.status).toBe(200);
    expect(a.body.status).toBe("ok");
    const ids = a.body.gaps.map((g) => g.canonicalId);
    expect(ids).toEqual(expect.arrayContaining(["TCOM:2", "TCOM:3"]));
    expect(ids).not.toContain("TCOM:1");
    const listed = await call("GET", `/law/courses/${id}/gaps`);
    expect(listed.body.gaps.map((g) => g.id)).toEqual(a.body.gaps.map((g) => g.id));
    const target = a.body.gaps[0];
    expect((await call("PATCH", `/law/courses/${id}/gaps/${target.id}`, { body: { status: "DISMISSED" } })).body.gap.status).toBe("DISMISSED");
    expect((await call("GET", `/law/courses/${id}/gaps?status=OPEN`)).body.gaps.map((g) => g.id)).not.toContain(target.id);
    const ready = await call("GET", `/law/courses/${id}/readiness?limit=2`);
    expect(ready.status).toBe(200);
    expect(ready.body.candidates.length).toBeLessThanOrEqual(2);
    expect(ready.body.candidates.map((c) => c.gapId)).not.toContain(target.id);
    expect(ready.body.candidates.every((c) => typeof c.article === "string" && c.article.length > 10)).toBe(true);
  });

  test("an empty corpus is a 200 with a clear status, not an error", async () => {
    const id = await course();
    const a = await call("POST", `/law/courses/${id}/gaps/analyze`, { body: {} });
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ status: "corpus_empty", gaps: [] });
    expect(a.body.codes.map((c) => c.slug)).toEqual(["DOC", "CCOM"]);
  });

  test("bad input, other students and rate limits", async () => {
    await seed();
    const id = await course();
    expect((await call("POST", `/law/courses/${id}/gaps/analyze`, { body: { codes: "TCOM" } })).body).toEqual({ error: "invalid_codes" });
    expect((await call("POST", `/law/courses/${id}/gaps/analyze`, { user: otherId, body: { codes: ["TCOM"] } })).status).toBe(404);
    expect((await call("GET", `/law/courses/${id}/gaps`, { user: otherId })).status).toBe(404);
    expect((await call("GET", `/law/courses/${id}/readiness`, { user: otherId })).status).toBe(404);
    const gap = (await call("POST", `/law/courses/${id}/gaps/analyze`, { body: { codes: ["TCOM"] } })).body.gaps[0];
    expect((await call("PATCH", `/law/courses/${id}/gaps/${gap.id}`, { user: otherId, body: { status: "DISMISSED" } })).status).toBe(404);
    expect((await call("PATCH", `/law/courses/${id}/gaps/${gap.id}`, { body: { status: "RESOLVED" } })).body).toEqual({ error: "invalid_status" });
    expect((await call("GET", `/law/courses/${id}/readiness?limit=abc`)).status).toBe(200); // a bad limit falls back to the default
    const before = process.env.GAP_ANALYSES_PER_DAY;
    process.env.GAP_ANALYSES_PER_DAY = "1";
    try {
      expect((await call("POST", `/law/courses/${id}/gaps/analyze`, { body: { codes: ["TCOM"] } })).status).toBe(429);
    } finally {
      if (before === undefined) delete process.env.GAP_ANALYSES_PER_DAY;
      else process.env.GAP_ANALYSES_PER_DAY = before;
    }
  });

  test("there is no endpoint that lets a client report diagnostic results (they would be spoofable Brain evidence)", async () => {
    await seed();
    const id = await course();
    const gap = (await call("POST", `/law/courses/${id}/gaps/analyze`, { body: { codes: ["TCOM"] } })).body.gaps[0];
    for (const url of [`/law/courses/${id}/gaps/${gap.id}/miss`, `/law/courses/${id}/gaps/${gap.id}/diagnostic`, `/law/courses/${id}/gaps/${gap.id}/answer`]) {
      const res = await fetch(`${base}${url}`, { method: "POST", headers: { "Content-Type": "application/json", "x-test-user": String(ownerId) }, body: JSON.stringify({ correct: false }) });
      expect(res.status).toBe(404); // the route does not exist
    }
    expect(await rawDb().lawLearnerEvidence.count()).toBe(0);
  });

  test("malformed requests do not use up the daily analysis quota", async () => {
    await seed();
    const id = await course();
    process.env.GAP_ANALYSES_PER_DAY = "2";
    for (let i = 0; i < 5; i++) expect((await call("POST", `/law/courses/${id}/gaps/analyze`, { body: { codes: ["bad slug!"] } })).status).toBe(400);
    expect((await call("POST", `/law/courses/${id}/gaps/analyze`, { body: { codes: ["TCOM"] } })).status).toBe(200);
    expect((await call("POST", `/law/courses/${id}/gaps/analyze`, { body: { codes: ["TCOM"] } })).status).toBe(200);
    expect((await call("POST", `/law/courses/${id}/gaps/analyze`, { body: { codes: ["TCOM"] } })).status).toBe(429);
  });

  test("analysing a course that does not exist does not load anything or use the quota", async () => {
    process.env.GAP_ANALYSES_PER_DAY = "1";
    expect((await call("POST", `/law/courses/nope/gaps/analyze`, { body: {} })).status).toBe(404);
    expect((await call("POST", `/law/courses/nope/gaps/analyze`, { body: {} })).status).toBe(404); // still 404, not 429
  });
});
