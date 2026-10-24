// Local-time helpers. Everything is stored in UTC; "a day" for streaks, timetable and sessions is the
// calendar day in Africa/Casablanca (spec §5: display in local time). Morocco switches between UTC+1
// and UTC+0 around Ramadan, so offsets are never hardcoded: Intl does the conversion.
const TZ = process.env.TZ || "Africa/Casablanca";

const fmtCache = new Map();
function formatter(tz) {
  if (!fmtCache.has(tz))
    fmtCache.set(
      tz,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    );
  return fmtCache.get(tz);
}

/** @returns {string} YYYY-MM-DD of `date` in the study timezone */
function localDate(date = new Date(), tz = TZ) {
  return formatter(tz).format(new Date(date));
}

const timeFmtCache = new Map();
/** @returns {string} HH:MM of `date` in the study timezone (24 h) */
function localTime(date = new Date(), tz = TZ) {
  if (!timeFmtCache.has(tz))
    timeFmtCache.set(
      tz,
      new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
    );
  return timeFmtCache.get(tz).format(new Date(date));
}

/** ISO weekday of a YYYY-MM-DD string: 1 = Monday … 7 = Sunday */
function weekdayOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isDateStr(v) {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !isNaN(Date.parse(`${v}T00:00:00Z`))
  );
}

/** Monday of the week containing dateStr */
function weekStart(dateStr) {
  return addDays(dateStr, 1 - weekdayOf(dateStr));
}

/** Whole days from a to b (b - a) for YYYY-MM-DD strings */
function daysBetween(a, b) {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000
  );
}

/**
 * The instant at which the wall clock in `tz` shows `dateStr` `hhmm` (default Africa/Casablanca), or null when that local
 * time does not exist (a skipped hour). No fixed offset: Morocco's offset changes around Ramadan, so the zone rules decide.
 */
function zonedInstant(dateStr, hhmm = "00:00", tz = TZ) {
  if (!isDateStr(dateStr) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const base = Date.parse(`${dateStr}T${hhmm}:00Z`);
  if (Number.isNaN(base) || new Date(base).toISOString().slice(0, 10) !== dateStr) return null; // e.g. 2026-02-30
  for (let h = -14; h <= 14; h++) {
    const t = new Date(base + h * 3600000);
    if (localDate(t, tz) === dateStr && localTime(t, tz) === hhmm) return t;
  }
  return null;
}

module.exports = {
  TZ,
  zonedInstant,
  localDate,
  localTime,
  weekdayOf,
  addDays,
  isDateStr,
  weekStart,
  daysBetween,
};
