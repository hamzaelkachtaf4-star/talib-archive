// Minimal CSV reader (quotes, escaped quotes, CRLF) and the timetable CSV row validator.
const COLUMNS = ["semester", "track", "language", "groupCode", "dayOfWeek", "startTime", "endTime", "subject", "kind", "room", "professor"];
const TRACKS = ["PRIVE", "PUBLIC"];
const LANGS = ["AR", "FR"];
const SEMESTERS = ["S1", "S2", "S3", "S4", "S5", "S6"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const s = String(text).replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** CSV text -> { rows } or { errors: [{ line, error }] }. All-or-nothing: one bad line rejects the file. */
function parseTimetableCsv(text) {
  const table = parseCsv(text);
  if (!table.length) return { errors: [{ line: 1, error: "empty_file" }] };
  const header = table[0].map((h) => h.trim());
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { errors: [{ line: 1, error: `missing_columns:${missing.join("|")}` }] };
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [];
  const errors = [];
  table.slice(1).forEach((cells, n) => {
    const line = n + 2;
    const g = (k) => (idx[k] === undefined ? "" : (cells[idx[k]] ?? "").trim());
    const dow = Number(g("dayOfWeek"));
    const r = {
      semester: g("semester"), track: g("track"), language: g("language"), parcours: g("parcours"), groupCode: g("groupCode"),
      dayOfWeek: dow, startTime: g("startTime"), endTime: g("endTime"), subject: g("subject"), kind: g("kind") || "COURS",
      room: g("room") || null, professor: g("professor") || null,
    };
    const bad =
      !SEMESTERS.includes(r.semester) ? "semester" :
      !TRACKS.includes(r.track) ? "track" :
      !LANGS.includes(r.language) ? "language" :
      !/^G\d{2}$/.test(r.groupCode) ? "groupCode" :
      !(Number.isInteger(dow) && dow >= 1 && dow <= 7) ? "dayOfWeek" :
      !TIME_RE.test(r.startTime) ? "startTime" :
      !TIME_RE.test(r.endTime) || r.endTime <= r.startTime ? "endTime" :
      !r.subject ? "subject" :
      !["COURS", "TD"].includes(r.kind) ? "kind" : null;
    if (bad) errors.push({ line, error: `invalid_${bad}` });
    else rows.push(r);
  });
  return errors.length ? { errors } : { rows };
}

module.exports = { parseCsv, parseTimetableCsv, COLUMNS };
