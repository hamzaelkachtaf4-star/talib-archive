// Time-based rhythm (spec §6.5, §8.5), ticked by the worker once a minute:
//  - daily radar scan when SCRAPER_ENABLED;
//  - close-out reminder ~21:00 local on timetable days ("Inbox: N items to review"), once per day;
//  - Sunday 20:00 local weekly recap, then a push.
// due() is pure so it can be tested at any simulated time; tick() performs the actions. tick() runs as
// system: the scan is global, the close-out and the recap are done for each user separately.
const { localDate, localTime, weekdayOf, weekStart } = require("./time");
const { LawSetting } = require("../../models/lawSetting");
const { LawJob } = require("../../models/lawJob");
const { lawConfig } = require("./config");
const { asSystem, runAs } = require("./tenant");
const { rawDb } = require("./dbClient");

/** Every active (not suspended) user, with the role their jobs run under. */
async function activeUsers() {
  return rawDb().users.findMany({
    where: { suspended: 0 },
    select: { id: true, role: true },
    orderBy: { id: "asc" },
  });
}

const asOwner = (u, fn) => runAs({ userId: u.id, role: u.role }, fn);

const SCAN_EVERY_MS = 24 * 3600 * 1000;

function due(
  now,
  state = {},
  { scraperEnabled = false, hasSlotsToday = false, fdcEnabled = false } = {}
) {
  const today = localDate(now);
  const time = localTime(now);
  const actions = [];
  if (
    scraperEnabled &&
    (!state.lastScanAt ||
      now.getTime() - new Date(state.lastScanAt).getTime() >= SCAN_EVERY_MS)
  )
    actions.push("scan");
  // Weekly FDC timetable refresh: Monday after 03:00 Africa/Casablanca, once per week, opt-in (FDC_AUTOFETCH=true).
  if (fdcEnabled && weekdayOf(today) === 1 && time >= "03:00" && state.lastFdcWeek !== weekStart(today))
    actions.push("fdc");
  if (hasSlotsToday && time >= "21:00" && state.lastCloseoutDate !== today)
    actions.push("closeout");
  if (
    weekdayOf(today) === 7 &&
    time >= "20:00" &&
    state.lastRecapWeek !== weekStart(today)
  )
    actions.push("recap");
  return actions;
}

async function tick(now = new Date()) {
  return asSystem(() => tickAsSystem(now));
}

async function tickAsSystem(now) {
  const state = (await LawSetting.getMeta("scheduler")) || {};
  const today = localDate(now);
  const { LawTimetable } = require("../../models/lawTimetable");
  const users = await activeUsers();
  const withSlots = [];
  for (const u of users)
    if ((await asOwner(u, () => LawTimetable.forDate(today))).length)
      withSlots.push(u);
  const hasSlotsToday = withSlots.length > 0;
  const actions = due(now, state, {
    scraperEnabled: lawConfig().scraper.enabled,
    hasSlotsToday,
    fdcEnabled: process.env.FDC_AUTOFETCH === "true",
  });
  const next = { ...state };
  for (const a of actions) {
    if (a === "scan") {
      await LawJob.enqueue("scrape_source", {});
      next.lastScanAt = now.toISOString();
    }
    if (a === "recap") {
      for (const u of users)
        await LawJob.enqueue(
          "weekly_recap",
          { weekStart: weekStart(today) },
          { priority: 1, userId: u.id }
        );
      next.lastRecapWeek = weekStart(today);
    }
    if (a === "fdc") {
      // Stage only: students never see unreviewed parses. An unchanged PDF (same sha256) is a no-op.
      try {
        const { fetchAndStage } = require("./timetable/fetchSources");
        const { LawFdcTimetable } = require("../../models/lawFdcTimetable");
        const month = Number(today.slice(5, 7));
        const season = month >= 8 || month === 1 ? "AUTOMNE" : "PRINTEMPS";
        const results = await fetchAndStage({ season, LawFdcTimetable });
        next.lastFdcRun = { at: now.toISOString(), season, staged: results.filter((r) => r.status === "staged").length };
      } catch (e) {
        console.error("[timetable] FDC refresh failed:", e.message);
        next.lastFdcRun = { at: now.toISOString(), error: e.message };
      }
      next.lastFdcWeek = weekStart(today);
    }
    if (a === "closeout") {
      const { LawInbox } = require("../../models/lawInbox");
      for (const u of withSlots)
        await asOwner(u, async () => {
          const n = await LawInbox.count();
          if (n > 0)
            await require("./push").sendToAll({
              title: "إغلاق اليوم",
              body: `صندوق الوارد: ${n} عنصر للمراجعة`,
              url: "/law/capture?tab=inbox",
              tag: "closeout",
            });
        });
      next.lastCloseoutDate = today;
    }
  }
  // Learner memory: one gentle reminder a day (>= 18:00 local) for weaknesses left alone for 3+ days. Runs beside the
  // due() actions (it has no job of its own and is not part of the returned action list).
  if (localTime(now) >= "18:00" && state.lastBrainNudgeDate !== today) {
    try {
      await require("../../models/lawBrain").LawBrain.nudgeAll(now);
    } catch (e) {
      console.error("[brain] nudge failed:", e.message);
    }
    next.lastBrainNudgeDate = today;
    await LawSetting.setMeta("scheduler", next);
  }
  // Class reminders (evening before / N minutes before) are claimed per student, so they sit beside due() and keep no state here.
  try {
    await require("./reminders").tickAll(now, users);
  } catch (e) {
    console.error("[reminders] tick failed:", e.message);
  }
  if (actions.length) await LawSetting.setMeta("scheduler", next);
  return actions;
}

module.exports = { due, tick };
