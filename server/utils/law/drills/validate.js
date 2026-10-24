// Deterministic checks around the exam center's drills. The model proposes; these functions decide what is kept.
//  - generation: an item without a citation to one of the labelled pieces we sent is dropped ("uncited items" never reach a student)
//  - client view: the answer key never leaves the server before the attempt is submitted
//  - answers: a case needs its four sections, a dissertation outline needs the exact skeleton
//  - scoring: from verdicts and the outline checklist, never from a number the model made up
const E = require("../enums");

const clip = (v, n) => (typeof v === "string" ? v.replace(/\s+\n/g, "\n").trim().slice(0, n) : "");
const label = (v, labelOf) => { const k = String(v ?? "").replace(/[\[\]\s]/g, ""); return labelOf.has(k) ? k : null; };

/** Fisher-Yates on a copy; `rng` is injectable so tests can pin the order. */
function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * QCM items: 4 distinct non-empty options, one valid correct index, a citation. Options are shuffled here, not by the model,
 * so the right answer is not always where the model likes to put it (correctIndex follows the option).
 */
function cleanQcm(raw, labelOf, max = 10, { rng = Math.random } = {}) {
  const out = [];
  for (const r of Array.isArray(raw?.items) ? raw.items : []) {
    const cite = label(r?.cite, labelOf);
    const options = Array.isArray(r?.options) ? r.options.map((o) => clip(o, 300)) : [];
    const question = clip(r?.question, 600);
    if (!cite || !question || options.length !== 4 || options.some((o) => !o) || new Set(options).size !== 4) continue;
    if (!Number.isInteger(r.correctIndex) || r.correctIndex < 0 || r.correctIndex > 3) continue;
    const order = shuffled([0, 1, 2, 3], rng);
    out.push({ question, options: order.map((i) => options[i]), correctIndex: order.indexOf(r.correctIndex), explanation: clip(r.explanation, 800), cite });
    if (out.length >= max) break;
  }
  return out;
}

/** A case: facts plus the key points of the four sections, every point cited. Needs at least one point per section. */
function cleanCase(raw, labelOf) {
  const facts = clip(raw?.facts, 3000);
  const points = [];
  for (const p of Array.isArray(raw?.keyPoints) ? raw.keyPoints : []) {
    const cite = label(p?.cite, labelOf);
    const section = String(p?.section || "").trim();
    const point = clip(p?.point, 600);
    if (cite && point && E.isOneOf(E.CASE_SECTIONS, section)) points.push({ section, point, cite });
  }
  const covered = new Set(points.map((p) => p.section));
  if (facts.length < 40 || !E.CASE_SECTIONS.every((s) => covered.has(s))) return null;
  return { facts, keyPoints: points.slice(0, 16) };
}

/** Direct theory questions: a definition or a distinction, with a reference answer built from the sources. */
function cleanDirect(raw, labelOf, max = 6) {
  const out = [];
  for (const r of Array.isArray(raw?.items) ? raw.items : []) {
    const cite = label(r?.cite, labelOf);
    const question = clip(r?.question, 500);
    const referenceAnswer = clip(r?.referenceAnswer, 1500);
    if (!cite || !question || !referenceAnswer) continue;
    out.push({ question, kind: r.kind === "distinction" ? "distinction" : "definition", referenceAnswer, cite });
    if (out.length >= max) break;
  }
  return out;
}

function cleanDissertation(raw, labelOf) {
  const topic = clip(raw?.topic, 400);
  const axes = [];
  for (const a of Array.isArray(raw?.keyAxes) ? raw.keyAxes : []) {
    const cite = label(a?.cite, labelOf);
    const axis = clip(a?.axis, 400);
    if (cite && axis) axes.push({ axis, cite });
  }
  return topic && axes.length ? { topic, keyAxes: axes.slice(0, 8) } : null;
}

/** What a student may see before submitting: questions and options, never keys, reference answers or citations. */
function clientView(type, prompt) {
  switch (type) {
    case "qcm": return { items: prompt.items.map((i) => ({ question: i.question, options: i.options })) };
    case "case": return { facts: prompt.facts, sections: E.CASE_SECTIONS };
    case "direct": return { items: prompt.items.map((i) => ({ question: i.question, kind: i.kind })) };
    case "dissertation": return { topic: prompt.topic };
    default: return {};
  }
}

// ---- answers ----
const MIN_SECTION = 15;
const MAX_SECTION = 6000;

/** answers: [index per item]. Every item answered, each index 0-3. */
function validateQcmAnswers(answers, count) {
  if (!Array.isArray(answers) || answers.length !== count) return { error: "invalid_answers" };
  if (answers.some((a) => !Number.isInteger(a) || a < 0 || a > 3)) return { error: "invalid_answers" };
  return { answers };
}

function gradeQcm(prompt, answers) {
  const items = prompt.items.map((it, i) => ({ chosen: answers[i], correctIndex: it.correctIndex, correct: answers[i] === it.correctIndex, explanation: it.explanation, cite: it.cite }));
  return { items, score: Math.round((100 * items.filter((i) => i.correct).length) / items.length) };
}

/** The four sections of a case, each long enough to be an attempt rather than a placeholder. */
function validateCaseAnswer(a) {
  if (!a || typeof a !== "object") return { error: "invalid_answer" };
  const out = {};
  const missing = [];
  for (const s of E.CASE_SECTIONS) {
    const t = typeof a[s] === "string" ? a[s].trim() : "";
    if (t.length < MIN_SECTION) missing.push(s);
    else if (t.length > MAX_SECTION) return { error: "invalid_answer" };
    out[s] = t;
  }
  return missing.length ? { error: "missing_sections", missing } : { answer: out };
}

function validateDirectAnswers(answers, count) {
  if (!Array.isArray(answers) || answers.length !== count) return { error: "invalid_answers" };
  const out = answers.map((a) => (typeof a === "string" ? a.trim() : ""));
  if (out.some((a) => a.length < 3 || a.length > 3000)) return { error: "invalid_answers" };
  return { answers: out };
}

/**
 * The dissertation skeleton: مقدمة · إشكالية · المبحث الأول · المبحث الثاني (each with its مطالب).
 * errors are blocking codes; warnings are advice (unbalanced parts).
 */
function validateOutline(o) {
  const errors = [];
  const warnings = [];
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  if (!o || typeof o !== "object") return { valid: false, errors: ["invalid_outline"], warnings };
  const intro = str(o.intro, 4000);
  const problem = str(o.problem, 2000);
  if (intro.length < 10) errors.push("intro_missing");
  if (problem.length < 10) errors.push("problem_missing");
  else if (!/[?؟]/.test(problem)) errors.push("problem_not_a_question");
  const parts = Array.isArray(o.parts) ? o.parts : [];
  if (parts.length !== 2) errors.push("two_parts_required");
  const cleanParts = parts.slice(0, 2).map((p) => ({ title: str(p?.title, 200), subs: (Array.isArray(p?.subs) ? p.subs : []).map((x) => str(x, 200)) }));
  cleanParts.forEach((p, i) => {
    if (p.title.length < 3) errors.push(`part${i + 1}_title_missing`);
    if (p.subs.length < 2 || p.subs.length > 3 || p.subs.some((x) => x.length < 3)) errors.push(`part${i + 1}_needs_2_or_3_subsections`);
  });
  const titles = [...cleanParts.map((p) => p.title), ...cleanParts.flatMap((p) => p.subs)].filter(Boolean);
  if (new Set(titles).size !== titles.length) errors.push("duplicate_titles");
  if (cleanParts.length === 2 && cleanParts[0].subs.length !== cleanParts[1].subs.length) warnings.push("unbalanced_parts");
  return { valid: errors.length === 0, errors, warnings, outline: { intro, problem, parts: cleanParts } };
}

// ---- scoring from verdicts ----
const POINTS = { good: 1, partial: 0.5, missing: 0 };
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x) => Math.round(100 * x);

/** Part names the critique may use for the four dissertation units (the schema asks for the exact keys; synonyms are tolerated). */
function partKey(v) {
  const t = String(v ?? "").toLowerCase().replace(/[\s_\-.]/g, "");
  if (/^(intro|introduction|مقدمة|مقدمه)$/.test(t)) return "intro";
  if (/^(problem|problematique|problématique|إشكالية|اشكالية|الإشكالية)$/.test(t)) return "problem";
  if (/^(part1|partie1|premierepartie|firstpart|المبحثالأول|المبحثالاول|مبحث1|1)$/.test(t)) return "part1";
  if (/^(part2|partie2|deuxiemepartie|deuxièmepartie|secondpart|المبحثالثاني|مبحث2|2)$/.test(t)) return "part2";
  return t;
}

/**
 * The model's verdict per required unit. `judged` is false for a unit it did not (validly) judge: that counts as missing in
 * the rows but the caller can tell "the student missed it" from "the marker skipped it" with allJudged().
 */
function scoreByUnits(required, judged, keyOf) {
  const byKey = new Map();
  for (const j of judged || []) if (POINTS[j?.verdict] != null) byKey.set(String(keyOf(j)), j);
  const rows = required.map((k) => {
    const j = byKey.get(String(k));
    return { key: k, verdict: j ? j.verdict : "missing", comment: j ? clip(j.comment, 800) : "", cite: j?.cite || null, judged: !!j };
  });
  return { rows, score: pct(avg(rows.map((r) => POINTS[r.verdict]))), allJudged: rows.every((r) => r.judged) };
}

module.exports = {
  cleanQcm, cleanCase, cleanDirect, cleanDissertation, clientView, validateQcmAnswers, gradeQcm, validateCaseAnswer,
  validateDirectAnswers, validateOutline, scoreByUnits, partKey, shuffled, POINTS, MIN_SECTION,
};
