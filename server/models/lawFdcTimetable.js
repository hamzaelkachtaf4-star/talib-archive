// Phase 5: official faculty timetables (staged -> admin-reviewed -> published), per-student subscription and the
// merged weekly view (published sessions + the student's overrides). Global tables use rawDb with explicit
// userId filters (same pattern as lawPreferences.js); students only ever read published rows.
const crypto = require("crypto");
const { rawDb } = require("../utils/law/dbClient");
const { addDays, isDateStr, weekStart, weekdayOf, localDate } = require("../utils/law/time");
const { parseTimetableCsv } = require("../utils/law/timetable/csv");

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SEASONS = ["AUTOMNE", "PRINTEMPS"];
const OVERRIDE_TYPES = ["CANCEL", "MOVE", "EDIT", "ADD"];
const EDITABLE = ["startTime", "endTime", "room", "professor", "subject", "note", "newDate", "dayOfWeek"];
const key = (r) => [r.semester, r.track, r.language, r.parcours || "", r.groupCode, r.dayOfWeek, r.startTime, r.subject].join("|");
const scopeKey = (r) => [r.semester, r.track, r.language].join("|");
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

function validateOverrideData(type, data, date) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "invalid_data" };
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (!EDITABLE.includes(k)) return { error: "invalid_data" };
    if (["startTime", "endTime"].includes(k) && !TIME_RE.test(v)) return { error: "invalid_time" };
    if (k === "newDate" && !isDateStr(v)) return { error: "invalid_date" };
    if (k === "dayOfWeek" && !(Number.isInteger(v) && v >= 1 && v <= 7)) return { error: "invalid_day" };
    if (["room", "professor", "subject", "note"].includes(k) && (typeof v !== "string" || v.length > 200)) return { error: "invalid_data" };
    out[k] = v;
  }
  if (out.startTime && out.endTime && out.endTime <= out.startTime) return { error: "invalid_time" };
  if (type === "ADD") {
    if (!out.subject || !out.startTime || !out.endTime) return { error: "invalid_data" };
    if (!date && !out.dayOfWeek) return { error: "invalid_day" };
  }
  if (type === "MOVE" && !out.newDate && !out.startTime && !out.endTime) return { error: "invalid_data" };
  if (type === "CANCEL") return { data: {} };
  return { data: out };
}

const LawFdcTimetable = {
  /** Stage rows from any source (PDF parse or CSV). Never published here. */
  stage: async function ({ facultyCode, season, url, sha256, rows, parseLog }) {
    if (!SEASONS.includes(season)) return { error: "invalid_season" };
    const db = rawDb();
    const existing = await db.lawTimetableSource.findUnique({ where: { url_sha256: { url, sha256 } } });
    let source = existing;
    if (existing && (await db.lawFdcSession.count({ where: { sourceId: existing.id } })) > 0) return { source: existing, unchanged: true, error: null };
    if (existing) {
      // Same bytes as a source that was superseded (its rows are gone): re-stage it so the admin can bring it back.
      if (!rows.length) return { source: existing, unchanged: true, error: null };
      source = await db.lawTimetableSource.update({ where: { id: existing.id }, data: { status: "STAGED", parseLog: parseLog || existing.parseLog } });
    } else {
      source = await db.lawTimetableSource.create({
        data: { facultyCode, season, url, sha256, status: rows.length ? "STAGED" : "FAILED", parseLog: parseLog || null },
      });
    }
    if (rows.length)
      // Prisma 5.3 has no createMany on SQLite: one transaction of creates.
      await db.$transaction(rows.map((r) => db.lawFdcSession.create({ data: { ...r, parcours: r.parcours || "", sourceId: source.id, facultyCode, published: false } })));
    return { source, unchanged: false, error: null };
  },

  importCsv: async function ({ facultyCode, season, csv, url }) {
    if (!(await rawDb().lawFaculty.findUnique({ where: { code: String(facultyCode) } }))) {
      await require("./lawOnboarding").LawOnboarding.ensureSeed();
      if (!(await rawDb().lawFaculty.findUnique({ where: { code: String(facultyCode) } }))) return { error: "invalid_faculty" };
    }
    const parsed = parseTimetableCsv(csv);
    if (parsed.errors) return { error: "invalid_csv", details: parsed.errors };
    const hash = sha(csv);
    return this.stage({ facultyCode, season, url: url || `csv:${hash.slice(0, 16)}`, sha256: hash, rows: parsed.rows, parseLog: `csv import: ${parsed.rows.length} rows` });
  },

  sources: async function () {
    return rawDb().lawTimetableSource.findMany({ orderBy: { fetchedAt: "desc" }, take: 50 });
  },

  /** Staged rows plus a diff against what students currently see for the same (semester, track, language) scopes. */
  staging: async function (sourceId) {
    const db = rawDb();
    const source = await db.lawTimetableSource.findUnique({ where: { id: sourceId } });
    if (!source) return { error: "not_found" };
    const staged = await db.lawFdcSession.findMany({ where: { sourceId }, orderBy: [{ semester: "asc" }, { groupCode: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }] });
    const scopes = [...new Set(staged.map(scopeKey))];
    const published = (await db.lawFdcSession.findMany({ where: { facultyCode: source.facultyCode, published: true } })).filter((r) => scopes.includes(scopeKey(r)));
    const pub = new Map(published.map((r) => [key(r), r]));
    const stg = new Map(staged.map((r) => [key(r), r]));
    const added = staged.filter((r) => !pub.has(key(r)));
    const removed = published.filter((r) => !stg.has(key(r)));
    const changed = staged.filter((r) => {
      const o = pub.get(key(r));
      return o && (o.endTime !== r.endTime || o.room !== r.room || o.professor !== r.professor);
    });
    return { source, rows: staged, diff: { added: added.length, removed: removed.length, changed: changed.length, addedRows: added, removedRows: removed, changedRows: changed } };
  },

  /**
   * Atomic publish. mode "replace" (default): for each (semester, track, language) scope in the source, the source's rows
   * replace every previously published row of that scope. mode "merge": only rows with the same natural key are replaced
   * (a supplement CSV adds/fixes a few rows without wiping the PDF's). Students' overrides follow their session to the
   * new row by natural key inside the same transaction; overrides whose session no longer exists are removed.
   */
  publish: async function (sourceId, { mode = "replace" } = {}) {
    if (!["replace", "merge"].includes(mode)) return { error: "invalid_mode" };
    const db = rawDb();
    const source = await db.lawTimetableSource.findUnique({ where: { id: sourceId } });
    if (!source) return { error: "not_found" };
    if (source.status === "FAILED") return { error: "nothing_to_publish" };
    const staged = await db.lawFdcSession.findMany({ where: { sourceId } });
    const scopes = [...new Map(staged.map((r) => [scopeKey(r), r])).values()];
    const stagedByKey = new Map(staged.map((r) => [key(r), r]));
    const old = (await db.lawFdcSession.findMany({ where: { facultyCode: source.facultyCode, published: true, NOT: { sourceId } } })).filter((r) => scopes.some((s) => scopeKey(s) === scopeKey(r)));
    const doomed = mode === "merge" ? old.filter((r) => stagedByKey.has(key(r))) : old;
    const ops = [];
    if (doomed.length) {
      const overrides = await db.lawTimetableOverride.findMany({ where: { sessionId: { in: doomed.map((r) => r.id) } }, select: { id: true, sessionId: true } });
      const byId = new Map(doomed.map((r) => [r.id, r]));
      for (const o of overrides) {
        const target = stagedByKey.get(key(byId.get(o.sessionId)));
        ops.push(target ? db.lawTimetableOverride.update({ where: { id: o.id }, data: { sessionId: target.id } }) : db.lawTimetableOverride.delete({ where: { id: o.id } }));
      }
      ops.push(db.lawFdcSession.deleteMany({ where: { id: { in: doomed.map((r) => r.id) } } }));
    }
    ops.push(db.lawFdcSession.updateMany({ where: { sourceId }, data: { published: true } }));
    ops.push(db.lawTimetableSource.update({ where: { id: sourceId }, data: { status: "PUBLISHED" } }));
    await db.$transaction(ops);
    // Sources that lost all their rows are SUPERSEDED (never again shown as live).
    const others = await db.lawTimetableSource.findMany({ where: { facultyCode: source.facultyCode, status: "PUBLISHED", NOT: { id: sourceId } }, select: { id: true } });
    for (const o of others)
      if (!(await db.lawFdcSession.count({ where: { sourceId: o.id } }))) await db.lawTimetableSource.update({ where: { id: o.id }, data: { status: "SUPERSEDED" } });
    return { published: staged.length, mode, error: null };
  },

  catalog: async function ({ facultyCode, semester, track, language }) {
    const rows = await rawDb().lawFdcSession.findMany({ where: { facultyCode, semester, track, language, published: true }, select: { groupCode: true, parcours: true } });
    const uniq = (a) => [...new Set(a)].sort();
    return { groupCodes: uniq(rows.map((r) => r.groupCode)), parcours: uniq(rows.map((r) => r.parcours).filter(Boolean)) };
  },

  getSubscription: (userId) => rawDb().lawTimetableSubscription.findUnique({ where: { userId } }),

  subscribe: async function (userId, b = {}) {
    const need = { facultyCode: "string", semester: "string", track: "string", language: "string", groupCode: "string" };
    for (const k of Object.keys(need)) if (typeof b[k] !== "string" || !b[k]) return { error: `invalid_${k}` };
    const parcours = typeof b.parcours === "string" ? b.parcours : "";
    const exists = await rawDb().lawFdcSession.count({ where: { facultyCode: b.facultyCode, semester: b.semester, track: b.track, language: b.language, groupCode: b.groupCode, parcours, published: true } });
    if (!exists) return { error: "unknown_group" };
    const data = { facultyCode: b.facultyCode, semester: b.semester, track: b.track, language: b.language, groupCode: b.groupCode, parcours };
    const subscription = await rawDb().lawTimetableSubscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return { subscription, error: null };
  },

  unsubscribe: (userId) => rawDb().lawTimetableSubscription.deleteMany({ where: { userId } }),

  /** The student's week: published sessions of their group, merged with their overrides. */
  week: async function (userId, weekStartStr) {
    const sub = await this.getSubscription(userId);
    const ws = weekStart(isDateStr(weekStartStr) ? weekStartStr : localDate(new Date()));
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    const overrides = (await rawDb().lawTimetableOverride.findMany({ where: { userId } })).map((o) => ({ ...o, data: JSON.parse(o.data) }));
    const sessions = sub
      ? await rawDb().lawFdcSession.findMany({
          where: { facultyCode: sub.facultyCode, semester: sub.semester, track: sub.track, language: sub.language, groupCode: sub.groupCode, parcours: sub.parcours, published: true },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        })
      : [];
    const items = [];
    const forSession = (sid, date) => overrides.filter((o) => o.sessionId === sid && (o.date === date || o.date === null));
    for (const s of sessions) {
      const date = days[s.dayOfWeek - 1];
      let item = { id: `${s.id}@${date}`, sessionId: s.id, date, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, subject: s.subject, kind: s.kind, room: s.room, professor: s.professor, source: "official" };
      for (const o of forSession(s.id, date)) {
        item.source = "override";
        item.overrideId = o.id;
        item.overrideType = o.type;
        if (o.type === "CANCEL") item.cancelled = true;
        else if (o.type === "MOVE" && o.data.newDate) {
          // The original slot stays as it was (marked moved); the moved copy carries the new time/room.
          const { newDate, note, ...fields } = o.data;
          item.cancelled = true;
          item.movedTo = newDate;
          if (days.includes(newDate))
            items.push({ ...item, ...fields, note, id: `${s.id}@${newDate}`, date: newDate, dayOfWeek: weekdayOf(newDate), cancelled: false, movedTo: undefined, movedFrom: date });
        } else {
          const { newDate, note, ...fields } = o.data;
          Object.assign(item, fields);
          if (note) item.note = note;
        }
      }
      items.push(item);
    }
    for (const o of overrides.filter((x) => x.type === "ADD")) {
      const date = o.date || days[(o.data.dayOfWeek || 1) - 1];
      if (!days.includes(date)) continue;
      items.push({ id: `custom:${o.id}@${date}`, sessionId: null, date, dayOfWeek: weekdayOf(date), startTime: o.data.startTime, endTime: o.data.endTime, subject: o.data.subject, kind: "COURS", room: o.data.room || null, professor: o.data.professor || null, source: "custom", overrideId: o.id, note: o.data.note });
    }
    items.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    return { weekStart: ws, subscription: sub, items };
  },

  createOverride: async function (userId, b = {}) {
    if (!OVERRIDE_TYPES.includes(b.type)) return { error: "invalid_type" };
    if (b.date != null && !isDateStr(b.date)) return { error: "invalid_date" };
    const date = b.date ?? null;
    const v = validateOverrideData(b.type, b.data ?? {}, date);
    if (v.error) return { error: v.error };
    if (b.type === "MOVE" && !date) return { error: "invalid_date" }; // a move is always a one-off
    let sessionId = null;
    if (b.type !== "ADD") {
      const sub = await this.getSubscription(userId);
      const s = sub && b.sessionId ? await rawDb().lawFdcSession.findFirst({ where: { id: String(b.sessionId), facultyCode: sub.facultyCode, semester: sub.semester, track: sub.track, language: sub.language, groupCode: sub.groupCode, parcours: sub.parcours, published: true } }) : null;
      if (!s) return { error: "unknown_session" };
      sessionId = s.id;
      if (date && weekdayOf(date) !== s.dayOfWeek) return { error: "date_mismatch" };
    }
    const clientOpId = typeof b.clientOpId === "string" && b.clientOpId.length <= 64 ? b.clientOpId : null;
    if (clientOpId) {
      const dup = await rawDb().lawTimetableOverride.findUnique({ where: { userId_clientOpId: { userId, clientOpId } } });
      if (dup) return { override: { ...dup, data: JSON.parse(dup.data) }, replayed: true, error: null };
    }
    if (sessionId) {
      // one override per (session, date, type): repeating the action updates it instead of stacking duplicates
      const same = await rawDb().lawTimetableOverride.findFirst({ where: { userId, sessionId, type: b.type, date } });
      if (same) {
        const upd = await rawDb().lawTimetableOverride.update({ where: { id: same.id }, data: { data: JSON.stringify(v.data) } });
        return { override: { ...upd, data: v.data }, replayed: true, error: null };
      }
    }
    try {
      const row = await rawDb().lawTimetableOverride.create({ data: { userId, sessionId, type: b.type, date, data: JSON.stringify(v.data), clientOpId } });
      return { override: { ...row, data: v.data }, error: null };
    } catch (e) {
      if (e.code === "P2002" && clientOpId) { // concurrent replay of the same op
        const dup = await rawDb().lawTimetableOverride.findUnique({ where: { userId_clientOpId: { userId, clientOpId } } });
        if (dup) return { override: { ...dup, data: JSON.parse(dup.data) }, replayed: true, error: null };
      }
      throw e;
    }
  },

  updateOverride: async function (userId, id, b = {}) {
    const row = await rawDb().lawTimetableOverride.findFirst({ where: { id, userId } });
    if (!row) return { error: "not_found" };
    const v = validateOverrideData(row.type, b.data ?? JSON.parse(row.data), row.date);
    if (v.error) return { error: v.error };
    const updated = await rawDb().lawTimetableOverride.update({ where: { id }, data: { data: JSON.stringify(v.data) } });
    return { override: { ...updated, data: v.data }, error: null };
  },

  deleteOverride: async function (userId, id) {
    const r = await rawDb().lawTimetableOverride.deleteMany({ where: { id, userId } });
    return r.count ? { error: null } : { error: "not_found" };
  },
};

module.exports = { LawFdcTimetable };
