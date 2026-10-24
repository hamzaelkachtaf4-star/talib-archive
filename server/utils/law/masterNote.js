// Qanouni Collab: pure helpers for the squad's master lecture note (المحاضرة الجامعة).
// - The outline (planJson) is read from Markdown headings, following the Moroccan plan: القسم / الفصل /
//   المبحث / المطلب / الفقرة (or Partie / Chapitre / Section / Paragraphe).
// - "Law Blame": each section keeps the member who last changed its text; an edit only re-attributes the
//   sections whose text actually changed.
// - Source pins are citations, never files: a corpus article ("ref", must resolve in LawArticle) or a
//   bibliographic reference to a document ("document"). Raw recordings are never shared.
const { normalizeCanonicalId } = require("./arabic");

const MAX_CONTENT = 200_000;
const MAX_PINS = 50;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

// Word end that also works after Arabic letters (\b does not: Arabic is not a regex "word" character).
const END = "(?![\\p{L}])";
const KINDS = [
  ["part", new RegExp(`^(القسم|الجزء|partie)${END}`, "iu")],
  ["chapter", new RegExp(`^(الفصل|الباب|chapitre|titre)${END}`, "iu")],
  ["section", new RegExp(`^(المبحث|section)${END}`, "iu")],
  ["subsection", new RegExp(`^(المطلب|sous-section)${END}`, "iu")],
  ["paragraph", new RegExp(`^(الفقرة|paragraphe|§)`, "iu")],
  ["intro", new RegExp(`^(مقدمة|تقديم|introduction)${END}`, "iu")],
  ["conclusion", new RegExp(`^(خاتمة|خلاصة|conclusion)${END}`, "iu")],
];

function kindOf(heading) {
  const h = String(heading).replace(/^[\s\d.\-–—)(]+/, "");
  return KINDS.find(([, re]) => re.test(h))?.[0] || "other";
}

/** Splits Markdown into sections at headings. The text before the first heading is the "_intro" section. */
function parseSections(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const sections = [];
  const seen = new Map();
  let current = { key: "_intro", level: 0, heading: "", lines: [] };
  const push = () => {
    const body = current.lines.join("\n").trim();
    if (current.key !== "_intro" || body) sections.push({ ...current, body, lines: undefined });
  };
  for (const line of lines) {
    const m = HEADING.exec(line);
    if (!m) {
      current.lines.push(line);
      continue;
    }
    push();
    const heading = m[2].trim();
    const base = heading.replace(/\s+/g, " ").toLowerCase();
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    current = { key: n > 1 ? `${base}#${n}` : base, level: m[1].length, heading, lines: [] };
  }
  push();
  return sections.map(({ lines: _l, ...s }) => s);
}

/** Nested outline from the headings: [{heading, level, kind, children}]. */
function outline(sections) {
  const root = { level: 0, children: [] };
  const stack = [root];
  for (const s of sections) {
    if (!s.level) continue;
    const node = { heading: s.heading, level: s.level, kind: kindOf(s.heading), children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= s.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

/**
 * Law Blame: authors for the new version. A section keeps its previous author when its heading and text
 * are unchanged; otherwise it belongs to the editor.
 */
function blame(prevSections, prevAuthors, nextSections, editorId) {
  const prevBody = new Map(prevSections.map((s) => [s.key, s.body]));
  const prevBy = new Map((prevAuthors || []).map((a) => [a.key, a.userId]));
  return nextSections.map((s) => ({
    key: s.key,
    heading: s.heading,
    userId:
      prevBody.has(s.key) && prevBody.get(s.key) === s.body && prevBy.has(s.key)
        ? prevBy.get(s.key)
        : editorId,
  }));
}

/** Share of the note's text per member, in whole percents that add up to 100. */
function contributors(sections, authors) {
  const byKey = new Map(authors.map((a) => [a.key, a.userId]));
  const chars = new Map();
  let total = 0;
  for (const s of sections) {
    const len = (s.heading + s.body).length || 1;
    const uid = byKey.get(s.key);
    if (uid === undefined) continue;
    chars.set(uid, (chars.get(uid) || 0) + len);
    total += len;
  }
  if (!total) return [];
  const rows = [...chars.entries()].map(([userId, c]) => ({ userId, exact: (c / total) * 100 }));
  rows.forEach((r) => (r.percent = Math.floor(r.exact)));
  let left = 100 - rows.reduce((s, r) => s + r.percent, 0);
  [...rows].sort((a, b) => (b.exact % 1) - (a.exact % 1)).forEach((r) => left-- > 0 && r.percent++);
  return rows.map(({ userId, percent }) => ({ userId, percent })).sort((a, b) => b.percent - a.percent);
}

/** Validated pins: [{id:"pin-N", type:"ref"|"document", ref, label}] or an error code. */
function cleanPins(raw) {
  if (raw === undefined || raw === null) return { pins: [] };
  if (!Array.isArray(raw) || raw.length > MAX_PINS) return { error: "invalid pins" };
  const out = [];
  const ids = new Set();
  for (const p of raw) {
    const id = String(p?.id || "");
    if (!/^pin-\d{1,3}$/.test(id) || ids.has(id)) return { error: "invalid pin id" };
    ids.add(id);
    const type = p?.type === "ref" ? "ref" : p?.type === "document" ? "document" : null;
    if (!type) return { error: "invalid pin type" };
    let ref = String(p?.ref || "").trim().slice(0, 300);
    if (type === "ref") {
      ref = normalizeCanonicalId(ref);
      if (!ref) return { error: "invalid article reference" };
    } else if (!ref) return { error: "invalid document reference" };
    out.push({ id, type, ref, label: String(p?.label || "").trim().slice(0, 200) || null });
  }
  return { pins: out };
}

/** Pin ids cited in the text ([^pin-3]) that have no pin. */
function danglingPins(content, pins) {
  const have = new Set(pins.map((p) => p.id));
  return [...new Set([...String(content).matchAll(/\[\^(pin-\d{1,3})\]/g)].map((m) => m[1]))].filter(
    (id) => !have.has(id)
  );
}

// Links that would expose the app's private media (recordings, uploads, signed asset URLs) or any audio file.
const MEDIA = [
  /\/api\/law\//i,
  /\/law\/assets\b/i,
  /\bdata:[a-z]+\/[\w.+-]+;base64,/i,
  /\bblob:/i,
  /\.(mp3|m4a|wav|ogg|oga|opus|webm|aac|flac|amr|3gp|mp4|m4v|mov)(\?|#|\s|\)|$)/i,
];

/** True when the note (text or pins) links to app media or audio/video: such a note cannot be made public. */
function hasMediaLinks(content, pins = []) {
  const texts = [String(content || ""), ...pins.map((p) => String(p.ref || ""))];
  return texts.some((t) => MEDIA.some((re) => re.test(t)));
}

module.exports = {
  MAX_CONTENT,
  hasMediaLinks,
  parseSections,
  outline,
  blame,
  contributors,
  cleanPins,
  danglingPins,
  kindOf,
};
