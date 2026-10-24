// Phase 5: staged FDC timetable -> admin publish -> subscription -> merged week with overrides.
jest.mock("../../utils/prisma", () => {
  return new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] });
});

const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { lawEndpoints } = require("../../endpoints/law");
const { resetRateLimits } = require("../../endpoints/law/auth");
const { LawAccount } = require("../../models/lawAccount");
const { LawSetting } = require("../../models/lawSetting");
const { LawEmailCode } = require("../../models/lawEmailCode");
const { setMailTransport } = require("../../utils/law/mailer");
const router = require("../../utils/law/ai/router");
const { closeFts } = require("../../utils/law/fts");
const fs = require("fs");
const pathMod = require("path");
const { setFdcFetch } = require("../../endpoints/law/timetable");

jest.setTimeout(60000);
const ENV = process.env;
const PASSWORD = "Motdepasse-solide-1";
let tmp;
let server;
let base;
let mails;
let aiReply;
let aiCalls;

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json };
}

const lastCode = () => mails.at(-1).text.match(/\b(\d{6})\b/)[1];
const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

async function signUp(name, email) {
  const r = await call("POST", "/law/auth/register", {
    body: { fullName: name, email, password: PASSWORD },
  });
  expect(r.status).toBe(202);
  const v = await call("POST", "/law/auth/register/verify", {
    body: { email, code: lastCode() },
  });
  expect(v.status).toBe(201);
  return v.body;
}

beforeEach(async () => {
  process.env = {
    ...ENV,
    JWT_SECRET: "test-secret-for-qanouni",
    GEMINI_API_KEY: "k",
    GEMINI_MODEL_MULTIMODAL: "gemini-flash",
  };
  delete process.env.AUTH_TOKEN;
  tmp = await createTempDb();
  globalThis.__lawTestPrisma = tmp.client;
  resetRateLimits();
  mails = [];
  setMailTransport(async (m) => {
    mails.push(m);
    return { delivered: true };
  });
  aiCalls = [];
  aiReply = null;
  router.setClientFactory({
    gemini: () => ({
      generate: async (req) => {
        aiCalls.push(req);
        return { text: JSON.stringify(aiReply), json: aiReply, model: "fake", usage: { tokensIn: 10, tokensOut: 10 } };
      },
    }),
    deepseek: () => ({ generate: async () => { throw new Error("unused"); } }),
  });
  await LawSetting.update({ aiBudgetGeminiUsd: 5 });
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
  globalThis.__lawTestPrisma = null;
  process.env = ENV;
});



const H = "semester,track,language,groupCode,dayOfWeek,startTime,endTime,subject,kind,room,professor\n";
const CSV1 =
  H +
  "S3,PRIVE,AR,G01,1,11:00,13:15,القانون الجنائي الخاص,COURS,2,ELYOUSFI\n" +
  "S3,PRIVE,AR,G01,2,13:30,15:45,قانون الأسرة,COURS,7,BOUCHRIKA\n" +
  "S3,PRIVE,AR,G02,1,13:30,15:45,القانون الجنائي الخاص,COURS,2,ELYOUSFI\n";
const WEEK = "2026-10-05"; // a Monday

async function adminToken() {
  const a = await signUp("المشرف", "admin@example.ma");
  await tmp.client.users.update({ where: { id: a.user.id }, data: { role: "admin" } });
  return a.token;
}
async function publish(admin, csv, season = "AUTOMNE") {
  const imp = await call("POST", "/law/admin/timetable/import-csv", { token: admin, body: { season, csv } });
  expect([200, 201]).toContain(imp.status);
  const pub = await call("POST", `/law/admin/timetable/staging/${imp.body.source.id}/publish`, { token: admin });
  expect(pub.status).toBe(200);
  return imp.body.source.id;
}
const sub = { facultyCode: "FSJES_AIN_CHOCK", semester: "S3", track: "PRIVE", language: "AR", groupCode: "G01" };

describe("staging and publishing", () => {
  test("admin only; staged rows are invisible to students until published; invalid CSV is all-or-nothing", async () => {
    const admin = await adminToken();
    const s = await signUp("سلمى", "a@example.ma");
    expect((await call("POST", "/law/admin/timetable/import-csv", { token: s.token, body: { season: "AUTOMNE", csv: CSV1 } })).status).toBe(403);
    expect((await call("POST", "/law/admin/timetable/import-csv", { token: admin, body: { season: "ETE", csv: CSV1 } })).status).toBe(400);
    const bad = await call("POST", "/law/admin/timetable/import-csv", { token: admin, body: { season: "AUTOMNE", csv: CSV1 + "S9,PRIVE,AR,G01,1,08:30,10:45,x,COURS,,\n" } });
    expect(bad.status).toBe(400);
    expect(bad.body.details).toEqual([{ line: 5, error: "invalid_semester" }]);
    expect(await tmp.client.lawTimetableSource.count()).toBe(0);

    const imp = await call("POST", "/law/admin/timetable/import-csv", { token: admin, body: { season: "AUTOMNE", csv: CSV1 } });
    expect(imp.status).toBe(201);
    // same file again: no duplicate source
    expect((await call("POST", "/law/admin/timetable/import-csv", { token: admin, body: { season: "AUTOMNE", csv: CSV1 } })).body.unchanged).toBe(true);
    expect(await tmp.client.lawTimetableSource.count()).toBe(1);

    const cat = () => call("GET", "/law/timetable/catalog?facultyCode=FSJES_AIN_CHOCK&semester=S3&track=PRIVE&language=AR", { token: s.token });
    expect((await cat()).body.groupCodes).toEqual([]); // staged, not published
    expect((await call("PUT", "/law/timetable/subscription", { token: s.token, body: sub })).status).toBe(400);
    expect((await call("GET", `/law/admin/timetable/staging/${imp.body.source.id}`, { token: s.token })).status).toBe(403);
    const st = await call("GET", `/law/admin/timetable/staging/${imp.body.source.id}`, { token: admin });
    expect(st.body.rows).toHaveLength(3);
    expect(st.body.diff).toMatchObject({ added: 3, removed: 0, changed: 0 });

    expect((await call("POST", `/law/admin/timetable/staging/${imp.body.source.id}/publish`, { token: admin })).status).toBe(200);
    expect((await cat()).body.groupCodes).toEqual(["G01", "G02"]);
  });

  test("a new version replaces the scope atomically; the diff reports added/removed/changed", async () => {
    const admin = await adminToken();
    await publish(admin, CSV1);
    const v2 = H +
      "S3,PRIVE,AR,G01,1,11:00,13:15,القانون الجنائي الخاص,COURS,9,ELYOUSFI\n" + // room changed
      "S3,PRIVE,AR,G03,3,08:30,10:45,المالية العامة,COURS,1B,LFTOUHI\n"; // new group; G02 + Tuesday course disappear
    const imp = await call("POST", "/law/admin/timetable/import-csv", { token: admin, body: { season: "AUTOMNE", csv: v2 } });
    const st = await call("GET", `/law/admin/timetable/staging/${imp.body.source.id}`, { token: admin });
    expect(st.body.diff).toMatchObject({ added: 1, removed: 2, changed: 1 });
    await call("POST", `/law/admin/timetable/staging/${imp.body.source.id}/publish`, { token: admin });
    const rows = await tmp.client.lawFdcSession.findMany({ where: { published: true } });
    expect(rows.map((r) => r.groupCode).sort()).toEqual(["G01", "G03"]);
    expect(rows.find((r) => r.groupCode === "G01").room).toBe("9");
  });
});

describe("publish keeps students' work", () => {
  test("republishing remaps overrides to the new rows; vanished sessions drop their overrides; merge keeps the rest; superseded sources can be re-staged", async () => {
    const admin = await adminToken();
    await publish(admin, CSV1);
    const a = await signUp("سلمى", "a@example.ma");
    await call("PUT", "/law/timetable/subscription", { token: a.token, body: sub });
    const w = (await call("GET", `/law/timetable/me?weekStart=${WEEK}`, { token: a.token })).body;
    const [mon, tue] = w.items;
    await call("POST", "/law/timetable/overrides", { token: a.token, body: { type: "CANCEL", sessionId: mon.sessionId, date: "2026-10-05" } });
    await call("POST", "/law/timetable/overrides", { token: a.token, body: { type: "EDIT", sessionId: tue.sessionId, data: { room: "Mine" } } });

    // v2: the Monday course keeps its key (room changed upstream), the Tuesday course disappears
    const v2 = H + "S3,PRIVE,AR,G01,1,11:00,13:15,القانون الجنائي الخاص,COURS,9,ELYOUSFI\n";
    const id2 = await publish(admin, v2);
    const w2 = (await call("GET", `/law/timetable/me?weekStart=${WEEK}`, { token: a.token })).body;
    expect(w2.items).toHaveLength(1);
    expect(w2.items[0]).toMatchObject({ room: "9", cancelled: true, source: "override" }); // the cancel followed the course
    expect(await tmp.client.lawTimetableOverride.count()).toBe(1); // the orphan EDIT was removed, nothing piles up
    expect((await tmp.client.lawTimetableSource.findFirst({ where: { status: "SUPERSEDED" } }))).toBeTruthy();

    // merge: a supplement CSV adds one row without wiping the published scope
    const supp = H + "S3,PRIVE,AR,G01,3,08:30,10:45,المسؤولية المدنية,COURS,3,BENKADDOUR\n";
    const imp = await call("POST", "/law/admin/timetable/import-csv", { token: admin, body: { season: "AUTOMNE", csv: supp } });
    expect((await call("POST", `/law/admin/timetable/staging/${imp.body.source.id}/publish`, { token: admin, body: { mode: "merge" } })).body.mode).toBe("merge");
    expect(await tmp.client.lawFdcSession.count({ where: { published: true, groupCode: "G01" } })).toBe(2);
    expect((await call("POST", `/law/admin/timetable/staging/${imp.body.source.id}/publish`, { token: admin, body: { mode: "x" } })).status).toBe(400);

    // the superseded v1 can be brought back: same bytes, 0 live rows => re-staged, not "unchanged"
    const again = await call("POST", "/law/admin/timetable/import-csv", { token: admin, body: { season: "AUTOMNE", csv: CSV1 } });
    expect(again.body.unchanged).toBe(false);
    expect((await call("GET", `/law/admin/timetable/staging/${again.body.source.id}`, { token: admin })).body.rows).toHaveLength(3);
    void id2;
  });

  test("overrides are idempotent per (session, date, type); MOVE needs a date; EDIT date must match the weekday", async () => {
    const admin = await adminToken();
    await publish(admin, CSV1);
    const a = await signUp("سلمى", "a@example.ma");
    await call("PUT", "/law/timetable/subscription", { token: a.token, body: sub });
    const mon = (await call("GET", `/law/timetable/me?weekStart=${WEEK}`, { token: a.token })).body.items[0];
    const body = { type: "CANCEL", sessionId: mon.sessionId, date: "2026-10-05" };
    expect((await call("POST", "/law/timetable/overrides", { token: a.token, body })).status).toBe(201);
    expect((await call("POST", "/law/timetable/overrides", { token: a.token, body })).status).toBe(200); // second tap: no duplicate
    expect(await tmp.client.lawTimetableOverride.count()).toBe(1);
    expect((await call("POST", "/law/timetable/overrides", { token: a.token, body: { type: "MOVE", sessionId: mon.sessionId, data: { newDate: "2026-10-07" } } })).status).toBe(400);
    expect((await call("POST", "/law/timetable/overrides", { token: a.token, body: { type: "EDIT", sessionId: mon.sessionId, date: "2026-10-06", data: { room: "x" } } })).status).toBe(400);
  });
});

describe("fetcher safety", () => {
  test("only same-origin https PDFs are ever requested; malformed hrefs do not crash the listing", () => {
    const { listLawPdfs, sameOriginHttps } = require("../../utils/law/timetable/fetchSources");
    const html = [
      'href="Emp/2026-2027/Automne26/SEMESTRE%203%20DROIT%20PRIVE%20EN%20ARABE.pdf"',
      'href="http://127.0.0.1/Automne/SEMESTRE 3 DROIT PRIVE EN ARABE.pdf"',
      'href="https://evil.example/Automne/SEMESTRE 3 DROIT PRIVE EN ARABE.pdf"',
      'href="http://www.fdc.ma/Automne/SEMESTRE 3 DROIT PRIVE EN ARABE.pdf"',
      'href="//169.254.169.254/Automne/SEMESTRE 3 DROIT PRIVE EN ARABE.pdf"',
      'href="Emp/Automne26/SEMESTRE%20%E0%DROIT%20PRIVE%20EN%20ARABE.pdf"',
    ].join(" ");
    const urls = listLawPdfs(html, "https://www.fdc.ma/FDC/emploiFDC/emplois_temps.php", "AUTOMNE");
    expect(urls).toEqual(["https://www.fdc.ma/FDC/emploiFDC/Emp/2026-2027/Automne26/SEMESTRE%203%20DROIT%20PRIVE%20EN%20ARABE.pdf"]);
    expect(sameOriginHttps("https://www.fdc.ma.evil.com/x", "https://www.fdc.ma/a")).toBe(false);
  });
});

describe("student week", () => {
  test("subscription -> week; cancel / edit / move / add overrides; isolation and ownership", async () => {
    const admin = await adminToken();
    await publish(admin, CSV1);
    const a = await signUp("سلمى", "a@example.ma");
    const b = await signUp("يوسف", "b@example.ma");
    expect((await call("PUT", "/law/timetable/subscription", { token: a.token, body: { ...sub, groupCode: "G09" } })).status).toBe(400);
    expect((await call("PUT", "/law/timetable/subscription", { token: a.token, body: sub })).status).toBe(200);
    await call("PUT", "/law/timetable/subscription", { token: b.token, body: { ...sub, groupCode: "G02" } });

    const w = (await call("GET", `/law/timetable/me?weekStart=${WEEK}`, { token: a.token })).body;
    expect(w.weekStart).toBe(WEEK);
    expect(w.items.map((i) => [i.date, i.startTime, i.source])).toEqual([["2026-10-05", "11:00", "official"], ["2026-10-06", "13:30", "official"]]);
    // a mid-week date normalizes to its Monday
    expect((await call("GET", "/law/timetable/me?weekStart=2026-10-08", { token: a.token })).body.weekStart).toBe(WEEK);

    const monday = w.items[0];
    // CANCEL this week only
    const c = await call("POST", "/law/timetable/overrides", { token: a.token, body: { type: "CANCEL", sessionId: monday.sessionId, date: "2026-10-05" } });
    expect(c.status).toBe(201);
    // CANCEL date must match the session's weekday
    expect((await call("POST", "/law/timetable/overrides", { token: a.token, body: { type: "CANCEL", sessionId: monday.sessionId, date: "2026-10-06" } })).status).toBe(400);
    // EDIT room recurring on the Tuesday course
    const tue = w.items[1];
    const e = await call("POST", "/law/timetable/overrides", { token: a.token, body: { type: "EDIT", sessionId: tue.sessionId, data: { room: "Amphi 3" } } });
    // MOVE nothing-to-do is invalid; a real MOVE of Monday's course (already cancelled that date) to Wednesday works on another date
    expect((await call("POST", "/law/timetable/overrides", { token: a.token, body: { type: "MOVE", sessionId: tue.sessionId, date: "2026-10-06", data: {} } })).status).toBe(400);
    const mv = await call("POST", "/law/timetable/overrides", { token: a.token, body: { type: "MOVE", sessionId: tue.sessionId, date: "2026-10-13", data: { newDate: "2026-10-14", startTime: "16:00", endTime: "18:15" } } });
    expect(mv.status).toBe(201);
    // ADD a catch-up session
    const add = await call("POST", "/law/timetable/overrides", { token: a.token, body: { type: "ADD", date: "2026-10-07", data: { subject: "تدارك", startTime: "17:00", endTime: "18:00" } } });
    expect(add.status).toBe(201);

    const w2 = (await call("GET", `/law/timetable/me?weekStart=${WEEK}`, { token: a.token })).body;
    const byKey = Object.fromEntries(w2.items.map((i) => [i.date + i.startTime, i]));
    expect(byKey["2026-10-0511:00"]).toMatchObject({ cancelled: true, source: "override", overrideType: "CANCEL" });
    expect(byKey["2026-10-0613:30"]).toMatchObject({ room: "Amphi 3", source: "override" });
    expect(byKey["2026-10-0613:30"].cancelled).toBeUndefined();
    expect(byKey["2026-10-0717:00"]).toMatchObject({ source: "custom", subject: "تدارك" });
    // the one-off cancel does not touch next week; the recurring room edit does
    const next = (await call("GET", "/law/timetable/me?weekStart=2026-10-12", { token: a.token })).body;
    expect(next.items.find((i) => i.startTime === "11:00").cancelled).toBeUndefined();
    expect(next.items.find((i) => i.date === "2026-10-13").room).toBe("Amphi 3");
    // the move shows the course on Wednesday 14th and marks the original slot
    const mvItem = next.items.find((i) => i.date === "2026-10-14");
    expect(mvItem).toMatchObject({ startTime: "16:00", movedFrom: "2026-10-13" });
    expect(next.items.find((i) => i.date === "2026-10-13" && i.startTime === "13:30")).toMatchObject({ cancelled: true });

    // B sees none of A's overrides and cannot touch them
    const wb = (await call("GET", `/law/timetable/me?weekStart=${WEEK}`, { token: b.token })).body;
    expect(wb.items.every((i) => i.source === "official")).toBe(true);
    expect((await call("DELETE", `/law/timetable/overrides/${c.body.override.id}`, { token: b.token })).status).toBe(404);
    expect((await call("PATCH", `/law/timetable/overrides/${e.body.override.id}`, { token: b.token, body: { data: { room: "x" } } })).status).toBe(404);
    // B cannot override a session outside their group
    expect((await call("POST", "/law/timetable/overrides", { token: b.token, body: { type: "CANCEL", sessionId: monday.sessionId, date: "2026-10-05" } })).status).toBe(404);
    // A can undo
    expect((await call("DELETE", `/law/timetable/overrides/${c.body.override.id}`, { token: a.token })).status).toBe(200);
    expect((await call("GET", `/law/timetable/me?weekStart=${WEEK}`, { token: a.token })).body.items[0].cancelled).toBeUndefined();
    // offline-queue replay is idempotent: the same clientOpId never creates a second override
    const op = { type: "CANCEL", sessionId: tue.sessionId, date: "2026-10-06", clientOpId: "op-1" };
    const first = await call("POST", "/law/timetable/overrides", { token: a.token, body: op });
    const again = await call("POST", "/law/timetable/overrides", { token: a.token, body: op });
    expect([first.status, again.status]).toEqual([201, 200]);
    expect(again.body.override.id).toBe(first.body.override.id);
    expect(await tmp.client.lawTimetableOverride.count({ where: { clientOpId: "op-1" } })).toBe(1);
    // validation
    for (const bad of [{ type: "EDIT", sessionId: tue.sessionId, data: { startTime: "25:00" } }, { type: "EDIT", sessionId: tue.sessionId, data: { evil: 1 } }, { type: "ADD", data: { subject: "x" } }, { type: "NUKE" }])
      expect((await call("POST", "/law/timetable/overrides", { token: a.token, body: bad })).status).toBe(400);
  });

  test("no subscription: an empty week, not an error", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const w = await call("GET", `/law/timetable/me?weekStart=${WEEK}`, { token: a.token });
    expect(w.status).toBe(200);
    expect(w.body).toMatchObject({ subscription: null, items: [] });
    expect((await call("GET", "/law/timetable/me", {})).status).toBe(401);
  });
});

describe("admin fetch job (offline fake of www.fdc.ma)", () => {
  test("stages parsed PDFs, skips unchanged ones on the second run, reports failures", async () => {
    const admin = await adminToken();
    const dir = pathMod.join(__dirname, "../fixtures/fdc");
    const index = fs.readFileSync(pathMod.join(dir, "index-automne.html"), "utf8");
    const pdfs = {
      "SEMESTRE%203%20DROIT%20PRIVE%20%20EN%20ARABE.pdf": "s3_prive_ar.pdf",
      "SEMESTRE%203%20DROIT%20PRIVE%20%20EN%20FRANCAIS.pdf": "s3_prive_fr.pdf",
    };
    let hits = [];
    setFdcFetch(async (url) => {
      hits.push(url);
      if (url.includes("emplois_temps.php")) return { ok: true, status: 200, text: async () => index };
      const f = Object.entries(pdfs).find(([k]) => url.endsWith(k));
      if (!f) return { ok: false, status: 404 };
      const buf = fs.readFileSync(pathMod.join(dir, f[1]));
      return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    });
    try {
      const r1 = await call("POST", "/law/admin/timetable/fetch", { token: admin, body: { season: "AUTOMNE" } });
      expect(r1.status).toBe(200);
      const staged = r1.body.results.filter((x) => x.status === "staged");
      expect(staged.map((x) => x.rows).sort((a, b) => a - b)).toEqual([7, 21]);
      expect(r1.body.results.filter((x) => x.status === "failed").length).toBeGreaterThan(0); // the other PDFs 404 in the fake
      expect(hits.some((u) => /ECON|GESTION|BUSINESS/i.test(u))).toBe(false); // never even requested
      expect(await tmp.client.lawFdcSession.count({ where: { published: true } })).toBe(0); // staged only
      const r2 = await call("POST", "/law/admin/timetable/fetch", { token: admin, body: { season: "AUTOMNE" } });
      expect(r2.body.results.filter((x) => x.status === "unchanged")).toHaveLength(2);
      expect(await tmp.client.lawTimetableSource.count({ where: { status: "STAGED" } })).toBe(2);
    } finally {
      setFdcFetch(undefined);
    }
  });
});
