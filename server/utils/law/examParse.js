// AI import of exam dates (RC3 Phase 4): a photo, a PDF or pasted text in, CANDIDATE rows out. Nothing is saved here and the
// caller stores every row as unconfirmed; only the student's confirmation puts a date on their calendar.
const { generate } = require("./ai/router");
const { loadPrompt } = require("./prompts");
const { localDate } = require("./time");

const SCHEMA = {
  type: "OBJECT",
  properties: {
    exams: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { title: { type: "STRING" }, date: { type: "STRING" }, time: { type: "STRING" }, room: { type: "STRING" } }, required: ["title", "date"] },
    },
    notes: { type: "STRING" },
  },
  required: ["exams"],
};
const MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 20000;
const MAX_ROWS = 40;

function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** "HH:MM" or null. */
function validTime(s) {
  const m = /^(\d{1,2})[:hH](\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` : null;
}

/** Rows the model returned that are really dates: a real calendar day, within [-1 month, +2 years] of today. */
function cleanExams(raw, today = localDate(new Date())) {
  const lo = new Date(`${today}T00:00:00Z`); lo.setUTCMonth(lo.getUTCMonth() - 1);
  const hi = new Date(`${today}T00:00:00Z`); hi.setUTCFullYear(hi.getUTCFullYear() + 2);
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const title = String(r?.title || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!title || !validDate(r?.date)) continue;
    const d = new Date(`${r.date}T00:00:00Z`);
    if (d < lo || d > hi) continue;
    const time = validTime(r.time);
    const key = `${title}|${r.date}|${time || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, date: r.date, time, room: String(r?.room || "").trim().slice(0, 80) || null });
    if (out.length >= MAX_ROWS) break;
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));
}

function filePart(file, mimeType) {
  let mime = mimeType;
  let data = String(file || "");
  const head = /^data:([^;,]+);base64,/.exec(data.slice(0, 200)); // only the header is matched: never run a pattern over the whole payload
  if (head) { mime = head[1]; data = data.slice(head[0].length); }
  if (!MIME.has(mime)) return { error: "unsupported_file" };
  if (!data || /[^A-Za-z0-9+/=\s]/.test(data)) return { error: "invalid_file" }; // linear scan: an anchored greedy match can overflow the regexp stack on a multi-megabyte payload
  if (Buffer.byteLength(data, "base64") > MAX_BYTES) return { error: "file_too_large" };
  return { part: { inlineData: { mimeType: mime, data: data.replace(/\s/g, "") } }, mime };
}

/** @returns {Promise<{exams, notes, source}|{error}>} source is "photo" or "pdf" (or "manual" for pasted text) */
async function parseExamDates({ file, mimeType, text, now = new Date() }) {
  const parts = [];
  let source = "manual";
  if (file) {
    const p = filePart(file, mimeType);
    if (p.error) return { error: p.error };
    parts.push(p.part);
    source = p.mime === "application/pdf" ? "pdf" : "photo";
  }
  const pasted = String(text || "").trim().slice(0, MAX_TEXT);
  if (pasted) parts.push({ text: `نص جدول الامتحانات:\n${pasted}` });
  if (!parts.length) return { error: "nothing_to_parse" };
  parts.push({ text: `تاريخ اليوم: ${localDate(now)}` });
  const prompt = loadPrompt("parse_exam_dates", 1);
  const out = await generate({ purpose: "exam_dates_parse", prompt, system: prompt.text, parts, schema: SCHEMA, temperature: 0, maxOutputTokens: 4096 }, { now });
  return { exams: cleanExams(out.json?.exams, localDate(now)), notes: String(out.json?.notes || "").slice(0, 600) || null, source };
}

module.exports = { parseExamDates, cleanExams, validDate, validTime, SCHEMA };
