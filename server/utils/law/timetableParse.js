// AI timetable import (Gemini Flash, structured output): a photo of the faculty schedule or pasted text in,
// candidate weekly slots out. Nothing is saved here: the student reviews the preview, then the page saves
// through PUT /law/timetable. Subject names are matched to the student's subjects when they clearly agree.
const { generate } = require("./ai/router");
const { loadPrompt } = require("./prompts");
const { normalize } = require("./arabic");
const { LawTimetable } = require("../../models/lawTimetable");

const SCHEMA = {
  type: "OBJECT",
  properties: {
    slots: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          weekday: { type: "INTEGER" },
          startTime: { type: "STRING" },
          endTime: { type: "STRING" },
          subjectName: { type: "STRING" },
          room: { type: "STRING" },
          kind: { type: "STRING", enum: ["amphi", "TD"] },
        },
        required: ["weekday", "startTime", "endTime", "subjectName"],
      },
    },
    notes: { type: "STRING" },
  },
  required: ["slots"],
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 20000;

/** "8h30", "8:30", "08.30", "14h" → "HH:MM", or null. */
function normalizeTime(v) {
  const m = String(v || "")
    .trim()
    .match(/^(\d{1,2})\s*(?:[:hH.]\s*(\d{2})?)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const key = (s) =>
  normalize(String(s || ""))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The subject this name refers to: equal names first, then one containing the other (unambiguous only). */
function matchSubject(name, subjects) {
  const k = key(name);
  if (!k) return null;
  const names = (s) => [s.name, s.nameFr, s.code].filter(Boolean).map(key);
  const exact = subjects.filter((s) => names(s).includes(k));
  if (exact.length === 1) return exact[0];
  const partial = subjects.filter((s) =>
    names(s).some((n) => n.length >= 4 && (n.includes(k) || k.includes(n)))
  );
  return partial.length === 1 ? partial[0] : null;
}

/** Validated, de-duplicated, sorted candidate slots from the model's JSON. */
function cleanSlots(raw, subjects) {
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const slot = {
      weekday: Number(r?.weekday),
      startTime: normalizeTime(r?.startTime),
      endTime: normalizeTime(r?.endTime),
      kind: r?.kind === "TD" ? "TD" : "amphi",
      room: String(r?.room || "").trim().slice(0, 80) || null,
      subjectName: String(r?.subjectName || "").trim().slice(0, 160),
    };
    if (LawTimetable.validateSlot(slot)) continue;
    const dup = `${slot.weekday}|${slot.startTime}|${key(slot.subjectName)}`;
    if (seen.has(dup)) continue;
    seen.add(dup);
    const subject = matchSubject(slot.subjectName, subjects);
    out.push({ ...slot, subjectId: subject?.id || null });
  }
  return out
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
    .slice(0, 50);
}

/** Splits a data URL or bare base64 string; returns {mimeType, data} or an error code. */
function imagePart(image, mimeType) {
  let mime = mimeType;
  let data = String(image || "");
  const head = /^data:([^;,]+);base64,/.exec(data.slice(0, 200)); // only the header is matched: never run a pattern over the whole payload
  if (head) { mime = head[1]; data = data.slice(head[0].length); }
  if (!IMAGE_TYPES.has(mime)) return { error: "unsupported_image" };
  // Look for a character outside the base64 alphabet instead of matching the whole payload with a greedy `+`: on a payload of
  // several megabytes the anchored form could exhaust the regexp engine's stack (RangeError) in a constrained worker.
  if (!data || /[^A-Za-z0-9+/=\s]/.test(data)) return { error: "invalid_image" };
  if (Buffer.byteLength(data, "base64") > MAX_IMAGE_BYTES) return { error: "image_too_large" };
  return { part: { inlineData: { mimeType: mime, data: data.replace(/\s/g, "") } } };
}

/**
 * @param {{image?:string, mimeType?:string, text?:string, subjects:object[], section?:string}} input
 * @returns {Promise<{slots, notes} | {error}>}
 */
async function parseTimetable({ image, mimeType, text, subjects = [], section = null }) {
  const parts = [];
  if (image) {
    const p = imagePart(image, mimeType);
    if (p.error) return { error: p.error };
    parts.push(p.part);
  }
  const pasted = String(text || "").trim().slice(0, MAX_TEXT);
  if (pasted) parts.push({ text: `نص جدول الحصص:\n${pasted}` });
  if (!parts.length) return { error: "nothing_to_parse" };
  const context = [
    section ? `فوج الطالب: ${section}` : null,
    subjects.length
      ? `مواد الطالب: ${subjects.map((s) => [s.name, s.nameFr].filter(Boolean).join(" / ")).join("، ")}`
      : null,
  ].filter(Boolean);
  if (context.length) parts.push({ text: context.join("\n") });

  const prompt = loadPrompt("parse_timetable", 1);
  const out = await generate({
    purpose: "timetable_parse",
    prompt,
    system: prompt.text,
    parts,
    schema: SCHEMA,
    temperature: 0,
    maxOutputTokens: 8192,
  });
  return {
    slots: cleanSlots(out.json?.slots, subjects),
    notes: String(out.json?.notes || "").slice(0, 1000) || null,
  };
}

module.exports = { parseTimetable, cleanSlots, normalizeTime, matchSubject, imagePart, SCHEMA };
