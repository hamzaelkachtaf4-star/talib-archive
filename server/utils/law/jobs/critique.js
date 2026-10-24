// Grounded critiques (spec §7.2, §8.2-8.3), run as jobs so they pass the budget gate and the one-at-a-time
// worker. Only submitted attempts / drafted dissertations reach here (write first, critique second).
const { db } = require("../dbClient");
const { generate, recordValidation } = require("../ai/router");
const { loadPrompt } = require("../prompts");
const { PermanentError } = require("../ai/errors");
const {
  retrieveEvidence,
  evidenceBlock,
  validateOutput,
} = require("../grounding");
const { runChecks } = require("../dissertationChecks");

const CITATIONS = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: { canonicalId: { type: "STRING" }, quote: { type: "STRING" } },
    required: ["canonicalId"],
  },
};
const STRS = { type: "ARRAY", items: { type: "STRING" } };

const CASE_SCHEMA = {
  type: "OBJECT",
  properties: {
    phases: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          phase: { type: "INTEGER" },
          correct: STRS,
          missing: STRS,
          wrong: STRS,
          rules: CITATIONS,
        },
        required: ["phase"],
      },
    },
    rubric: {
      type: "OBJECT",
      properties: {
        facts: { type: "INTEGER" },
        qualification: { type: "INTEGER" },
        rule: { type: "INTEGER" },
        application: { type: "INTEGER" },
        conclusion: { type: "INTEGER" },
      },
    },
    overall: { type: "STRING" },
    suggestedCards: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          front: { type: "STRING" },
          back: { type: "STRING" },
          canonicalIds: STRS,
        },
        required: ["front", "back"],
      },
    },
  },
  required: ["phases", "overall"],
};

const DISSERTATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    intro: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { step: { type: "STRING" }, comment: { type: "STRING" } },
      },
    },
    plan: { type: "STRING" },
    content: {
      type: "OBJECT",
      properties: { missing: STRS, wrong: STRS, rules: CITATIONS },
    },
    overall: { type: "STRING" },
  },
  required: ["overall"],
};

const PHASE_NAMES = [
  "عرض الوقائع المنتجة",
  "التكييف القانوني وتحديد الإشكالات",
  "استدعاء القاعدة القانونية",
  "المناقشة والإسقاط",
  "المنطوق والحل النهائي",
];

function phasesText(phases) {
  return PHASE_NAMES.map((name, i) => {
    const p = phases[String(i + 1)] || {};
    const cited = (p.citedIds || []).length
      ? `\n(النصوص التي استدعاها الطالب: ${p.citedIds.map((x) => `[${x}]`).join(" ")})`
      : "";
    return `## ${i + 1}. ${name}\n${p.text || "(فارغ)"}${cited}`;
  }).join("\n\n");
}

const clamp = (n) =>
  Math.max(0, Math.min(4, Number.isFinite(n) ? Math.round(n) : 0));

async function critiqueCase(job, ctx) {
  const attempt = await db().lawCaseAttempt.findUnique({
    where: { id: job.payload.attemptId },
    include: { exercise: true },
  });
  if (!attempt) throw new PermanentError("attempt not found");
  if (!attempt.submittedAt) throw new PermanentError("attempt not submitted");
  const phases = JSON.parse(attempt.phases || "{}");
  const studentIds = Object.values(phases).flatMap((p) => p.citedIds || []);
  const targets = JSON.parse(attempt.exercise.targetQualifications || "[]");
  const evidence = await retrieveEvidence({
    texts: [
      attempt.exercise.factsAr,
      ...Object.values(phases).map((p) => p.text || ""),
    ],
    ids: [...studentIds, ...targets],
  });

  const prompt = loadPrompt("case_critique", 1);
  const out = await generate({
    purpose: "case_critique",
    prompt,
    system: prompt.text,
    parts: [
      {
        text: `${evidenceBlock(evidence)}\n\n# الوقائع\n${attempt.exercise.factsAr}\n\n# حل الطالب\n${phasesText(phases)}`,
      },
    ],
    schema: CASE_SCHEMA,
    temperature: 0.2,
    maxOutputTokens: 8192,
    jobId: job.id,
  });
  ctx.track(out);
  const { output, check } = await validateOutput(out.json);
  await recordValidation(out.aiCallId, check);

  const r = output.rubric || {};
  const rubric = {
    facts: clamp(r.facts),
    qualification: clamp(r.qualification),
    rule: clamp(r.rule),
    application: clamp(r.application),
    conclusion: clamp(r.conclusion),
  };
  const cards = (output.suggestedCards || [])
    .map((c) => ({
      front: String(c.front || "").trim(),
      back: String(c.back || "").trim(),
      canonicalIds: (c.canonicalIds || []).filter((id) =>
        check.resolved.includes(id)
      ),
      acceptedCardId: null,
    }))
    .filter((c) => c.front && c.back);
  await db().lawCaseAttempt.update({
    where: { id: attempt.id },
    data: {
      critique: JSON.stringify({
        phases: output.phases || [],
        overall: output.overall || "",
      }),
      rubricScores: JSON.stringify(rubric),
      citationCheck: JSON.stringify(check),
      suggestedCards: JSON.stringify(cards),
      status: "critiqued",
    },
  });
  return { attemptId: attempt.id, unresolved: check.unresolved.length };
}

async function critiqueDissertation(job, ctx) {
  const d = await db().lawDissertation.findUnique({
    where: { id: job.payload.dissertationId },
  });
  if (!d) throw new PermanentError("dissertation not found");
  const intro = JSON.parse(d.intro);
  const plan = JSON.parse(d.plan);
  const subject = d.subjectId
    ? await db().lawSubject.findUnique({ where: { id: d.subjectId } })
    : null;
  const rules = subject?.dissertationRules
    ? JSON.parse(subject.dissertationRules)
    : undefined;
  const checklist = runChecks({ intro, plan }, rules);
  const text = [
    `# الموضوع: ${d.topic}`,
    "# المقدمة",
    ...(intro.steps || []).map((s, i) => `${i + 1}. ${s || "(فارغ)"}`),
    "# التصميم",
    ...(plan.sections || []).flatMap((s, i) => [
      `المبحث ${i + 1}: ${s.title}`,
      ...(s.subsections || []).map(
        (x, j) =>
          `  المطلب ${j + 1}: ${x.title}${x.body ? `\n  ${x.body}` : ""}`
      ),
    ]),
    d.draftBody ? `# المسودة\n${d.draftBody}` : "",
    `# نتائج الفحص الآلي\n${checklist.map((c) => `- ${c.ok ? "✓" : "✗"} ${c.message}`).join("\n")}`,
  ].join("\n");
  const evidence = await retrieveEvidence({ texts: [d.topic, text] });
  const prompt = loadPrompt("dissertation_critique", 1);
  const out = await generate({
    purpose: "dissertation_critique",
    prompt,
    system: prompt.text,
    parts: [{ text: `${evidenceBlock(evidence)}\n\n${text}` }],
    schema: DISSERTATION_SCHEMA,
    temperature: 0.2,
    maxOutputTokens: 8192,
    jobId: job.id,
  });
  ctx.track(out);
  const { output, check } = await validateOutput(out.json);
  await recordValidation(out.aiCallId, check);
  await db().lawDissertation.update({
    where: { id: d.id },
    data: {
      critique: JSON.stringify(output),
      citationCheck: JSON.stringify(check),
      ruleViolations: JSON.stringify(checklist),
      status: "critiqued",
    },
  });
  return { dissertationId: d.id };
}

module.exports = {
  critiqueCase,
  critiqueDissertation,
  CASE_SCHEMA,
  DISSERTATION_SCHEMA,
  PHASE_NAMES,
};
