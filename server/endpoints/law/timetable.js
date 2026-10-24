// Phase 5: /api/law/timetable/* (students) and /api/law/admin/timetable/* (staging, publish, imports).
const { reqBody } = require("../../utils/http");
const { auth, admin, handle } = require("./helpers");
const { LawFdcTimetable } = require("../../models/lawFdcTimetable");
const { fetchAndStage } = require("../../utils/law/timetable/fetchSources");
const importers = require("../../utils/law/timetable/importers");
const reminders = require("../../utils/law/reminders");
const { matchSubject } = require("../../utils/law/timetableParse");
const { rawDb } = require("../../utils/law/dbClient");
const rateLimit = require("../../utils/law/rateLimit");

const STATUS = { not_found: 404, unknown_session: 404, unknown_group: 400 };
const fail = (res, error, extra = {}) => res.status(STATUS[error] || 400).json({ error, ...extra });
let fetchImpl; // test seam
const setFdcFetch = (f) => { fetchImpl = f; };

function lawTimetableEndpoints(router) {
  // RC3 Phase 5: file imports (ICS / CSV) give CANDIDATES only; the student reviews them and saves through PUT /law/timetable.
  router.post("/law/timetable/import", auth, handle("tt_import", async (req, res) => {
    const b = reqBody(req);
    const importer = { ics: importers.ics, csv: importers.csv }[b.format];
    if (!importer) return fail(res, "invalid_format");
    if (!(await rateLimit.hit("tt_import", res.locals.lawUser.id, 60))) return res.status(429).json({ error: "rate_limited" });
    const r = importer.parse({ content: b.content });
    if (r.error) return fail(res, r.error, r.missing ? { missing: r.missing } : {});
    const subjects = await rawDb().lawSubject.findMany({ where: { userId: res.locals.lawUser.id, archived: false }, select: { id: true, name: true, nameFr: true, code: true } });
    res.json({ slots: r.slots.map((s) => ({ ...s, subjectId: matchSubject(s.subjectName, subjects)?.id || null })), rejected: r.rejected, warnings: r.warnings, notes: r.notes });
  }));
  router.get("/law/timetable/reminders", auth, handle("tt_rem_get", async (_req, res) => {
    res.json({ prefs: await reminders.getPrefs(res.locals.lawUser.id), minutesOptions: reminders.MINUTES_OPTIONS });
  }));
  router.put("/law/timetable/reminders", auth, handle("tt_rem_put", async (req, res) => {
    const r = await reminders.savePrefs(res.locals.lawUser.id, reqBody(req));
    if (r.error) return fail(res, r.error);
    res.json({ prefs: r.prefs });
  }));
  router.get("/law/timetable/tomorrow", auth, handle("tt_tomorrow", async (_req, res) => {
    res.json(await reminders.tomorrow(res.locals.lawUser.id));
  }));

  router.get("/law/timetable/catalog", auth, handle("tt_catalog", async (req, res) => {
    const { facultyCode, semester, track, language } = req.query;
    if (![facultyCode, semester, track, language].every((v) => typeof v === "string" && v)) return fail(res, "invalid_query");
    res.json(await LawFdcTimetable.catalog({ facultyCode, semester, track, language }));
  }));
  router.get("/law/timetable/subscription", auth, handle("tt_sub_get", async (_req, res) => {
    res.json({ subscription: await LawFdcTimetable.getSubscription(res.locals.lawUser.id) });
  }));
  router.put("/law/timetable/subscription", auth, handle("tt_sub_put", async (req, res) => {
    const r = await LawFdcTimetable.subscribe(res.locals.lawUser.id, reqBody(req));
    if (r.error) return fail(res, r.error);
    res.json({ subscription: r.subscription });
  }));
  router.delete("/law/timetable/subscription", auth, handle("tt_sub_del", async (_req, res) => {
    await LawFdcTimetable.unsubscribe(res.locals.lawUser.id);
    res.json({ ok: true });
  }));
  router.get("/law/timetable/me", auth, handle("tt_week", async (req, res) => {
    res.json(await LawFdcTimetable.week(res.locals.lawUser.id, req.query.weekStart));
  }));
  router.post("/law/timetable/overrides", auth, handle("tt_ov_create", async (req, res) => {
    const r = await LawFdcTimetable.createOverride(res.locals.lawUser.id, reqBody(req));
    if (r.error) return fail(res, r.error);
    res.status(r.replayed ? 200 : 201).json({ override: r.override, replayed: !!r.replayed });
  }));
  router.patch("/law/timetable/overrides/:id", auth, handle("tt_ov_update", async (req, res) => {
    const r = await LawFdcTimetable.updateOverride(res.locals.lawUser.id, req.params.id, reqBody(req));
    if (r.error) return fail(res, r.error);
    res.json({ override: r.override });
  }));
  router.delete("/law/timetable/overrides/:id", auth, handle("tt_ov_delete", async (req, res) => {
    const r = await LawFdcTimetable.deleteOverride(res.locals.lawUser.id, req.params.id);
    if (r.error) return fail(res, r.error);
    res.json({ ok: true });
  }));

  // Admin
  router.get("/law/admin/timetable/sources", admin, handle("tt_sources", async (_req, res) => {
    res.json({ sources: await LawFdcTimetable.sources() });
  }));
  router.post("/law/admin/timetable/import-csv", admin, handle("tt_import_csv", async (req, res) => {
    const b = reqBody(req);
    const r = await LawFdcTimetable.importCsv({ facultyCode: b.facultyCode || "FSJES_AIN_CHOCK", season: b.season, csv: String(b.csv || "") });
    if (r.error) return fail(res, r.error, { details: r.details });
    res.status(r.unchanged ? 200 : 201).json({ source: r.source, unchanged: !!r.unchanged });
  }));
  router.post("/law/admin/timetable/fetch", admin, handle("tt_fetch", async (req, res) => {
    const b = reqBody(req);
    const results = await fetchAndStage({ season: b.season || "AUTOMNE", LawFdcTimetable, ...(fetchImpl ? { fetchImpl } : {}) });
    res.json({ results });
  }));
  router.get("/law/admin/timetable/staging/:sourceId", admin, handle("tt_staging", async (req, res) => {
    const r = await LawFdcTimetable.staging(req.params.sourceId);
    if (r.error) return fail(res, r.error);
    res.json(r);
  }));
  router.post("/law/admin/timetable/staging/:sourceId/publish", admin, handle("tt_publish", async (req, res) => {
    const r = await LawFdcTimetable.publish(req.params.sourceId, { mode: reqBody(req).mode });
    if (r.error) return fail(res, r.error);
    res.json({ published: r.published, mode: r.mode });
  }));
}

module.exports = { lawTimetableEndpoints, setFdcFetch };
