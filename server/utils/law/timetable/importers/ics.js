// iCalendar (.ics) import: weekly timetables exported from Google/Apple/Outlook or a faculty calendar. Times are converted to
// Africa/Casablanca with the zone rules (never a fixed offset). One-off events become a session limited to that single day.
const { toCandidates, inferKind, stripKind } = require("./candidate");
const { localDate, localTime, weekdayOf, addDays, zonedInstant } = require("../../time");

const MAX_BYTES = 1024 * 1024;
const MAX_EVENTS = 300;
const MAX_COUNT = 100; // an RRULE COUNT beyond this is clamped (a term has about 16 weeks)
const CAP = 400;
const BYDAY = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
const CASA = "Africa/Casablanca";

/** RFC 5545 line unfolding: a line starting with space/tab continues the previous one. */
function unfold(textIn) {
  return String(textIn).replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(v) {
  return String(v).replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

/** "DTSTART;TZID=Europe/Paris:20261014T083000" → { name, params, value }. */
function parseLine(line) {
  const i = line.indexOf(":");
  if (i < 0) return null;
  const [name, ...ps] = line.slice(0, i).split(";");
  const params = Object.fromEntries(ps.map((p) => { const [k, ...v] = p.split("="); return [k.toUpperCase(), v.join("=")]; }));
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

function validTz(tz) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}

/** A DTSTART/DTEND/UNTIL value → local Casablanca { date, time } (time null for DATE values), or null. */
function toLocal({ params, value }) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4] === undefined) return { date, time: null };
  const hhmm = `${m[4]}:${m[5]}`;
  if (m[7]) {
    const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
    return { date: localDate(t, CASA), time: localTime(t, CASA) };
  }
  const tzid = params.TZID ? String(params.TZID).replace(/^"|"$/g, "").trim() : "";
  const tz = tzid && validTz(tzid) ? tzid : CASA; // floating times are read as Casablanca local time
  if (tz === CASA) return { date, time: hhmm, unknownZone: !!tzid && !validTz(tzid) };
  const t = zonedInstant(date, hhmm, tz);
  return t ? { date: localDate(t, CASA), time: localTime(t, CASA), shifted: true } : null;
}

function parseRrule(v) {
  const o = {};
  for (const part of String(v).split(";")) { const [k, val] = part.split("="); if (k) o[k.toUpperCase()] = val; }
  return o;
}

function parse({ content }) {
  const textIn = String(content ?? "");
  if (!textIn.trim()) return { error: "empty_file" };
  if (Buffer.byteLength(textIn, "utf8") > MAX_BYTES) return { error: "file_too_large" };
  if (!/BEGIN:VCALENDAR/i.test(textIn)) return { error: "not_a_calendar" };
  const lines = unfold(textIn);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) cur = [];
    else if (/^END:VEVENT/i.test(line)) { if (cur) events.push(cur); cur = null; }
    else if (cur) { const p = parseLine(line); if (p) cur.push(p); }
  }
  const warnings = new Set();
  const raw = [];
  const rejected = [];
  events.slice(0, MAX_EVENTS).forEach((props, index) => {
    try {
    const get = (n) => props.find((p) => p.name === n);
    if (get("RECURRENCE-ID")) { warnings.add("override_ignored"); return; } // one moved/changed occurrence of a series: the series itself is imported
    if (get("EXDATE")) warnings.add("exdate_ignored");
    const start = get("DTSTART") && toLocal(get("DTSTART"));
    const end = get("DTEND") && toLocal(get("DTEND"));
    const summary = get("SUMMARY") ? unescapeText(get("SUMMARY").value).slice(0, CAP) : "";
    if (start && start.unknownZone) warnings.add("unknown_timezone");
    if (!start || start.time === null) return rejected.push({ index, event: index + 1, reason: start ? "all_day_event" : "invalid_start" });
    if (!end || end.time === null || end.date !== start.date) return rejected.push({ index, event: index + 1, reason: "invalid_end" });
    if (!summary) return rejected.push({ index, event: index + 1, reason: "missing_subject" });
    const description = get("DESCRIPTION") ? unescapeText(get("DESCRIPTION").value) : "";
    const prof = /(?:professeur|prof\.?|enseignant|الأستاذ|استاذ|professor|teacher)\s*[:：]\s*([^\n]+)/i.exec(description)?.[1];
    const base = {
      startTime: start.time, endTime: end.time, subjectName: stripKind(summary), kind: inferKind(summary),
      room: get("LOCATION") ? unescapeText(get("LOCATION").value) : "", professor: prof || "",
    };
    const rr = get("RRULE") ? parseRrule(get("RRULE").value) : null;
    if (rr && String(rr.FREQ).toUpperCase() === "WEEKLY" && (!rr.INTERVAL || rr.INTERVAL === "1")) {
      const days = rr.BYDAY ? rr.BYDAY.toUpperCase().split(",").map((d) => BYDAY[d.trim().replace(/^[+-]?\d+/, "")]).filter(Boolean) : [weekdayOf(start.date)];
      if (!days.length) return rejected.push({ index, event: index + 1, reason: "invalid_recurrence" });
      let until = null;
      if (rr.UNTIL) { const u = toLocal({ params: {}, value: rr.UNTIL }); until = u ? u.date : null; }
      else if (rr.COUNT) {
        const n = Math.min(MAX_COUNT, Math.floor(Number(rr.COUNT)));
        if (!(n > 0)) return rejected.push({ index, event: index + 1, reason: "invalid_recurrence" });
        until = addDays(start.date, 7 * (Math.ceil(n / days.length) - 1) + 6);
      }
      if (start.shifted) warnings.add("times_follow_first_week"); // another zone: the offset of the first week is applied to the whole series
      for (const weekday of days) raw.push({ ...base, weekday, activeFrom: start.date, activeTo: until, event: index + 1 });
    } else {
      if (rr) warnings.add("unsupported_recurrence"); // daily, monthly, every-other-week...: kept as the first occurrence only
      raw.push({ ...base, weekday: weekdayOf(start.date), activeFrom: start.date, activeTo: start.date, event: index + 1 });
    }
    } catch {
      rejected.push({ index, event: index + 1, reason: "invalid_event" }); // one broken event never loses the whole file
    }
  });
  if (events.length > MAX_EVENTS) warnings.add("truncated");
  const c = toCandidates(raw);
  if (c.truncated) warnings.add("truncated");
  // Rows refused later (bad times, reversed range...) are reported against the EVENT they came from, not their place in the expanded list.
  const late = c.rejected.map((r) => ({ index: raw[r.index].event - 1, event: raw[r.index].event, reason: r.reason }));
  return { slots: c.slots, rejected: [...rejected, ...late], warnings: [...warnings], notes: null };
}

module.exports = { id: "ics", parse, unfold, toLocal, MAX_BYTES };
