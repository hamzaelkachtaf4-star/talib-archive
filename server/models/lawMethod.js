// Methodology engines (spec §8.2-8.3, §9.7). Write first, critique second (spec §1.5):
//  - a critique exists only for a submitted attempt / a drafted dissertation;
//  - a model answer is produced only on explicit request AFTER the critique;
//  - target qualifications stay hidden until the student has submitted an attempt.
const { db } = require("../utils/law/dbClient");
const { LawJob } = require("./lawJob");
const { LawFlashcard } = require("./lawFlashcard");
const { generate, recordValidation } = require("../utils/law/ai/router");
const { loadPrompt } = require("../utils/law/prompts");
const {
  retrieveEvidence,
  evidenceBlock,
  validateOutput,
} = require("../utils/law/grounding");
const { runChecks, hasDraft } = require("../utils/law/dissertationChecks");
const { normalizeCanonicalId } = require("../utils/law/arabic");
const { PHASE_NAMES } = require("../utils/law/jobs/critique");

const TIME_PRESETS = { faculty: 3 * 3600, attache: 4 * 3600 }; // spec §8.2
const SOURCES = ["prof_td", "past_exam", "self_written", "ai_scenario"];
const SUBMITTED = ["submitted", "critiqued", "critique_failed"];

const parse = (v, f) => {
  try {
    return v ? JSON.parse(v) : f;
  } catch {
    return f;
  }
};

async function latestJob(type, key, id) {
  const job = await db().lawJob.findFirst({
    where: { type, payload: { contains: `"${key}":"${id}"` } },
    orderBy: { createdAt: "desc" },
  });
  return job ? { id: job.id, status: job.status, error: job.error } : null;
}

function presentAttempt(a, job) {
  return {
    ...a,
    phases: parse(a.phases, {}),
    critique: parse(a.critique, null),
    rubricScores: parse(a.rubricScores, null),
    citationCheck: parse(a.citationCheck, null),
    suggestedCards: parse(a.suggestedCards, []),
    modelAnswer: parse(a.modelAnswer, null),
    critiqueJob: job || null,
    remainingSec:
      a.timed && a.timeLimitSec && a.status === "draft"
        ? Math.max(
            0,
            a.timeLimitSec -
              Math.floor((Date.now() - a.startedAt.getTime()) / 1000)
          )
        : null,
  };
}

function presentDissertation(d, job) {
  return {
    ...d,
    intro: parse(d.intro, { steps: [] }),
    plan: parse(d.plan, { sections: [] }),
    critique: parse(d.critique, null),
    ruleViolations: parse(d.ruleViolations, null),
    citationCheck: parse(d.citationCheck, null),
    critiqueJob: job || null,
  };
}

function cleanIds(ids) {
  return Array.isArray(ids)
    ? [...new Set(ids.map(normalizeCanonicalId).filter(Boolean))]
    : [];
}

const LawMethod = {
  TIME_PRESETS,

  // ── cas pratique ──
  listExercises: async function ({ subjectId } = {}) {
    const rows = await db().lawCaseExercise.findMany({
      where: subjectId ? { subjectId } : {},
      orderBy: { createdAt: "desc" },
      include: {
        attempts: {
          select: {
            id: true,
            status: true,
            submittedAt: true,
            rubricScores: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    return rows.map((e) => this.presentExercise(e));
  },

  presentExercise: function (e) {
    const revealed = (e.attempts || []).some((a) =>
      SUBMITTED.includes(a.status)
    );
    const { targetQualifications, ...rest } = e;
    return {
      ...rest,
      targetQualifications: revealed ? parse(targetQualifications, []) : null,
      targetsHidden: !revealed,
    };
  },

  getExercise: async function (id) {
    const e = await db().lawCaseExercise.findUnique({
      where: { id },
      include: { attempts: { orderBy: { createdAt: "desc" } } },
    });
    return e ? this.presentExercise(e) : null;
  },

  createExercise: async function ({
    subjectId = null,
    title,
    factsAr,
    source = "self_written",
    difficulty = 2,
    targetQualifications = [],
  } = {}) {
    if (typeof title !== "string" || !title.trim())
      return { error: "title is required" };
    if (typeof factsAr !== "string" || factsAr.trim().length < 20)
      return { error: "facts are required" };
    if (!SOURCES.includes(source)) return { error: "invalid source" };
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5)
      return { error: "invalid difficulty" };
    if (
      subjectId &&
      !(await db().lawSubject.findUnique({ where: { id: subjectId } }))
    )
      return { error: "unknown subject" };
    const e = await db().lawCaseExercise.create({
      data: {
        subjectId,
        title: title.trim(),
        factsAr: factsAr.trim(),
        source,
        difficulty,
        targetQualifications: JSON.stringify(cleanIds(targetQualifications)),
      },
    });
    return {
      exercise: this.presentExercise({ ...e, attempts: [] }),
      error: null,
    };
  },

  startAttempt: async function (
    exerciseId,
    { timed = false, preset = "faculty" } = {}
  ) {
    if (!(await db().lawCaseExercise.findUnique({ where: { id: exerciseId } })))
      return { error: "not_found" };
    if (timed && !TIME_PRESETS[preset]) return { error: "invalid preset" };
    const a = await db().lawCaseAttempt.create({
      data: {
        exerciseId,
        timed: !!timed,
        timeLimitSec: timed ? TIME_PRESETS[preset] : null,
      },
    });
    return { attempt: presentAttempt(a), error: null };
  },

  getAttempt: async function (id) {
    const a = await db().lawCaseAttempt.findUnique({
      where: { id },
      include: { exercise: true },
    });
    if (!a) return null;
    const exercise = this.presentExercise({
      ...a.exercise,
      attempts: SUBMITTED.includes(a.status) ? [a] : [],
    });
    return {
      ...presentAttempt(a, await latestJob("critique_case", "attemptId", id)),
      exercise,
    };
  },

  /** Autosave (drafts only). phases: {1..5: {text, citedIds}} */
  savePhases: async function (id, phases) {
    const a = await db().lawCaseAttempt.findUnique({ where: { id } });
    if (!a) return { error: "not_found" };
    if (a.status !== "draft") return { error: "attempt already submitted" };
    if (!phases || typeof phases !== "object")
      return { error: "invalid phases" };
    const clean = {};
    for (let i = 1; i <= 5; i++) {
      const p = phases[String(i)] || {};
      if (
        p.text !== undefined &&
        (typeof p.text !== "string" || p.text.length > 50000)
      )
        return { error: `invalid phase ${i}` };
      clean[String(i)] = { text: p.text || "", citedIds: cleanIds(p.citedIds) };
    }
    const updated = await db().lawCaseAttempt.update({
      where: { id },
      data: { phases: JSON.stringify(clean) },
    });
    return { attempt: presentAttempt(updated), error: null };
  },

  /** Submit: locks the attempt and queues the grounded critique. */
  submit: async function (id, now = new Date()) {
    const a = await db().lawCaseAttempt.findUnique({ where: { id } });
    if (!a) return { error: "not_found" };
    if (a.status !== "draft")
      return { attempt: presentAttempt(a), error: null }; // idempotent
    const phases = parse(a.phases, {});
    if (!Object.values(phases).some((p) => (p.text || "").trim().length >= 20))
      return { error: "write your solution before submitting" };
    const durationSec = Math.floor(
      (now.getTime() - a.startedAt.getTime()) / 1000
    );
    const updated = await db().lawCaseAttempt.update({
      where: { id },
      data: { status: "submitted", submittedAt: now, durationSec },
    });
    await LawJob.enqueue("critique_case", { attemptId: id }, { priority: 2 });
    return {
      attempt: presentAttempt(updated),
      overtime: a.timed && durationSec > a.timeLimitSec,
      error: null,
    };
  },

  /** Spec §7.3: a reference solution only after submission + critique, and only when asked. */
  modelAnswer: async function (id) {
    const a = await db().lawCaseAttempt.findUnique({
      where: { id },
      include: { exercise: true },
    });
    if (!a) return { error: "not_found" };
    if (a.status !== "critiqued")
      return {
        error: "submit your attempt and read the critique first",
        status: 409,
      };
    if (a.modelAnswer)
      return { modelAnswer: parse(a.modelAnswer, null), error: null };
    const targets = parse(a.exercise.targetQualifications, []);
    const phases = parse(a.phases, {});
    const evidence = await retrieveEvidence({
      texts: [a.exercise.factsAr],
      ids: [
        ...targets,
        ...Object.values(phases).flatMap((p) => p.citedIds || []),
      ],
    });
    const prompt = loadPrompt("model_answer", 1);
    const out = await generate({
      purpose: "model_answer",
      prompt,
      system: prompt.text,
      parts: [
        {
          text: `${evidenceBlock(evidence)}\n\n# الوقائع\n${a.exercise.factsAr}\n\n# المراحل\n${PHASE_NAMES.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
        },
      ],
      schema: {
        type: "OBJECT",
        properties: {
          phases: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                phase: { type: "INTEGER" },
                text: { type: "STRING" },
                citations: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      canonicalId: { type: "STRING" },
                      quote: { type: "STRING" },
                    },
                  },
                },
              },
            },
          },
        },
        required: ["phases"],
      },
      temperature: 0.2,
    });
    const { output, check } = await validateOutput(out.json);
    await recordValidation(out.aiCallId, check);
    const modelAnswer = { ...output, citationCheck: check };
    await db().lawCaseAttempt.update({
      where: { id },
      data: { modelAnswer: JSON.stringify(modelAnswer) },
    });
    return { modelAnswer, error: null };
  },

  /** Suggested card from a failed element → a real flashcard (origin failed_retrieval, spec §3.6). */
  acceptSuggestedCard: async function (id, index) {
    const a = await db().lawCaseAttempt.findUnique({
      where: { id },
      include: { exercise: true },
    });
    if (!a) return { error: "not_found" };
    const cards = parse(a.suggestedCards, []);
    const c = cards[index];
    if (!c) return { error: "no such suggestion" };
    if (c.acceptedCardId)
      return { card: await LawFlashcard.get(c.acceptedCardId), error: null };
    const subjectId =
      a.exercise.subjectId ||
      (await db().lawSubject.findFirst({ orderBy: { createdAt: "asc" } }))?.id;
    if (!subjectId) return { error: "create a subject first" };
    const r = await LawFlashcard.create({
      subjectId,
      origin: "failed_retrieval",
      front: c.front,
      back: c.back,
      canonicalIds: c.canonicalIds || [],
    });
    if (r.error) return { error: r.error };
    cards[index] = { ...c, acceptedCardId: r.card.id };
    await db().lawCaseAttempt.update({
      where: { id },
      data: { suggestedCards: JSON.stringify(cards) },
    });
    return { card: r.card, error: null };
  },

  // ── dissertation ──
  listDissertations: async function () {
    const rows = await db().lawDissertation.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((d) => presentDissertation(d));
  },

  getDissertation: async function (id) {
    const d = await db().lawDissertation.findUnique({ where: { id } });
    return d
      ? presentDissertation(
          d,
          await latestJob("critique_dissertation", "dissertationId", id)
        )
      : null;
  },

  saveDissertation: async function (id, input = {}) {
    const data = {};
    if ("topic" in input) {
      if (typeof input.topic !== "string" || !input.topic.trim())
        return { error: "topic is required" };
      data.topic = input.topic.trim();
    }
    if ("subjectId" in input) data.subjectId = input.subjectId || null;
    if ("intro" in input) {
      const steps = input.intro?.steps;
      if (
        !Array.isArray(steps) ||
        steps.length > 10 ||
        steps.some((s) => typeof s !== "string")
      )
        return { error: "invalid intro" };
      data.intro = JSON.stringify({ steps });
    }
    if ("plan" in input) {
      const sections = input.plan?.sections;
      const okSec = (s) =>
        s &&
        typeof s.title === "string" &&
        Array.isArray(s.subsections) &&
        s.subsections.every(
          (x) =>
            x &&
            typeof x.title === "string" &&
            (x.body === undefined || typeof x.body === "string")
        );
      if (
        !Array.isArray(sections) ||
        sections.length > 6 ||
        !sections.every(okSec)
      )
        return { error: "invalid plan" };
      data.plan = JSON.stringify({ sections });
    }
    if ("draftBody" in input)
      data.draftBody =
        typeof input.draftBody === "string" ? input.draftBody : null;
    if (id) {
      const existing = await db().lawDissertation.findUnique({ where: { id } });
      if (!existing) return { error: "not_found" };
      if (existing.status === "critiquing") {
        const job = await latestJob(
          "critique_dissertation",
          "dissertationId",
          id
        );
        if (job && !["failed", "paused_budget"].includes(job.status))
          return { error: "critique in progress" };
        data.status = "draft"; // the critique job failed or is parked: let the student keep writing
      }
      return {
        dissertation: presentDissertation(
          await db().lawDissertation.update({ where: { id }, data })
        ),
        error: null,
      };
    }
    if (!data.topic) return { error: "topic is required" };
    return {
      dissertation: presentDissertation(
        await db().lawDissertation.create({ data })
      ),
      error: null,
    };
  },

  checkDissertation: async function (id) {
    const d = await this.getDissertation(id);
    if (!d) return { error: "not_found" };
    const subject = d.subjectId
      ? await db().lawSubject.findUnique({ where: { id: d.subjectId } })
      : null;
    const checklist = runChecks(
      d,
      subject?.dissertationRules
        ? JSON.parse(subject.dissertationRules)
        : undefined
    );
    await db().lawDissertation.update({
      where: { id },
      data: { ruleViolations: JSON.stringify(checklist) },
    });
    return { checklist, error: null };
  },

  requestDissertationCritique: async function (id) {
    const d = await this.getDissertation(id);
    if (!d) return { error: "not_found" };
    if (!hasDraft(d))
      return {
        error: "write the introduction and the plan first",
        status: 409,
      };
    await db().lawDissertation.update({
      where: { id },
      data: { status: "critiquing" },
    });
    const job = await LawJob.enqueue(
      "critique_dissertation",
      { dissertationId: id },
      { priority: 2 }
    );
    return { job, error: null };
  },

  // ── qualification drills (spec §8.1 qualification cards, §10.2 QualificationDrill) ──
  nextDrills: async function ({ subjectId, limit = 10 } = {}) {
    const cards = await db().lawFlashcard.findMany({
      where: {
        type: "qualification",
        deletedAt: null,
        suspended: false,
        ...(subjectId && { subjectId }),
      },
      select: { id: true, subjectId: true, front: true },
    });
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return LawFlashcard.interleave(cards).slice(0, limit);
  },

  judgeDrill: async function (cardId, answer) {
    const card = await db().lawFlashcard.findFirst({
      where: { id: cardId, type: "qualification", deletedAt: null },
    });
    if (!card) return { error: "not_found" };
    if (typeof answer !== "string" || answer.trim().length < 3)
      return { error: "write your qualification first" };
    const ids = parse(card.canonicalIds, []);
    const evidence = await retrieveEvidence({
      texts: [card.front, answer],
      ids,
    });
    const prompt = loadPrompt("qualification_drill", 1);
    const out = await generate({
      purpose: "qualification_drill",
      prompt,
      system: prompt.text,
      parts: [
        {
          text: `${evidenceBlock(evidence)}\n\n# الوقائع\n${card.front}\n\n# جواب الطالب\n${answer}\n\n# الجواب المرجعي\n${card.back}`,
        },
      ],
      schema: {
        type: "OBJECT",
        properties: {
          verdict: { type: "STRING" },
          explanation: { type: "STRING" },
          citations: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                canonicalId: { type: "STRING" },
                quote: { type: "STRING" },
              },
            },
          },
        },
        required: ["verdict", "explanation"],
      },
      temperature: 0.1,
      maxOutputTokens: 2048,
    });
    const { output, check } = await validateOutput(out.json);
    await recordValidation(out.aiCallId, check);
    const verdict = ["correct", "partial", "wrong"].includes(output.verdict)
      ? output.verdict
      : "partial";
    return {
      result: {
        ...output,
        verdict,
        reference: card.back,
        citationCheck: check,
      },
      error: null,
    };
  },
};

module.exports = { LawMethod };
