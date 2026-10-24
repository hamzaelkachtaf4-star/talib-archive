// The study material of ONE module of ONE student: the content-tree nodes they wrote and the text of their lecture sources,
// cut into labelled pieces. The module mentor and the exam center build every prompt from these pieces only, and every
// citation in an answer or a drill has to point at one of them.
const { rawDb } = require("./dbClient");
const { normalize } = require("./arabic");

const CHUNK = 1200;
const MAX_TOTAL_CHARS = 1500000; // a module's sources are read newest-first up to this much text per request
const STOP = new Set(["في", "من", "على", "الى", "إلى", "عن", "ما", "ماذا", "هو", "هي", "هل", "ان", "أن", "إن", "كان", "كيف", "لماذا", "هذا", "هذه", "ذلك", "التي", "الذي", "او", "أو", "و", "ثم", "مع", "بين", "كل", "لا", "لم", "لن", "قد"].map((w) => normalize(w)));

const tokens = (s) => normalize(String(s || "")).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2 && !STOP.has(t));

/** Splits at paragraph boundaries into pieces of about `size` characters. */
function chunkText(text, size = CHUNK) {
  const out = [];
  let cur = "";
  for (const para of String(text).split(/\n{2,}/)) {
    if ((cur + "\n\n" + para).length > size && cur) { out.push(cur); cur = ""; }
    if (para.length > size) {
      for (let i = 0; i < para.length; i += size) out.push(para.slice(i, i + size));
    } else cur = cur ? `${cur}\n\n${para}` : para;
  }
  if (cur) out.push(cur);
  return out;
}

/** @returns {Promise<{pieces: {ref:string,label:string,text:string}[], nodes: object[]}>} ref is "n:<nodeId>" or "s:<sourceId>:<part>" */
async function materialOf(userId, moduleId) {
  const [nodes, sources] = await Promise.all([
    rawDb().lawModuleNode.findMany({ where: { userId, moduleId }, orderBy: [{ level: "asc" }, { ord: "asc" }], take: 2000 }),
    rawDb().lawLectureSource.findMany({ where: { userId, moduleId, status: "ready" }, orderBy: { id: "desc" }, take: 300 }),
  ]);
  const pieces = [];
  for (const n of nodes) if (n.body.trim()) pieces.push({ ref: `n:${n.id}`, label: n.title, text: n.body.slice(0, CHUNK * 2), cat: "lectures" });
  let budget = MAX_TOTAL_CHARS;
  for (const s of sources) { // newest first: the budget goes to the latest material
    const text = (s.extracted || "").slice(0, Math.max(0, budget));
    budget -= text.length;
    chunkText(text).forEach((t, i) => pieces.push({ ref: `s:${s.id}:${i}`, label: `${s.kind} #${s.id}`, text: t, cat: s.kind === "pdf" ? "printed" : "lectures" })); // a PDF is the printed handout; everything captured in class is a lecture
  }
  // texts the student linked to this module from the legal corpus (statute text is never taken from memory: it comes from here)
  pieces.push(...(await require("../../models/lawCorpusUser").LawCorpusUser.materialPieces(userId, moduleId)).map((p) => ({ ...p, cat: "legal" })).filter((p) => (budget -= p.text.length) >= 0)); // linked texts count against the same budget
  return { pieces, nodes };
}

/**
 * Top pieces by token overlap with the question (title matches count double). An empty question takes the first pieces;
 * with `broad` (e.g. "summarise", "build the notes") a request that shares no word with any piece does too.
 */
function retrieve(pieces, question, k = 8, { broad = false } = {}) {
  const q = new Set(tokens(question));
  const scored = pieces.map((p) => {
    const body = new Set(tokens(p.text));
    const title = new Set(tokens(p.label));
    let score = 0;
    for (const t of q) { if (body.has(t)) score += 1; if (title.has(t)) score += 2; }
    return { p, score };
  });
  const hits = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.p);
  return hits.length ? hits : q.size === 0 || broad ? pieces.slice(0, k) : [];
}

/** Pieces for a drill: focused on `topic` when given, otherwise a random spread of the module (rng injectable for tests). */
function sample(pieces, topic, k = 8, rng = Math.random) {
  if (topic && topic.trim()) return retrieve(pieces, topic, k);
  const a = [...pieces];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}

/**
 * How many of `k` slots each category gets, in proportion to its share (the largest remainders win the leftover slots).
 * A category without pieces gets nothing and its share goes to the others; a category with a share and pieces gets at least one.
 */
function allocate(k, mix, available) {
  const cats = Object.keys(mix).filter((c) => mix[c] > 0 && (available[c] || 0) > 0);
  const total = cats.reduce((n, c) => n + mix[c], 0);
  const out = Object.fromEntries(cats.map((c) => [c, 0]));
  if (!cats.length || k <= 0) return out;
  const exact = Object.fromEntries(cats.map((c) => [c, (k * mix[c]) / total]));
  for (const c of cats) out[c] = Math.min(available[c], Math.floor(exact[c]));
  let left = k - Object.values(out).reduce((a, b) => a + b, 0);
  const order = [...cats].sort((a, b) => exact[b] - Math.floor(exact[b]) - (exact[a] - Math.floor(exact[a])) || mix[b] - mix[a]);
  for (let guard = 0; left > 0 && guard < 4 * k; guard++) {
    let moved = false;
    for (const c of order) if (left > 0 && out[c] < available[c]) { out[c]++; left--; moved = true; }
    if (!moved) break;
  }
  for (const c of cats) if (out[c] === 0 && k >= cats.length && available[c] > 0) { const donor = cats.sort((a, b) => out[b] - out[a])[0]; if (out[donor] > 1) { out[donor]--; out[c] = 1; } }
  return out;
}

/** The student's own share of lectures / printed handout / legal texts. Null when it is not set or not valid. */
function parseMix(raw) {
  try {
    const m = typeof raw === "string" ? JSON.parse(raw) : raw;
    return m && ["lectures", "printed", "research", "legal"].every((k) => Number.isInteger(m[k]) && m[k] >= 0) ? m : null;
  } catch { return null; }
}

/**
 * Pieces for a request, following the student's mix. Without a mix this is plain retrieval/sampling. With one, a category at 0%
 * is left out entirely and the others contribute in proportion to their share ("research" has no pieces: it is not a source of
 * this module's own material, so its share is spread over the rest).
 */
function pickMixed(pieces, mix, topic, k, { broad = false, rng = Math.random } = {}) {
  const pick = (list, n) => (topic && topic.trim() ? retrieve(list, topic, n, { broad }) : sample(list, "", n, rng));
  if (!mix) return pick(pieces, k);
  const by = {};
  for (const p of pieces) (by[p.cat || "lectures"] = by[p.cat || "lectures"] || []).push(p);
  const avail = Object.fromEntries(Object.entries(by).map(([c, l]) => [c, l.length]));
  const share = allocate(k, mix, avail);
  const out = [];
  for (const [c, n] of Object.entries(share)) out.push(...pick(by[c], n));
  return out.slice(0, k);
}

/** Student text cannot close the sources fence. */
const fence = (s) => String(s).replace(/<\s*\/?\s*module_sources\s*>/gi, "");

/** "S1".."Sn" labels for a list of pieces, and the prompt block that carries them. */
function labelled(pieces) {
  const labelOf = new Map();
  pieces.forEach((p, i) => labelOf.set(`S${i + 1}`, p));
  const block = [...labelOf].map(([k, p]) => `[${k}] (${fence(p.label)})\n${fence(p.text)}`).join("\n\n");
  return { labelOf, block };
}

module.exports = { materialOf, retrieve, sample, allocate, parseMix, pickMixed, chunkText, tokens, fence, labelled, CHUNK };
