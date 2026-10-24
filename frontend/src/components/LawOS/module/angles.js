// Pure helpers behind the learning angles of a module (tree, tables, graph, cards and Q/A). Every angle reads the same
// content tree (nodes: {id, parentId, title, body, order}); nothing is invented: a summary is the start of the student's own
// text, a legal reference is an article citation found in it, and a question is built from a heading.
import { childrenMap } from "./treeModel";
import { foldArabic } from "@/components/LawOS/lib/graphIndex";

const FENCE = /```[\s\S]*?```/g;

/** Plain text of a markdown body: no fences, no markup characters, one line. */
export function plain(md) {
  return String(md || "")
    .replace(FENCE, " ")
    .replace(/^>\s?/gm, "")
    .replace(/[*_`#|]/g, "")
    .replace(/^\s*[-•●▪]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The start of a text, cut at a word boundary, with an ellipsis only when something was cut. */
export function snippet(md, max = 160) {
  const t = plain(md);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trim()}…`;
}

// «الفصل 77», «ف. 230 ق.ل.ع», «المادة 5 مكرر», «م 12 من مدونة الشغل»
// The one-letter abbreviation must start a word («م 12», not the last letter of «يوم 12»), and the number must not be part of a law number («70.03»).
const REF = /(?:الفصل(?:ان|ين)?|الفصول|المادة|المواد|(?<![\u0600-\u06ff])[فم])\.?\s*(\d{1,4})(?!\.?\d)(?:\s*(?:مكرر|ثالثا|ثانيا))?(?:\s*(?:من\s+)?(ق\.\s?ل\.\s?ع|ق\.\s?ج|ق\.\s?م\.\s?م|م\.\s?ت|م\.\s?ش|م\.\s?أ|ظ\.\s?ل\.\s?ع|الدستور|مدونة\s+[؀-ۿ]+|القانون\s+[؀-ۿ]+))?/g;

/** Article citations found in a text, in order, without repeats (max `limit`). */
export function refsOf(text, limit = 3) {
  const out = [];
  for (const m of String(text || "").replace(FENCE, " ").matchAll(REF)) {
    const label = m[0].replace(/\s+/g, " ").trim();
    if (!out.includes(label)) out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

/** Top-level nodes of the tree, in order: the units the angles are shown for. */
export function unitsOf(nodes) {
  return childrenMap(withRoots(nodes)).get(null) || [];
}

/** A node whose parent no longer exists is shown as a top-level unit, never lost (same rule as the reader). */
export function withRoots(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes.map((n) => (n.parentId && !ids.has(n.parentId) ? { ...n, parentId: null } : n));
}

/** First unit worth showing: one with written text under it, else one with branches, else the first. */
export function defaultUnit(nodes) {
  const u = unitsOf(nodes);
  const kids = childrenMap(withRoots(nodes));
  const written = (n) => (kids.get(n.id) || []).some((c) => String(c.body || "").trim() || written(c));
  return (u.find((x) => written(x)) || u.find((x) => (kids.get(x.id) || []).length) || u[0] || null)?.id ?? null;
}

/**
 * The branches of a unit: its children when it has some; otherwise the bullet lines of its own text. Each branch carries the
 * student's text as `body`, a short `summary`, and the legal references found in it.
 */
export function branchesOf(nodes, unitId) {
  const kids = childrenMap(withRoots(nodes));
  const unit = nodes.find((n) => n.id === unitId);
  if (!unit) return [];
  const under = (n) => (kids.get(n.id) || []).flatMap((c) => [c, ...under(c)]);
  const children = kids.get(unit.id) || [];
  if (children.length) {
    return children.map((c) => {
      const deep = under(c);
      const body = [c.body, ...deep.map((d) => `${d.title}: ${d.body || ""}`)].filter((x) => String(x).trim()).join("\n");
      return { id: c.id, title: c.title, raw: body, body: plain(c.body) || plain(deep.map((d) => d.title).join("، ")), summary: snippet(c.body || deep.map((d) => d.title).join("، "), 90), refs: refsOf(`${c.title} ${body}`), count: deep.length, node: c };
    });
  }
  const lines = String(unit.body || "").replace(FENCE, "\n").split("\n").map((l) => l.replace(/^\s*[-•●▪*]\s+/, "").trim()).filter((l) => l.length > 3);
  return lines.slice(0, 40).map((l, i) => {
    const m = l.match(/^([^:：—–]{2,60})[:：—–]\s*(.+)$/);
    const title = m ? plain(m[1]) : snippet(l, 60);
    const body = m ? plain(m[2]) : plain(l);
    return { id: `${unit.id}:${i}`, fromBody: true, title, raw: l, body, summary: snippet(body, 90), refs: refsOf(l), count: 0, node: unit };
  });
}

/** Q/A pairs for a unit: a question from each heading, the student's own text as the answer. Branches without text are left out. */
export function qaOf(branches, ask) {
  return branches.filter((b) => b.body).map((b) => ({ id: b.id, q: ask(b.title), a: b.body, refs: b.refs }));
}

/** Article node ids of the legal graph that a module's text cites ("DOC:77"), from «ف 77 ق.ل.ع»-style references. */
const CODE_BY_ABBREV = { "قلع": "DOC", "ظلع": "DOC", "قج": "CP", "قمم": "CPC-58.25", "مت": "CCOM", "مش": "CT", "ما": "MOUDAWANA" };
export function graphIdsOf(nodes, index) {
  const ids = new Set();
  for (const n of nodes) {
    for (const m of `${n.title} ${n.body || ""}`.replace(FENCE, " ").matchAll(REF)) {
      const code = m[2] ? m[2].replace(/[\s.]/g, "") : "";
      const slug = CODE_BY_ABBREV[code] || (code === "الدستور" ? "CONST-2011" : null);
      if (slug && index.nodes.has(`${slug}:${m[1]}`)) ids.add(`${slug}:${m[1]}`);
    }
  }
  return [...ids];
}

/** Concept nodes of the legal graph whose title appears in the module's headings or text (4+ letters, so no accidental hits). */
export function conceptIdsOf(nodes, index) {
  const hay = foldArabic(nodes.map((n) => `${n.title} ${n.body || ""}`).join(" \n "));
  const ids = [];
  for (const n of index.nodes.values()) {
    if (n.type !== "concept") continue;
    const t = foldArabic(n.titleAr || "");
    if (t.length >= 4 && hay.includes(t)) ids.push(n.id);
  }
  return ids;
}

/** A short label for the rail: the part of a heading after the last dash or colon («مسؤولية مدنية — 01: الضرر» becomes «الضرر»). */
export function shortTitle(title, max = 32) {
  const t = String(title || "").trim();
  const parts = t.split(/\s*[—–:：]\s*/).filter(Boolean);
  const last = (parts.length > 1 ? parts[parts.length - 1] : t).replace(/^\s*(الدرس|الحصة|الفصل|المحور)\s*\d+\s*/, "").trim() || t;
  return last.length > max ? `${last.slice(0, max).trim()}…` : last;
}

/** The worked example inside a text, when the student wrote one («مثال: …», «نازلة: …»): the words after the marker. Null when there is none. */
export function exampleOf(md) {
  for (const raw of String(md || "").replace(FENCE, " ").split("\n")) {
    const line = raw.replace(/^[\s>*•\-●▪]+/, "").replace(/\*\*/g, "");
    const m = line.match(/(?:^|\s)(?:مثال|أمثلة|نازلة|تطبيق)[^:：]{0,40}[:：]\s*(.+)$/);
    if (m && m[1].trim().length > 8) return plain(m[1]);
  }
  return null;
}

/**
 * Comprehension check for a session, built only from the student's own branches: each question asks what a heading means and the
 * options are the text of that branch and of two others. Null when there are fewer than two branches with text (then the
 * session is simply marked understood).
 */
export function masteryQuestions(branches, ask, max = 5) {
  const withText = branches.filter((b) => b.body);
  if (withText.length < 2) return null;
  const pool = withText.map((b) => ({ b, text: snippet(b.body, 110) }));
  const built = pool.slice(0, max).map((x, i) => {
    const others = pool.filter((_, j) => j !== i).filter((o) => o.text !== x.text);
    const wrong = [others[i % others.length], others[(i + 1) % others.length]].filter(Boolean).map((o) => o.text);
    const options = [...new Set([x.text, ...wrong])];
    const rot = i % options.length; // deterministic shuffle: the key moves around instead of always being first
    const shuffled = [...options.slice(rot), ...options.slice(0, rot)];
    return { id: x.b.id, q: ask(x.b.title), options: shuffled, correct: shuffled.indexOf(x.text), refs: x.b.refs };
  });
  return built.every((q) => q.options.length >= 2) ? built : null; // a question with one option would pass trivially: skip the check instead
}
