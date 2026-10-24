// Qanouni Collab Phase C: AI multi-source synthesis of one lecture (التجميع الذكي لمصادر المحاضرة).
// Several members' private raw inputs → one structured master-note draft (المبحث / المطلب / الفقرة) with
// automatic source pins. The model returns sections; Markdown and pins are built here, so structure and
// citations are guaranteed. Article references are kept only when they resolve in the local corpus
// (LAW-OS grounding rule); the others are stripped and reported. Nothing is saved here: the draft goes to the
// note editor, and a member saves it.
const { generate } = require("./ai/router");
const { loadPrompt } = require("./prompts");
const { normalizeCanonicalId } = require("./arabic");
const { runAs } = require("./tenant");

const MAX_SOURCES = 12;
const MAX_SOURCE_CHARS = 20000;
const MAX_TOTAL_CHARS = 60000;
const KIND_LABELS = { transcript: "تفريغ صوتي", board_ocr: "صورة السبورة", text: "نص مرجعي" };

const SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    sections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          heading: { type: "STRING" },
          level: { type: "INTEGER" },
          body: { type: "STRING" },
          sourceIds: { type: "ARRAY", items: { type: "STRING" } },
          articleRefs: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["heading", "level", "body", "sourceIds"],
      },
    },
    gaps: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["title", "sections"],
};

/** Course-plan headings as indented text (the lecturer's hierarchy), or "". */
function planText(tree, depth = 0) {
  return (Array.isArray(tree) ? tree : [])
    .map((n) => `${"  ".repeat(depth)}- ${String(n?.title || "").slice(0, 200)}\n${planText(n?.children, depth + 1)}`)
    .join("");
}

/** The prompt's user parts: context, then each source fenced and labelled S1…Sn (trimmed to the budgets). */
function sourceParts(sources, { moduleName, professorName, sessionNumber, plan }) {
  let budget = MAX_TOTAL_CHARS;
  const parts = [
    {
      text: [
        `المادة: ${moduleName}`,
        `الأستاذ(ة): ${professorName}`,
        `الحصة رقم: ${sessionNumber}`,
        plan ? `تصميم الأستاذ (اتبعه):\n${plan}` : "لا يوجد تصميم للأستاذ: اعتمد المبحث / المطلب / الفقرة.",
      ].join("\n"),
    },
  ];
  sources.forEach((s, i) => {
    const text = s.content.slice(0, Math.min(MAX_SOURCE_CHARS, Math.max(0, budget)));
    budget -= text.length;
    parts.push({ text: `<<<S${i + 1} | ${KIND_LABELS[s.kind] || s.kind} | ${s.label}>>>\n${text}\n<<<نهاية S${i + 1}>>>` });
  });
  return parts;
}

const clampLevel = (l) => Math.min(4, Math.max(2, Number.isInteger(l) ? l : 2));
const cleanHeading = (h) => String(h || "").replace(/^#+\s*/, "").replace(/\s+/g, " ").trim().slice(0, 200);

/**
 * Builds the draft from the model's JSON: Markdown sections with [^pin-N] markers, one "document" pin per
 * source actually used, and "ref" pins for articles that resolve. Inline "[ID]" mentions of unknown articles
 * are removed from the text. `resolve(ids)` → { [id]: {exists} } (LawCorpus.resolve).
 */
async function buildDraft(json, sources, resolve) {
  const sections = (Array.isArray(json?.sections) ? json.sections : []).filter((s) => cleanHeading(s?.heading) || s?.body);
  const candidates = new Set();
  for (const s of sections)
    for (const r of Array.isArray(s.articleRefs) ? s.articleRefs : []) {
      const id = normalizeCanonicalId(r);
      if (id) candidates.add(id);
    }
  const inline = /\[([A-Za-z][A-Za-z0-9.-]*\s*:\s*[0-9A-Za-z؀-ۿ-]+)\]/g;
  for (const s of sections) for (const m of String(s.body || "").matchAll(inline)) {
    const id = normalizeCanonicalId(m[1]);
    if (id) candidates.add(id);
  }
  const resolved = candidates.size ? await resolve([...candidates]) : {};
  const exists = (id) => !!resolved[id]?.exists;

  const pins = [];
  const pinFor = new Map(); // "S1" | "DOC:77" → pin id
  const pin = (keyId, make) => {
    if (!pinFor.has(keyId)) {
      const id = `pin-${pins.length + 1}`;
      pins.push({ id, ...make() });
      pinFor.set(keyId, id);
    }
    return pinFor.get(keyId);
  };
  const stripped = new Set();
  const lines = [];
  for (const s of sections) {
    const marks = [];
    for (const sid of Array.isArray(s.sourceIds) ? s.sourceIds : []) {
      const n = Number(String(sid).replace(/^S/i, ""));
      const src = sources[n - 1];
      if (!src) continue;
      marks.push(pin(`S${n}`, () => ({ type: "document", ref: `${KIND_LABELS[src.kind] || src.kind} · ${src.label}`, label: null })));
    }
    for (const r of Array.isArray(s.articleRefs) ? s.articleRefs : []) {
      const id = normalizeCanonicalId(r);
      if (!id) continue;
      if (exists(id)) marks.push(pin(id, () => ({ type: "ref", ref: id, label: null })));
      else stripped.add(id);
    }
    const body = String(s.body || "")
      .replace(inline, (m, raw) => {
        const id = normalizeCanonicalId(raw);
        if (id && exists(id)) return `[^${pin(id, () => ({ type: "ref", ref: id, label: null }))}]`;
        if (id) stripped.add(id);
        return "";
      })
      .trim();
    const heading = cleanHeading(s.heading);
    if (heading) lines.push(`${"#".repeat(clampLevel(s.level))} ${heading}`);
    const tail = [...new Set(marks)].filter((m) => !body.includes(`[^${m}]`)); // not already cited inline
    lines.push(`${body}${tail.map((m) => ` [^${m}]`).join("")}`.trim(), "");
  }
  return {
    title: cleanHeading(json?.title) || "مسودة المحاضرة",
    content: lines.join("\n").trim(),
    sourcePins: pins,
    strippedRefs: [...stripped],
    gaps: (Array.isArray(json?.gaps) ? json.gaps : []).map((g) => String(g).slice(0, 300)).slice(0, 20),
    sourcesUsed: [...pinFor.keys()].filter((k) => /^S\d+$/.test(k)).length,
  };
}

/**
 * @param {{sources:{kind,label,content}[], workspace:{moduleName,professorName}, sessionNumber:number,
 *   coursePlan?:object[]}} input
 */
async function synthesize({ sources, workspace, sessionNumber, coursePlan = null }) {
  if (sources.length < 2) return { error: "need_two_sources" };
  const used = sources.slice(0, MAX_SOURCES);
  const prompt = loadPrompt("synthesize_master_note", 1);
  const out = await generate({
    purpose: "master_note_synthesis",
    prompt,
    system: prompt.text,
    parts: sourceParts(used, { ...workspace, sessionNumber, plan: planText(coursePlan) }),
    schema: SCHEMA,
    temperature: 0.2,
    maxOutputTokens: 16384,
  });
  const { LawCorpus } = require("../../models/lawCorpus");
  return {
    draft: await buildDraft(out.json, used, (ids) => runAs({ system: true }, () => LawCorpus.resolve(ids))),
    error: null,
  };
}

module.exports = { synthesize, buildDraft, sourceParts, planText, SCHEMA, KIND_LABELS, MAX_SOURCE_CHARS };
