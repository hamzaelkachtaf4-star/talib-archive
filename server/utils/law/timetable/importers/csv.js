// CSV import (Excel/Sheets export or a hand-written file). Headers may be Arabic, French or English; the delimiter is detected.
// Rows that cannot be read are reported by line number, never guessed.
const { toCandidates, inferKind, stripKind, normalizeTime } = require("./candidate");
const { normalize } = require("../../arabic");

const MAX_BYTES = 500 * 1024;
const MAX_ROWS = 500;

const HEADERS = {
  day: ["day", "weekday", "jour", "jours", "اليوم", "يوم"],
  start: ["start", "from", "begin", "debut", "début", "heure debut", "heure début", "من", "البداية", "بداية"],
  end: ["end", "to", "fin", "heure fin", "إلى", "الى", "النهاية", "نهاية"],
  subject: ["subject", "course", "module", "matiere", "matière", "cours", "المادة", "مادة"],
  room: ["room", "salle", "amphi", "location", "القاعة", "قاعة"],
  professor: ["professor", "prof", "professeur", "teacher", "enseignant", "الأستاذ", "استاذ", "أستاذ"],
  group: ["group", "groupe", "الفوج", "فوج", "المجموعة"],
  kind: ["type", "kind", "النوع", "نوع"],
  from: ["valid from", "active from", "date debut", "date début", "من تاريخ"],
  until: ["valid to", "active to", "date fin", "إلى تاريخ"],
};

const DAYS = {
  1: ["1", "monday", "mon", "lundi", "lun", "الاثنين", "الإثنين", "اثنين", "الاتنين"],
  2: ["2", "tuesday", "tue", "mardi", "mar", "الثلاثاء", "ثلاثاء"],
  3: ["3", "wednesday", "wed", "mercredi", "mer", "الأربعاء", "الاربعاء", "اربعاء"],
  4: ["4", "thursday", "thu", "jeudi", "jeu", "الخميس", "خميس"],
  5: ["5", "friday", "fri", "vendredi", "ven", "الجمعة", "جمعة"],
  6: ["6", "saturday", "sat", "samedi", "sam", "السبت", "سبت"],
  7: ["7", "sunday", "sun", "dimanche", "dim", "الأحد", "الاحد", "أحد"],
};
const DAY_LOOKUP = new Map(Object.entries(DAYS).flatMap(([n, names]) => names.map((x) => [normalize(x).toLowerCase(), Number(n)])));

const norm = (s) => normalize(String(s ?? "")).toLowerCase().trim();

/** Splits CSV text into rows of fields; handles quotes, doubled quotes and embedded newlines. `lines[i]` is the file line row i starts on. */
function splitRows(textIn, delimiter, lines = []) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const src = String(textIn).replace(/^\uFEFF/, "");
  const flush = () => {
    row.push(field); field = "";
    if (row.some((x) => x.trim() !== "")) { rows.push(row); lines.push(rowLine); }
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\n" || (c === "\r" && src[i + 1] !== "\n")) line++;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      flush();
      rowLine = line;
    } else field += c;
  }
  flush();
  return rows;
}

function detectDelimiter(textIn) {
  const head = String(textIn).split(/\r?\n/).slice(0, 5).join("\n");
  const count = (d) => (head.match(new RegExp(d === "\t" ? "\\t" : `\\${d}`, "g")) || []).length;
  const best = [",", ";", "\t"].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0];
  return best[1] ? best[0] : ",";
}

function mapHeader(cells) {
  const map = {};
  cells.forEach((c, i) => {
    const n = norm(c);
    for (const [field, names] of Object.entries(HEADERS)) if (names.map(norm).includes(n) && !(field in map)) map[field] = i;
  });
  return map;
}

function parse({ content }) {
  const textIn = String(content ?? "");
  if (!textIn.trim()) return { error: "empty_file" };
  if (Buffer.byteLength(textIn, "utf8") > MAX_BYTES) return { error: "file_too_large" };
  const lineOf = [];
  const rows = splitRows(textIn, detectDelimiter(textIn), lineOf);
  if (rows.length < 2) return { error: "no_rows" };
  const map = mapHeader(rows[0]);
  const missing = ["day", "start", "end", "subject"].filter((f) => !(f in map));
  if (missing.length) return { error: "missing_columns", missing };
  const raw = [];
  const rejected = [];
  rows.slice(1, MAX_ROWS + 1).forEach((cells, i) => {
    const line = lineOf[i + 1]; // real file line, whatever blank lines or multi-line cells came before
    const get = (f) => (f in map ? String(cells[map[f]] ?? "").trim().slice(0, 400) : "");
    const weekday = DAY_LOOKUP.get(norm(get("day")));
    if (!weekday) return rejected.push({ line, reason: "invalid_weekday" });
    const subject = get("subject");
    const kind = get("kind") ? inferKind(get("kind")) : inferKind(subject);
    raw.push({
      line, weekday, startTime: normalizeTime(get("start")) ?? get("start"), endTime: normalizeTime(get("end")) ?? get("end"),
      subjectName: stripKind(subject), kind, room: get("room"), professor: get("professor"), groupLabel: get("group"),
      activeFrom: get("from") || null, activeTo: get("until") || null,
    });
  });
  const c = toCandidates(raw);
  const bad = c.rejected.map((r) => ({ line: raw[r.index].line, reason: r.reason }));
  return { slots: c.slots, rejected: [...rejected, ...bad].sort((a, b) => a.line - b.line), warnings: [...(rows.length - 1 > MAX_ROWS ? ["truncated"] : []), ...(c.truncated ? ["truncated"] : [])], notes: null };
}

module.exports = { id: "csv", parse, splitRows, detectDelimiter, MAX_BYTES };
