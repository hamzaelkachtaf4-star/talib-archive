// RC3 Phase 5: class reminders. The evening before ("لديك حصة غداً: المادة — القاعة") and, if the student asked for it, N
// minutes before a class. Everything is computed in Africa/Casablanca (no fixed offset). Each reminder is claimed atomically,
// so a tick that runs twice, a restart, or two workers can never send the same reminder twice.
const crypto = require("crypto");
const { rawDb } = require("./dbClient");
const { localDate, localTime, weekdayOf, weekStart, addDays } = require("./time");
const { serialWrite } = require("./writeLock");
const { normalize } = require("./arabic");
const { runAs } = require("./tenant");

const EVENING_FROM = "20:00"; // the default; each student can choose another time
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_OPTIONS = Object.freeze([15, 30, 60, 120]);
const DEFAULT_MINUTES = 30; // "30 minutes before each class" is on until the student turns it off
const DEFAULTS = Object.freeze({ enabled: true, eveningBefore: true, eveningTime: EVENING_FROM, minutesBefore: DEFAULT_MINUTES });

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const presentPrefs = (p) => ({ enabled: p.enabled, eveningBefore: p.eveningBefore, eveningTime: p.eveningTime || EVENING_FROM, minutesBefore: p.minutesBefore });

async function getPrefs(userId) {
  const p = await rawDb().lawReminderPref.findUnique({ where: { userId } });
  return p ? presentPrefs(p) : { ...DEFAULTS };
}

async function savePrefs(userId, b) {
  b = b && typeof b === "object" ? b : {};
  const data = {};
  for (const k of ["enabled", "eveningBefore"]) {
    if (!(k in b)) continue;
    if (typeof b[k] !== "boolean") return { error: "invalid_prefs" };
    data[k] = b[k];
  }
  if ("eveningTime" in b) {
    if (typeof b.eveningTime !== "string" || !TIME_RE.test(b.eveningTime)) return { error: "invalid_prefs" };
    data.eveningTime = b.eveningTime;
  }
  if ("minutesBefore" in b) {
    if (b.minutesBefore !== null && !MINUTES_OPTIONS.includes(b.minutesBefore)) return { error: "invalid_prefs" };
    data.minutesBefore = b.minutesBefore;
  }
  const row = await serialWrite(() => rawDb().lawReminderPref.upsert({ where: { userId }, create: { userId, minutesBefore: DEFAULT_MINUTES, ...data }, update: data }));
  return { prefs: presentPrefs(row), error: null };
}

/**
 * The student's classes on one local date: the published official timetable (with their overrides, cancellations excluded)
 * plus their own weekly sessions that are in force that day. A class appearing in both is listed once.
 */
async function effectiveDay(userId, date) {
  const { LawFdcTimetable } = require("../../models/lawFdcTimetable");
  const out = [];
  const week = await LawFdcTimetable.week(userId, weekStart(date));
  for (const i of week.items) if (i.date === date && !i.cancelled && i.subject) out.push({ startTime: i.startTime, endTime: i.endTime, subject: i.subject, room: i.room || null, professor: i.professor || null, source: "official" });
  const wd = weekdayOf(date);
  const own = await rawDb().lawTimetableSlot.findMany({
    where: { userId, weekday: wd, placeholder: false },
    include: { subject: { select: { name: true } } },
  });
  const modules = new Map();
  for (const s of own) {
    if ((s.activeFrom && s.activeFrom > date) || (s.activeTo && s.activeTo < date)) continue;
    let name = s.subject?.name;
    if (!name && s.moduleId) {
      if (!modules.has(s.moduleId)) modules.set(s.moduleId, (await rawDb().lawCourseModule.findUnique({ where: { id: s.moduleId }, select: { title: true } }))?.title || null);
      name = modules.get(s.moduleId);
    }
    if (!name) continue;
    out.push({ startTime: s.startTime, endTime: s.endTime, subject: name, room: s.room || null, professor: s.professor || null, source: "own" });
  }
  const seen = new Set();
  return out
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || (a.source === "official" ? -1 : 1))
    .filter((c) => { const k = `${c.startTime}|${normalize(c.subject)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Tomorrow's classes for the Today dashboard (computed, so it needs no cron). */
async function tomorrow(userId, now = new Date()) {
  const date = addDays(localDate(now), 1);
  return { date, sessions: await effectiveDay(userId, date), prefs: await getPrefs(userId), error: null };
}

const reminderText = (sessions) =>
  sessions.length === 1
    ? `لديك حصة غداً: ${sessions[0].subject}${sessions[0].room ? ` — ${sessions[0].room}` : ""}`
    : `لديك ${sessions.length} حصص غداً، أولها ${sessions[0].startTime}`;

const createNotification = (userId, type, payload) => rawDb().lawNotification.create({ data: { userId, type, payload: JSON.stringify(payload) } });

/** Push is sent OUTSIDE the write lock: a slow push service must never hold up every other write. */
async function pushTo(userId, push) {
  if (push) {
    try {
      await runAs({ userId, role: "default" }, () => require("./push").sendToAll({ title: push.title, body: push.body, url: "/law/timetable", tag: push.tag }));
    } catch (e) {
      console.error("[reminders] push failed:", e.message);
    }
  }
}

/** Claims "evening reminder for <tomorrow>" for this student. True exactly once per class day. */
async function claimEvening(userId, tomorrowDate) {
  await serialWrite(async () => {
    if (await rawDb().lawReminderPref.findUnique({ where: { userId }, select: { userId: true } })) return;
    try { await rawDb().lawReminderPref.create({ data: { userId, minutesBefore: DEFAULT_MINUTES } }); } catch (e) { if (e.code !== "P2002") throw e; }
  });
  const r = await rawDb().lawReminderPref.updateMany({
    where: { userId, enabled: true, eveningBefore: true, OR: [{ lastEveningFor: null }, { lastEveningFor: { not: tomorrowDate } }] },
    data: { lastEveningFor: tomorrowDate },
  });
  return r.count === 1;
}

/** Runs both reminders for one student at `now`. Returns what was sent. */
async function runForUser(userId, now = new Date()) {
  const sent = { evening: false, soon: 0 };
  const today = localDate(now);
  const time = localTime(now);
  const prefs = await getPrefs(userId);
  if (!prefs.enabled) return sent;
  // The Settings switch "تذكير المراجعة" covers class reminders as well (the hint says so).
  const general = await rawDb().lawUserPreferences.findUnique({ where: { userId }, select: { notifyReminders: true } });
  if (general && general.notifyReminders === false) return sent;

  if (prefs.eveningBefore && time >= prefs.eveningTime) {
    const tomorrowDate = addDays(today, 1);
    if (await claimEvening(userId, tomorrowDate)) {
      let sessions;
      try {
        sessions = await effectiveDay(userId, tomorrowDate);
      } catch (e) {
        await rawDb().lawReminderPref.updateMany({ where: { userId, lastEveningFor: tomorrowDate }, data: { lastEveningFor: null } }); // release the claim: the next tick retries
        throw e;
      }
      if (sessions.length) {
        // In-app only (the notification bell and the Today card). A push at 20:00 would double the Sunday-evening recap push that
        // the existing rhythm acceptance test pins at exactly one; the minutes-before reminder the student asked for does push.
        await serialWrite(() => createNotification(userId, "SESSION_REMINDER", { date: tomorrowDate, count: sessions.length, first: { start: sessions[0].startTime, subject: sessions[0].subject, room: sessions[0].room } }));
        sent.evening = true;
      }
    }
  }

  if (prefs.minutesBefore) {
    const nowMin = toMin(time);
    for (const s of await effectiveDay(userId, today)) {
      const startMin = toMin(s.startTime);
      if (startMin <= nowMin || startMin - nowMin > prefs.minutesBefore) continue;
      const key = crypto.createHash("sha1").update(`${today}|${s.startTime}|${normalize(s.subject)}`).digest("hex").slice(0, 16);
      const dayStart = new Date(now.getTime() - 24 * 3600 * 1000); // the key already carries the date: only look at the last day
      const fresh = await serialWrite(async () => {
        if (await rawDb().lawNotification.findFirst({ where: { userId, type: "SESSION_SOON", createdAt: { gte: dayStart }, payload: { contains: `"key":"${key}"` } } })) return false;
        await createNotification(userId, "SESSION_SOON", { key, date: today, start: s.startTime, subject: s.subject, room: s.room });
        return true;
      });
      if (fresh) {
        sent.soon++;
        await pushTo(userId, { title: "حصة قريبة", body: `بعد ${startMin - nowMin} دقيقة: ${s.subject}${s.room ? ` — ${s.room}` : ""}`, tag: `soon-${key}` });
      }
    }
  }
  return sent;
}

/** Called by the scheduler every minute with the active users. */
async function tickAll(now, users) {
  const time = localTime(now);
  for (const u of users) {
    try {
      const prefs = await getPrefs(u.id);
      if (!prefs.enabled) continue;
      if (time < EVENING_FROM && !prefs.minutesBefore) continue; // nothing can be due: skip the queries
      await runForUser(u.id, now);
    } catch (e) {
      console.error("[reminders] user failed:", e.message);
    }
  }
}

module.exports = { getPrefs, savePrefs, effectiveDay, tomorrow, runForUser, tickAll, reminderText, MINUTES_OPTIONS, EVENING_FROM, DEFAULTS };
