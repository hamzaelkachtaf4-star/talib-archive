// Phase 6 acceptance (spec §11): a new BO item appears in the Inbox without entering the corpus; the
// scraper respects the interval and stops on errors; the Sunday recap arrives as a push.
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { db } = require("../../utils/law/dbClient");
const { closeFts } = require("../../utils/law/fts");
const { scanAll, setRadarConfig, extractItems } = require("../../utils/law/radar/scraper");
const { resetPoliteFetch } = require("../../utils/law/radar/politeFetch");
const { LawRadar } = require("../../models/lawRadar");
const { LawInbox } = require("../../models/lawInbox");
const { LawRecap } = require("../../models/lawRecap");
const { LawTimetable } = require("../../models/lawTimetable");
const { LawSubject } = require("../../models/lawSubject");
const { LawSetting } = require("../../models/lawSetting");
const scheduler = require("../../utils/law/scheduler");
const push = require("../../utils/law/push");
const worker = require("../../utils/law/worker");
const { localDate, localTime, weekdayOf } = require("../../utils/law/time");

jest.setTimeout(60000);
const PDF = (() => {
  const dir = path.join(__dirname, "../../node_modules/pdf-parse/test/data");
  return fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".pdf"))));
})();

let tmp;
let storage;
let site;
let hits;
let mode;
const ENV = process.env;

function startSite() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      hits.push({ url: req.url, at: Date.now(), ua: req.headers["user-agent"] });
      if (req.url === "/new_releases") {
        if (mode === "error") {
          res.writeHead(500);
          return res.end("boom");
        }
        if (mode === "notmodified" && req.headers["if-none-match"] === '"v1"') {
          res.writeHead(304);
          return res.end();
        }
        res.writeHead(200, { "Content-Type": "text/html", ETag: '"v1"' });
        return res.end(`<html><body>
          <a href="/api/uploads/2026/10/09/%D9%82%D8%B1%D8%A7%D8%B1.pdf#toolbar=0">إقرأ الآن</a>
          <a href="/api/uploads/2026/10/10/bo-7450.pdf">الجريدة الرسمية عدد 7450</a>
          <a href="/api/uploads/2026/10/10/bo-7450.pdf#toolbar=0">إقرأ الآن</a>
          <a href="/api/uploads/2026/10/10/eg.pdf">مشروع قانون الأسرة المصري</a>
          <a href="/about">عن الموقع</a>
        </body></html>`);
      }
      if (req.url.startsWith("/api/uploads/")) {
        res.writeHead(200, { "Content-Type": "application/pdf" });
        return res.end(PDF);
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

beforeEach(async () => {
  storage = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-radar-"));
  process.env = { ...ENV, STORAGE_DIR: storage, RADAR_ALLOW_PRIVATE: "true", RADAR_ALLOWED_HOSTS: "127.0.0.1" };
  tmp = await createTempDb();
  hits = [];
  mode = "ok";
  site = await startSite();
  resetPoliteFetch();
  setRadarConfig({
    ignorePatterns: ["المصري"],
    sources: [{ id: "fake-adala", origin: "adala", label: "موقع تجريبي", url: `${site.url}/new_releases`, linkSelector: "a[href]", linkPattern: "/api/uploads/\\d{4}/\\d{2}/\\d{2}/.+\\.pdf", enabled: true }],
  });
});
afterEach(async () => {
  setRadarConfig(null);
  push.setPushSender(null);
  closeFts();
  site.server.close();
  await tmp.cleanup();
  process.env = ENV;
  fs.rmSync(storage, { recursive: true, force: true });
});

describe("radar scanner (acceptance)", () => {
  test("new BO items reach the Inbox, never the corpus; deduped; Egyptian drafts ignored", async () => {
    const report = await scanAll({ minIntervalMs: 0 });
    expect(report[0]).toMatchObject({ status: "scanned", newItems: 2 });
    const inbox = await LawInbox.items();
    expect(inbox.newSources.map((s) => s.title).sort()).toEqual(["الجريدة الرسمية عدد 7450", "قرار"]);
    expect(await db().lawArticle.count()).toBe(0);
    expect(await db().lawCorpusImport.count()).toBe(0);
    expect(hits.every((h) => h.ua.startsWith("LAW-OS/"))).toBe(true);
    // Only the listing page was fetched: no document downloads during a scan.
    expect(hits.map((h) => h.url)).toEqual(["/new_releases"]);
    // Same page again → unchanged, nothing new.
    const again = await scanAll({ minIntervalMs: 0 });
    expect(again[0]).toMatchObject({ newItems: 0 });
    expect(await db().lawSourceDocument.count()).toBe(2);
  });

  test("respects the minimum interval between requests", async () => {
    await scanAll({ minIntervalMs: 400 });
    await scanAll({ minIntervalMs: 400 });
    await scanAll({ minIntervalMs: 400 });
    const gaps = hits.slice(1).map((h, i) => h.at - hits[i].at);
    expect(gaps.every((g) => g >= 380)).toBe(true);
  });

  test("conditional GET: 304 costs nothing", async () => {
    mode = "notmodified";
    await scanAll({ minIntervalMs: 0 });
    const r = await scanAll({ minIntervalMs: 0 });
    expect(r[0].status).toBe("not_modified");
  });

  test("stops after 3 consecutive errors and says so in the Inbox", async () => {
    mode = "error";
    expect((await scanAll({ minIntervalMs: 0 }))[0].status).toBe("error");
    expect((await scanAll({ minIntervalMs: 0 }))[0].status).toBe("error");
    expect((await scanAll({ minIntervalMs: 0 }))[0].status).toBe("disabled_after_errors");
    const before = hits.length;
    expect((await scanAll({ minIntervalMs: 0 }))[0].status).toBe("disabled_after_errors");
    expect(hits.length).toBe(before); // no more requests
    expect((await LawInbox.items()).stoppedSources.map((s) => s.id)).toEqual(["fake-adala"]);
  });

  test("import → downloaded once (hash) → corpus REVIEW session; dismiss", async () => {
    process.env.SCRAPER_MIN_INTERVAL_SECONDS = "10";
    await scanAll({ minIntervalMs: 0 });
    const [a, b] = await db().lawSourceDocument.findMany({ orderBy: { title: "asc" } });
    resetPoliteFetch();
    const r = await LawRadar.importSource(a.id, { codeSlug: "DOC", validFrom: "2026-10-09" });
    expect(r.error).toBeNull();
    expect(r.import.status).toBe("parsing");
    expect((await worker.runOnce()).job.type).toBe("parse_corpus_import");
    expect((await LawInbox.items()).newSources).toHaveLength(1);
    expect(await db().lawArticle.count()).toBe(0); // still only a review session
    expect(await LawRadar.dismissSource(b.id)).toBe(true);
    expect((await LawInbox.items()).newSources).toHaveLength(0);
  });

  test("link extraction keeps absolute, fragment-free, pattern-matching links", () => {
    const items = extractItems('<a href="/api/uploads/2026/01/02/x.pdf#y">t</a><a href="/x.html">n</a>', { url: "https://e.ma/list", linkPattern: "\\.pdf" });
    expect(items).toEqual([{ url: "https://e.ma/api/uploads/2026/01/02/x.pdf", title: "t" }]);
  });
});

describe("reform radar seed", () => {
  test("§3.7 seed: Moudawana is a watch item without content; non-Moroccan rejected", async () => {
    const reforms = await LawRadar.reforms();
    const m = reforms.find((r) => r.seedKey === "moudawana-reform");
    expect(m.status).toBe("watch");
    expect(m.summary).toBeNull();
    expect(reforms.find((r) => r.seedKey === "law-58.25").inForceAt.toISOString().slice(0, 10)).toBe("2026-08-24");
    expect((await LawRadar.createReform({ title: "مشروع", status: "draft", jurisdiction: "EG" })).error).toMatch(/Moroccan/);
    expect((await LawRadar.updateReform(m.id, { summary: "مضمون" })).error).toMatch(/watch/);
    expect((await LawRadar.reforms()).length).toBe(5); // seeding is idempotent
  });
});

/** A UTC instant that is `hh:mm` local time on the given local Sunday/other date (zone-rule agnostic). */
function atLocal(dateStr, hhmm) {
  const base = new Date(`${dateStr}T${hhmm}:00Z`);
  for (let h = -14; h <= 14; h++) {
    const t = new Date(base.getTime() + h * 3600000);
    if (localDate(t) === dateStr && localTime(t) === hhmm) return t;
  }
  throw new Error("no instant");
}

describe("rhythm (acceptance: Sunday recap arrives as push)", () => {
  test("due(): recap Sunday ≥ 20:00 once per week; close-out ≥ 21:00 on timetable days once per day", () => {
    const sunday = "2026-10-11";
    expect(weekdayOf(sunday)).toBe(7);
    expect(scheduler.due(atLocal(sunday, "19:59"))).toEqual([]);
    expect(scheduler.due(atLocal(sunday, "20:01"))).toEqual(["recap"]);
    expect(scheduler.due(atLocal(sunday, "20:30"), { lastRecapWeek: "2026-10-05" })).toEqual([]);
    // FDC refresh: opt-in, Monday >= 03:00 Casablanca, once per week
    const mon = "2026-10-12";
    expect(scheduler.due(atLocal(mon, "03:05"))).toEqual([]);
    expect(scheduler.due(atLocal(mon, "02:55"), {}, { fdcEnabled: true })).toEqual([]);
    expect(scheduler.due(atLocal(mon, "03:05"), {}, { fdcEnabled: true })).toEqual(["fdc"]);
    expect(scheduler.due(atLocal(mon, "03:05"), { lastFdcWeek: mon }, { fdcEnabled: true })).toEqual([]);
    expect(scheduler.due(atLocal("2026-10-13", "03:05"), {}, { fdcEnabled: true })).toEqual([]);
    expect(scheduler.due(atLocal("2026-10-12", "21:05"), {}, { hasSlotsToday: true })).toEqual(["closeout"]);
    expect(scheduler.due(atLocal("2026-10-12", "21:05"), { lastCloseoutDate: "2026-10-12" }, { hasSlotsToday: true })).toEqual([]);
    expect(scheduler.due(atLocal("2026-10-13", "21:05"), {}, { hasSlotsToday: false })).toEqual([]);
  });

  test("Sunday 20:30 → recap job → recap stored → push delivered", async () => {
    const sent = [];
    push.setPushSender(async (sub, payload) => sent.push({ sub, payload: JSON.parse(payload) }));
    await push.subscribe({ subscription: { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } } });
    const { subject } = await LawSubject.create({ name: "الالتزامات" });
    await LawTimetable.replace([{ weekday: 1, startTime: "08:30", endTime: "10:00", subjectId: subject.id }]);

    const now = atLocal("2026-10-11", "20:30");
    expect(await scheduler.tick(now)).toEqual(["recap"]);
    expect(await scheduler.tick(now)).toEqual([]); // once per week
    const o = await worker.runOnce();
    expect([o.job.type, o.status]).toEqual(["weekly_recap", "succeeded"]);
    const recap = await LawRecap.latest();
    expect(recap.weekStart).toBe("2026-10-05");
    expect(recap.content.nextWeek.map((s) => [s.date, s.subject])).toEqual([["2026-10-12", "الالتزامات"]]);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.title).toBe("ملخص الأسبوع");
    expect(sent[0].payload.url).toBe("/law/recap");
  });

  test("close-out push only when the Inbox has items; dead subscriptions are pruned", async () => {
    const sent = [];
    push.setPushSender(async (sub) => {
      if (sub.endpoint.endsWith("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push(sub.endpoint);
    });
    await push.subscribe({ subscription: { endpoint: "https://push.example/live", keys: { p256dh: "p", auth: "a" } } });
    await push.subscribe({ subscription: { endpoint: "https://push.example/gone", keys: { p256dh: "p", auth: "a" } } });
    await LawTimetable.replace([{ weekday: 1, startTime: "08:30", endTime: "10:00" }]);
    await db().lawSourceDocument.create({ data: { origin: "adala", url: "https://x/1.pdf", title: "ب", parseStatus: "new" } });
    expect(await scheduler.tick(atLocal("2026-10-12", "21:10"))).toEqual(["closeout"]);
    expect(sent).toEqual(["https://push.example/live"]);
    expect(await db().lawPushSubscription.count()).toBe(1);
    await LawSetting.setMeta("scheduler", {});
  });
});
