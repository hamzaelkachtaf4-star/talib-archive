// RC3 Phase 5: timetable import endpoint (candidates only), richer own sessions, class reminders in Casablanca time.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const { startHarness } = require("../../utils/law/testing/harness");
const reminders = require("../../utils/law/reminders");
const scheduler = require("../../utils/law/scheduler");
const { zonedInstant, localDate, addDays, weekdayOf } = require("../../utils/law/time");

jest.setTimeout(60000);
let h;
beforeEach(async () => { h = await startHarness(); });
afterEach(async () => { await h.stop(); });

const SCOPE = { facultyCode: "FSJES-AC", track: "PRIVE", studyLang: "AR", semester: "S3" };
async function student(name = "سلمى", email = "a@example.ma", scope = SCOPE) {
  const u = await h.signUp(name, email);
  if (scope) await h.tmp.client.lawUserProfile.update({ where: { userId: u.user.id }, data: scope });
  return u;
}
const at = (date, hhmm) => zonedInstant(date, hhmm);
const MON = "2026-10-12"; // a Monday
const own = (u, over = {}) => h.tmp.client.lawTimetableSlot.create({ data: { userId: u.user.id, weekday: 2, startTime: "08:30", endTime: "10:00", kind: "amphi", room: "Amphi 3", placeholder: false, ...over } });
const notifs = (u, type) => h.tmp.client.lawNotification.findMany({ where: { userId: u.user.id, ...(type ? { type } : {}) }, orderBy: { createdAt: "asc" } });

describe("POST /law/timetable/import", () => {
  const ICS = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:المسؤولية المدنية\r\nDTSTART:20261013T083000\r\nDTEND:20261013T100000\r\nRRULE:FREQ=WEEKLY\r\nLOCATION:مدرج 3\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
  test("returns candidates (matched to the student's subjects) and saves nothing", async () => {
    const a = await student();
    const subject = await h.tmp.client.lawSubject.create({ data: { userId: a.user.id, name: "المسؤولية المدنية" } });
    const r = await h.call("POST", "/law/timetable/import", { token: a.token, body: { format: "ics", content: ICS } });
    expect(r.status).toBe(200);
    expect(r.body.slots).toHaveLength(1);
    expect(r.body.slots[0]).toMatchObject({ weekday: 2, startTime: "08:30", endTime: "10:00", subjectName: "المسؤولية المدنية", subjectId: subject.id, room: "مدرج 3" });
    expect(await h.tmp.client.lawTimetableSlot.count({ where: { userId: a.user.id } })).toBe(0);
  });

  test("csv works the same way; bad rows come back by line", async () => {
    const a = await student();
    const r = await h.call("POST", "/law/timetable/import", { token: a.token, body: { format: "csv", content: "day,start,end,subject\nmonday,08:00,09:30,Droit civil\nfoo,08:00,09:30,X\n" } });
    expect(r.body.slots.map((s) => s.subjectName)).toEqual(["Droit civil"]);
    expect(r.body.rejected).toEqual([{ line: 3, reason: "invalid_weekday" }]);
  });

  test("unknown formats, empty input and missing columns are 400 with a code", async () => {
    const a = await student();
    const post = (body) => h.call("POST", "/law/timetable/import", { token: a.token, body });
    expect((await post({ format: "pdf", content: "x" })).body.error).toBe("invalid_format");
    expect((await post({ format: "ics", content: "" })).body.error).toBe("empty_file");
    expect((await post({ format: "ics", content: "hello" })).body.error).toBe("not_a_calendar");
    expect((await post({ format: "csv", content: "a,b\n1,2\n" })).body.error).toBe("missing_columns");
    expect((await h.call("POST", "/law/timetable/import", { body: { format: "csv", content: "x" } })).status).toBe(401);
  });

  test("is rate limited per day", async () => {
    const a = await student();
    await h.tmp.client.lawRateCounter.create({ data: { key: `tt_import:${a.user.id}:${localDate(new Date())}`, count: 60 } });
    expect((await h.call("POST", "/law/timetable/import", { token: a.token, body: { format: "csv", content: "day,start,end,subject\nmonday,08:00,09:00,A\n" } })).status).toBe(429);
  });

  test("a candidate does not leak another student's subject", async () => {
    const a = await student();
    const b = await student("يوسف", "b@example.ma");
    await h.tmp.client.lawSubject.create({ data: { userId: b.user.id, name: "قانون الشركات" } });
    const r = await h.call("POST", "/law/timetable/import", { token: a.token, body: { format: "csv", content: "day,start,end,subject\nmonday,08:00,09:00,قانون الشركات\n" } });
    expect(r.body.slots[0].subjectId).toBeNull();
  });
});

describe("own sessions carry professor, group, module and the TP kind", () => {
  const put = (u, slots) => h.call("PUT", "/law/timetable", { token: u.token, body: { slots } });
  test("saved and returned; a module of another student is refused", async () => {
    const a = await student();
    const b = await student("يوسف", "b@example.ma");
    const mod = (await h.call("GET", "/law/modules?semester=S3", { token: a.token })).body.modules[0];
    const slot = { weekday: 4, startTime: "10:15", endTime: "11:45", kind: "TP", room: "Salle 4", professor: "د. الإدريسي", groupLabel: "G02", moduleId: mod.id, activeFrom: "2026-10-01", activeTo: "2027-01-31" };
    const ok = await put(a, [slot]);
    expect(ok.status).toBe(200);
    expect(ok.body.slots[0]).toMatchObject({ kind: "TP", professor: "د. الإدريسي", groupLabel: "G02", moduleId: mod.id });
    expect((await put(b, [{ ...slot }])).status).toBe(400);
    const bmod = (await h.call("GET", "/law/modules?semester=S3", { token: b.token })).body.modules[0];
    expect((await put(a, [{ ...slot, moduleId: bmod.id }])).body.error).toBe("unknown module");
    expect((await put(a, [{ ...slot, kind: "LAB" }])).status).toBe(400);
    expect((await put(a, [{ ...slot, professor: "x".repeat(121) }])).status).toBe(400);
    expect((await put(a, [{ ...slot, groupLabel: "x".repeat(41) }])).status).toBe(400);
  });
  test("re-saving a list that does not mention the new fields clears nothing the student did not touch", async () => {
    const a = await student();
    const first = await put(a, [{ weekday: 1, startTime: "08:00", endTime: "09:00", kind: "amphi", professor: "د. فلان" }]);
    const id = first.body.slots[0].id;
    const again = await put(a, [{ id, weekday: 1, startTime: "08:00", endTime: "09:00", kind: "amphi", professor: "د. فلان" }]);
    expect(again.body.slots[0].professor).toBe("د. فلان");
  });
  test("a payload that omits professor/group/module keeps them; an explicit null clears", async () => {
    const a = await student();
    const mod = (await h.call("GET", "/law/modules?semester=S3", { token: a.token })).body.modules[0];
    const first = await put(a, [{ weekday: 2, startTime: "08:00", endTime: "09:00", kind: "TD", professor: "د. فلان", groupLabel: "G01", moduleId: mod.id }]);
    const id = first.body.slots[0].id;
    const kept = await put(a, [{ id, weekday: 2, startTime: "08:00", endTime: "10:00", kind: "TD" }]);
    expect(kept.body.slots[0]).toMatchObject({ endTime: "10:00", professor: "د. فلان", groupLabel: "G01", moduleId: mod.id });
    const cleared = await put(a, [{ id, weekday: 2, startTime: "08:00", endTime: "10:00", kind: "TD", professor: null, groupLabel: "", moduleId: null }]);
    expect(cleared.body.slots[0]).toMatchObject({ professor: null, groupLabel: null, moduleId: null });
  });
});

describe("reminder preferences", () => {
  test("defaults, update, validation, privacy", async () => {
    const a = await student();
    const b = await student("يوسف", "b@example.ma");
    expect((await h.call("GET", "/law/timetable/reminders", { token: a.token })).body).toMatchObject({ prefs: { enabled: true, eveningBefore: true, eveningTime: "20:00", minutesBefore: 30 }, minutesOptions: [15, 30, 60, 120] }); // both reminders are on by default
    const put = await h.call("PUT", "/law/timetable/reminders", { token: a.token, body: { minutesBefore: 15, eveningBefore: false, eveningTime: "21:30" } });
    expect(put.body.prefs).toEqual({ enabled: true, eveningBefore: false, eveningTime: "21:30", minutesBefore: 15 });
    expect((await h.call("GET", "/law/timetable/reminders", { token: b.token })).body.prefs).toMatchObject({ minutesBefore: 30, eveningTime: "20:00" });
    for (const body of [{ enabled: "yes" }, { minutesBefore: 45 }, { minutesBefore: "30" }, { eveningBefore: 1 }, { eveningTime: "25:00" }, { eveningTime: "8pm" }, { eveningTime: 2000 }]) expect((await h.call("PUT", "/law/timetable/reminders", { token: a.token, body })).status).toBe(400);
    expect((await h.call("PUT", "/law/timetable/reminders", { token: a.token, body: { minutesBefore: null } })).body.prefs.minutesBefore).toBeNull();
  });
});

describe("effective day and tomorrow", () => {
  async function official(u, rows) {
    const src = await h.tmp.client.lawTimetableSource.create({ data: { facultyCode: SCOPE.facultyCode, season: "AUTOMNE", url: "http://x/y", sha256: "abc", status: "PUBLISHED" } });
    for (const r of rows) await h.tmp.client.lawFdcSession.create({ data: { sourceId: src.id, facultyCode: SCOPE.facultyCode, semester: "S3", track: "PRIVE", language: "AR", groupCode: "G01", published: true, ...r } });
    await h.tmp.client.lawTimetableSubscription.create({ data: { userId: u.user.id, facultyCode: SCOPE.facultyCode, semester: "S3", track: "PRIVE", language: "AR", groupCode: "G01" } });
    return src;
  }
  test("official classes (minus cancellations) and own sessions merge, sorted, deduplicated", async () => {
    const a = await student();
    await official(a, [
      { dayOfWeek: 2, startTime: "08:30", endTime: "10:00", subject: "المسؤولية المدنية", room: "A1", kind: "COURS" },
      { dayOfWeek: 2, startTime: "14:00", endTime: "15:30", subject: "قانون الشركات", room: "B2", kind: "TD" },
      { dayOfWeek: 2, startTime: "16:00", endTime: "17:00", subject: "ملغاة", kind: "COURS" },
    ]);
    const cancelled = (await h.tmp.client.lawFdcSession.findFirst({ where: { subject: "ملغاة" } })).id;
    await h.tmp.client.lawTimetableOverride.create({ data: { userId: a.user.id, sessionId: cancelled, type: "CANCEL", date: "2026-10-13", data: "{}" } });
    const subject = await h.tmp.client.lawSubject.create({ data: { userId: a.user.id, name: "المسؤولية المدنية" } });
    await own(a, { subjectId: subject.id, room: "نفس الحصة" }); // same class as the official one: listed once
    await own(a, { startTime: "11:00", endTime: "12:00", subjectId: (await h.tmp.client.lawSubject.create({ data: { userId: a.user.id, name: "مادة خاصة" } })).id, room: "R9" });
    await own(a, { startTime: "18:00", endTime: "19:00", placeholder: true }); // placeholders never remind
    await own(a, { startTime: "19:00", endTime: "20:00", subjectId: subject.id, activeFrom: "2026-11-01" }); // not in force yet
    const day = await reminders.effectiveDay(a.user.id, "2026-10-13");
    expect(day.map((d) => [d.startTime, d.subject, d.source, d.room])).toEqual([["08:30", "المسؤولية المدنية", "official", "A1"], ["11:00", "مادة خاصة", "own", "R9"], ["14:00", "قانون الشركات", "official", "B2"]]);
  });

  test("an own session that names a module (no subject) uses the module title", async () => {
    const a = await student();
    const mod = (await h.call("GET", "/law/modules?semester=S3", { token: a.token })).body.modules[0];
    await own(a, { moduleId: mod.id });
    const day = await reminders.effectiveDay(a.user.id, "2026-10-13");
    expect(day.map((d) => d.subject)).toEqual([mod.title]);
  });

  test("GET /law/timetable/tomorrow answers for the next Casablanca day", async () => {
    const a = await student();
    await own(a, { subjectId: (await h.tmp.client.lawSubject.create({ data: { userId: a.user.id, name: "مادة" } })).id });
    const r = await h.call("GET", "/law/timetable/tomorrow", { token: a.token });
    expect(r.status).toBe(200);
    expect(r.body.date).toBe(addDays(localDate(new Date()), 1));
    expect(r.body.prefs.enabled).toBe(true);
    const wd = weekdayOf(r.body.date);
    expect(r.body.sessions.length).toBe(wd === 2 ? 1 : 0);
  });
});

describe("reminders: evening before, N minutes before, idempotent", () => {
  async function withClass(a, weekday = 2, extra = {}) {
    const s = await h.tmp.client.lawSubject.create({ data: { userId: a.user.id, name: "المسؤولية المدنية" } });
    return own(a, { weekday, subjectId: s.id, room: "Amphi 3", ...extra });
  }
  const TUE = "2026-10-13";

  test("not before 20:00; at 20:00 one notification for tomorrow; repeated ticks never duplicate", async () => {
    const a = await student();
    await withClass(a);
    expect((await reminders.runForUser(a.user.id, at(MON, "19:59"))).evening).toBe(false);
    expect(await notifs(a)).toHaveLength(0);
    const first = await reminders.runForUser(a.user.id, at(MON, "20:00"));
    expect(first.evening).toBe(true);
    for (const t of ["20:01", "21:30", "23:59"]) expect((await reminders.runForUser(a.user.id, at(MON, t))).evening).toBe(false);
    const n = await notifs(a, "SESSION_REMINDER");
    expect(n).toHaveLength(1);
    expect(JSON.parse(n[0].payload)).toMatchObject({ date: TUE, count: 1, first: { start: "08:30", subject: "المسؤولية المدنية", room: "Amphi 3" } });
    // the next evening builds the next day's reminder again
    await withClass(a, 3);
    expect((await reminders.runForUser(a.user.id, at(TUE, "20:10"))).evening).toBe(true);
    expect(await notifs(a, "SESSION_REMINDER")).toHaveLength(2);
  });

  test("switching off the review-reminder category in Settings stops class reminders too (no notification, no push)", async () => {
    const push = require("../../utils/law/push");
    const sent = [];
    push.setPushSender(async (sub, payload) => sent.push(JSON.parse(payload)));
    const a = await student();
    await withClass(a);
    await h.call("PUT", "/law/timetable/reminders", { token: a.token, body: { eveningTime: "20:00", minutesBefore: 30 } });
    await h.call("PATCH", "/law/me/preferences", { token: a.token, body: { notifyReminders: false } });
    const r = await reminders.runForUser(a.user.id, at(MON, "20:00"));
    expect(r).toEqual({ evening: false, soon: 0 });
    expect(await notifs(a, "SESSION_REMINDER")).toHaveLength(0);
    expect(sent).toHaveLength(0);
    await h.call("PATCH", "/law/me/preferences", { token: a.token, body: { notifyReminders: true } });
    expect((await reminders.runForUser(a.user.id, at(MON, "20:00"))).evening).toBe(true); // back on
  });

  test("the student chooses the evening time: nothing before it, one reminder from it", async () => {
    const a = await student();
    await withClass(a);
    await h.call("PUT", "/law/timetable/reminders", { token: a.token, body: { eveningTime: "21:30", minutesBefore: null } });
    expect((await reminders.runForUser(a.user.id, at(MON, "20:00"))).evening).toBe(false); // the old default hour no longer fires
    expect((await reminders.runForUser(a.user.id, at(MON, "21:29"))).evening).toBe(false);
    expect((await reminders.runForUser(a.user.id, at(MON, "21:30"))).evening).toBe(true);
    expect(await notifs(a, "SESSION_REMINDER")).toHaveLength(1);
  });

  test("the evening reminder is in-app only (no push); the minutes-before reminder pushes", async () => {
    const push = require("../../utils/law/push");
    const sent = [];
    push.setPushSender(async (sub, payload) => sent.push(JSON.parse(payload)));
    const a = await student();
    const { runAs } = require("../../utils/law/tenant");
    await runAs({ userId: a.user.id, role: "default" }, () => push.subscribe({ subscription: { endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" } } }));
    await withClass(a, 2, { startTime: "09:00", endTime: "10:00" });
    await reminders.runForUser(a.user.id, at(MON, "20:30"));
    expect(await notifs(a, "SESSION_REMINDER")).toHaveLength(1);
    expect(sent).toHaveLength(0);
    await h.call("PUT", "/law/timetable/reminders", { token: a.token, body: { eveningBefore: false, minutesBefore: 30 } });
    await reminders.runForUser(a.user.id, at(TUE, "08:40"));
    expect(sent.map((p) => p.tag)).toEqual([expect.stringMatching(/^soon-/)]);
    push.setPushSender(null);
  });

  test("two ticks racing at the same minute still send one", async () => {
    const a = await student();
    await withClass(a);
    const rs = await Promise.all([1, 2, 3, 4].map(() => reminders.runForUser(a.user.id, at(MON, "20:05"))));
    expect(rs.filter((r) => r.evening)).toHaveLength(1);
    expect(await notifs(a, "SESSION_REMINDER")).toHaveLength(1);
  });

  test("if computing tomorrow fails, the claim is released so the next tick retries", async () => {
    const a = await student();
    await withClass(a);
    const { LawFdcTimetable } = require("../../models/lawFdcTimetable");
    const spy = jest.spyOn(LawFdcTimetable, "week").mockRejectedValueOnce(new Error("boom"));
    await expect(reminders.runForUser(a.user.id, at(MON, "20:05"))).rejects.toThrow("boom");
    spy.mockRestore();
    expect((await h.tmp.client.lawReminderPref.findUnique({ where: { userId: a.user.id } })).lastEveningFor).toBeNull();
    expect((await reminders.runForUser(a.user.id, at(MON, "20:06"))).evening).toBe(true);
    expect(await notifs(a, "SESSION_REMINDER")).toHaveLength(1);
  });

  test("no class tomorrow: nothing is sent and the evening is not re-evaluated", async () => {
    const a = await student();
    await withClass(a, 5);
    expect((await reminders.runForUser(a.user.id, at(MON, "20:30"))).evening).toBe(false);
    const pref = await h.tmp.client.lawReminderPref.findUnique({ where: { userId: a.user.id } });
    expect(pref.lastEveningFor).toBe(TUE);
    expect(await notifs(a)).toHaveLength(0);
  });

  test("disabled, or evening reminders switched off: silence", async () => {
    const a = await student();
    await withClass(a);
    await h.call("PUT", "/law/timetable/reminders", { token: a.token, body: { enabled: false } });
    expect((await reminders.runForUser(a.user.id, at(MON, "21:00"))).evening).toBe(false);
    await h.call("PUT", "/law/timetable/reminders", { token: a.token, body: { enabled: true, eveningBefore: false } });
    expect((await reminders.runForUser(a.user.id, at(MON, "21:00"))).evening).toBe(false);
    expect(await notifs(a)).toHaveLength(0);
  });

  test("the reminder window is judged on the Casablanca clock: 19:59 is too early, 23:30 is still that same evening", async () => {
    const a = await student();
    await withClass(a);
    // 19:59 local is "before the window" whatever the UTC clock says
    const late = at(MON, "19:59");
    expect((await reminders.runForUser(a.user.id, late)).evening).toBe(false);
    expect(localDate(at(MON, "23:30"))).toBe(MON); // still Monday locally even if UTC has rolled over in some seasons
    expect((await reminders.runForUser(a.user.id, at(MON, "23:30"))).evening).toBe(true);
  });

  test("N minutes before: sent once inside the window, never for past classes, deduplicated across ticks", async () => {
    const a = await student();
    await h.call("PUT", "/law/timetable/reminders", { token: a.token, body: { eveningBefore: false, minutesBefore: 30 } });
    await withClass(a, 2, { startTime: "09:00", endTime: "10:00" });
    expect((await reminders.runForUser(a.user.id, at(TUE, "08:20"))).soon).toBe(0); // 40 minutes ahead: too early
    expect((await reminders.runForUser(a.user.id, at(TUE, "08:35"))).soon).toBe(1);
    expect((await reminders.runForUser(a.user.id, at(TUE, "08:36"))).soon).toBe(0);
    expect((await reminders.runForUser(a.user.id, at(TUE, "09:00"))).soon).toBe(0);
    expect((await reminders.runForUser(a.user.id, at(TUE, "09:30"))).soon).toBe(0);
    const n = await notifs(a, "SESSION_SOON");
    expect(n).toHaveLength(1);
    expect(JSON.parse(n[0].payload)).toMatchObject({ date: TUE, start: "09:00", subject: "المسؤولية المدنية", room: "Amphi 3" });
  });

  test("reminders are per student", async () => {
    const a = await student();
    const b = await student("يوسف", "b@example.ma");
    await withClass(a);
    await reminders.runForUser(b.user.id, at(MON, "20:30"));
    expect(await notifs(b)).toHaveLength(0);
    await reminders.runForUser(a.user.id, at(MON, "20:30"));
    expect(await notifs(a)).toHaveLength(1);
    expect(await notifs(b)).toHaveLength(0);
  });

  test("the scheduler tick drives the reminders for every active student", async () => {
    const a = await student();
    await withClass(a);
    await scheduler.tick(at(MON, "20:15"));
    expect(await notifs(a, "SESSION_REMINDER")).toHaveLength(1);
    await scheduler.tick(at(MON, "20:16"));
    expect(await notifs(a, "SESSION_REMINDER")).toHaveLength(1);
  });

  test("scheduler.due() is untouched by reminders (still returns only its own actions)", () => {
    expect(scheduler.due(at(MON, "20:15"))).toEqual([]);
  });

  test("the message for one class names it and its room; for several, how many and the first time", () => {
    expect(reminders.reminderText([{ subject: "المسؤولية المدنية", room: "Amphi 3", startTime: "08:30" }])).toBe("لديك حصة غداً: المسؤولية المدنية — Amphi 3");
    expect(reminders.reminderText([{ subject: "المسؤولية المدنية", room: null, startTime: "08:30" }])).toBe("لديك حصة غداً: المسؤولية المدنية");
    expect(reminders.reminderText([{ subject: "أ", startTime: "08:30" }, { subject: "ب", startTime: "10:15" }])).toBe("لديك 2 حصص غداً، أولها 08:30");
  });

  test("deleting the account removes the preferences and the sessions", async () => {
    const a = await student();
    await withClass(a);
    await h.call("PUT", "/law/timetable/reminders", { token: a.token, body: { minutesBefore: 15 } });
    await h.tmp.client.users.delete({ where: { id: a.user.id } });
    expect(await h.tmp.client.lawReminderPref.count()).toBe(0);
    expect(await h.tmp.client.lawTimetableSlot.count()).toBe(0);
  });
});
