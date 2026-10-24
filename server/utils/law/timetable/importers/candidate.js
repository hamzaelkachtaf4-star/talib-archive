// The one shape every importer produces: a CANDIDATE class session. Nothing here is saved; the student reviews and confirms.
const { normalize } = require("../../arabic");
// Strict calendar-day check: Date.parse happily rolls "2026-02-30" over to March 2.
const isDateStr = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

const KINDS = ["amphi", "TD", "TP"];
const MAX_CANDIDATES = 50; // the most sessions the student's timetable can hold (PUT /law/timetable refuses more)
const CAP = 400; // titles and cells are cut to this before any pattern runs on them: no quadratic work on hostile input
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "8h30", "8:30", "08.30", "14h" → "HH:MM", or null. */
function normalizeTime(v) {
  const m = String(v ?? "").trim().match(/^(\d{1,2})\s*(?:[:hH.]\s*(\d{2})?)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const text = (v, max) => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
};

/**
 * Validates one raw row. Returns { slot } or { error } (a short code the UI can explain).
 * Weekday 1 = Monday … 7 = Sunday.
 */
function toCandidate(raw) {
  if (!raw || typeof raw !== "object") return { error: "invalid_row" };
  const weekday = Number(raw.weekday);
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return { error: "invalid_weekday" };
  const startTime = normalizeTime(raw.startTime);
  const endTime = normalizeTime(raw.endTime);
  if (!startTime || !endTime || !TIME.test(startTime) || !TIME.test(endTime)) return { error: "invalid_time" };
  if (startTime >= endTime) return { error: "start_after_end" };
  const subjectName = text(raw.subjectName, 160);
  if (!subjectName) return { error: "missing_subject" };
  for (const k of ["activeFrom", "activeTo"]) if (raw[k] != null && raw[k] !== "" && !isDateStr(raw[k])) return { error: `invalid_${k}` };
  if (raw.activeFrom && raw.activeTo && raw.activeFrom > raw.activeTo) return { error: "range_reversed" };
  return {
    slot: {
      weekday, startTime, endTime, subjectName,
      kind: KINDS.includes(raw.kind) ? raw.kind : "amphi",
      room: text(raw.room, 80),
      professor: text(raw.professor, 120),
      groupLabel: text(raw.groupLabel, 40),
      activeFrom: raw.activeFrom || null,
      activeTo: raw.activeTo || null,
    },
  };
}

const key = (c) => `${c.weekday}|${c.startTime}|${normalize(c.subjectName)}|${c.activeFrom || ""}`;

/** Validated, de-duplicated, sorted candidates plus the rows that were refused (index = position in the input). */
function toCandidates(rows, { max = MAX_CANDIDATES } = {}) {
  const seen = new Set();
  const slots = [];
  const rejected = [];
  (Array.isArray(rows) ? rows : []).forEach((raw, index) => {
    const r = toCandidate(raw);
    if (r.error) return rejected.push({ index, reason: r.error });
    const k = key(r.slot);
    if (seen.has(k)) return;
    seen.add(k);
    slots.push(r.slot);
  });
  slots.sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  return { slots: slots.slice(0, max), rejected, truncated: slots.length > max };
}

/** TD / TP markers in a title or a column → kind (Arabic, French, English). */
function inferKind(s) {
  const t = String(s || "").slice(0, CAP);
  if (/(^|[^A-Za-z])TD([^A-Za-z]|$)|travaux dirig|أعمال موجهة|اعمال موجهة/i.test(t)) return "TD";
  if (/(^|[^A-Za-z])TP([^A-Za-z]|$)|travaux pratiques|أشغال تطبيقية|اشغال تطبيقية/i.test(t)) return "TP";
  return "amphi";
}

/** The subject title without its TD/TP marker ("Droit civil - TD" → "Droit civil"). */
function stripKind(s) {
  // At most CAP characters reach these patterns, so even their worst case is a few hundred thousand steps.
  let t = String(s || "").slice(0, CAP).trim();
  t = t.replace(/^(TD|TP)(?![A-Za-z])[\s\-–:()]*/i, "");
  t = t.replace(/[\s\-–:()]*(?<![A-Za-z])(TD|TP)[\s\-–:()]*$/i, "");
  t = t.replace(/\s+(أعمال موجهة|اعمال موجهة|أشغال تطبيقية)\s*$/u, "");
  return t.trim();
}

module.exports = { KINDS, normalizeTime, toCandidate, toCandidates, inferKind, stripKind };
