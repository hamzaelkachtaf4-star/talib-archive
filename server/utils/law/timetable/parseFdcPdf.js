// FDC (FSJES Ain Chock) timetable PDF -> normalized session rows. Designed from the real 2026-27 Automne PDFs
// (text-based, one table row per line, columns concatenated without separators):
//   "SEMESTRE 3 TC DROIT PRIVE ARABE" + subject + PROFESSOR + "G01" + DAY + "11H-13H15" + room
// Slots are 08H30-10H45, 11H-13H15, 13H30-15H45, 16H-18H15 (+ occasionally other times). The end time's minutes
// are 00/15/30/45, so "13H152" reads as 13H15 + room "2". Anything that does not fit the row grammar is
// reported in `rejected` (never guessed): an admin reviews staged rows before students see them.
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const DAYS = { LUNDI: 1, MARDI: 2, MERCREDI: 3, JEUDI: 4, VENDREDI: 5, SAMEDI: 6, DIMANCHE: 7 };
const ROW_RE = new RegExp(
  "^SEMESTRE\\s+(\\d)\\s+(.*?(?:ARABE|FRAN[CÇçc]AIS|ANGLAIS))\\s*([\\s\\S]*?)\\s*(G\\d{2})\\s*(" +
    Object.keys(DAYS).join("|") +
    ")\\s*(\\d{1,2})H(\\d{2})?\\s*-\\s*(\\d{1,2})H(00|15|30|45)?\\s*([\\s\\S]*)$"
);

/** PDF extraction yields Persian/Arabic-presentation variants (ی ھ ک) and stray controls; map them to standard Arabic. */
function normalizeArabic(s) {
  return String(s)
    .normalize("NFKC")
    .replace(/ی/g, "ي") // ی -> ي
    .replace(/ھ/g, "ه") // ھ -> ه
    .replace(/ک/g, "ك") // ک -> ك
    .replace(/ـ/g, "") // tatweel
    .replace(/[​-‏‪-‮]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const pad = (h) => String(h).padStart(2, "0");
const time = (h, m) => `${pad(h)}:${m || "00"}`;

/** "SEMESTRE 3 DROIT PRIVE EN ARABE.pdf" -> { semester, track, language } (or nulls when it is not a law filière). */
function inferMeta(filename) {
  const f = decodeURIComponent(String(filename)).toUpperCase().replace(/\s+/g, " ");
  const sem = /SEMESTRE\s*(\d)/.exec(f);
  const track = /DROIT\s+PRIVE/.test(f) ? "PRIVE" : /DROIT\s+PUBLIC/.test(f) ? "PUBLIC" : null;
  const language = /EN\s+ARABE/.test(f) ? "AR" : /EN\s+FRAN[CÇ]AIS/.test(f) ? "FR" : null;
  return { semester: sem ? `S${sem[1]}` : null, track, language };
}

/** True for the law filières we keep (allowlist, not a blocklist). */
function isLawFile(filename) {
  const { track, language } = inferMeta(filename);
  return !!track && !!language && !/ECONOM|GESTION|BUSINESS/i.test(filename);
}

/** Splits "<subject><PROFESSOR>" at the trailing upper-case run. */
function splitSubjectProfessor(s) {
  const t = s.replace(/\s+/g, " ").trim();
  const m = /([A-Z][A-Z .'\/-]*)$/.exec(t);
  if (!m || m.index === 0) return { subject: normalizeArabic(t), professor: null };
  return { subject: normalizeArabic(t.slice(0, m.index)), professor: m[1].replace(/\s+/g, " ").trim() };
}

function parseFdcText(text, meta = {}) {
  const chunks = String(text)
    .split(/(?=SEMESTRE\s+\d\s)/)
    .map((c) => c.replace(/\s*\n\s*/g, " ").trim())
    .filter((c) => /^SEMESTRE\s+\d\s/.test(c) && /G\d{2}/.test(c));
  const rows = [];
  const rejected = [];
  for (const c of chunks) {
    const m = ROW_RE.exec(c);
    if (!m) {
      rejected.push(c.slice(0, 160));
      continue;
    }
    const [, sem, label, rest, group, day, sh, sm, eh, em, room] = m;
    const parcoursLabel = label.replace(/\s+/g, " ").trim();
    if (/ECONOM|GESTION|BUSINESS/i.test(parcoursLabel)) continue; // not a law filière
    const { subject, professor } = splitSubjectProfessor(rest);
    if (!subject) {
      rejected.push(c.slice(0, 160));
      continue;
    }
    // "TC DROIT PRIVE ARABE" is the plain filière; anything else (PARCOURS ...) is a parcours variant.
    const pm = /^PARCOURS\s+(.*?)\s+(?:ARABE|FRAN.*|ANGLAIS)$/.exec(parcoursLabel);
    rows.push({
      semester: meta.semester || `S${sem}`,
      track: meta.track || null,
      language: meta.language || null,
      parcours: pm ? pm[1].replace(/\s+/g, " ").trim() : "",
      groupCode: group,
      dayOfWeek: DAYS[day],
      startTime: time(sh, sm),
      endTime: time(eh, em),
      subject,
      kind: "COURS",
      room: room.replace(/\s*(?:GROUPE\s*\d|EMPLOIS DU TEMPS|LE DEBUT)[\s\S]*$/, "").replace(/\s+/g, " ").trim() || null,
      professor,
    });
  }
  // Lines whose filière label sits on another line cannot be attached safely: count them instead of guessing.
  const dayAlt = Object.keys(DAYS).join("|");
  const expected = (String(text).match(new RegExp("G\\d{2}\\s*(?:" + dayAlt + ")\\s*\\d{1,2}H", "g")) || []).length;
  const skipped = chunks.length - rows.length - rejected.length; // economics/management rows
  if (expected > rows.length + skipped + rejected.length)
    rejected.push(`${expected - rows.length - skipped - rejected.length} timetable line(s) could not be attached to a filière label (split row); add them through the CSV import`);
  return { rows, rejected };
}

async function parseFdcPdf(buffer, meta = {}) {
  const data = await pdfParse(buffer, { max: 0 });
  const out = parseFdcText(data.text, meta);
  if (!out.rows.length)
    out.reason = "no rows matched the known layout (scanned PDF or a different template): use the CSV import";
  return out;
}

module.exports = { parseFdcText, parseFdcPdf, normalizeArabic, inferMeta, isLawFile, splitSubjectProfessor };
