// Two lenses over one data model (spec §3.5, §8.4).
//  exam:   accepted PROF + TEXT atoms only, in the professor's plan order; a profDivergent PROF atom
//          carries a neutral marker ("الأستاذ يتبنى رأيا") and no divergence content.
//  jurist: every atom, grouped by legal issue, with conflict links and the Mention Bridge pins.
// Lockdown: the exam within N days makes Exam the *default*; Jurist stays one tap away.
const { db } = require("../utils/law/dbClient");
const { LawSubject } = require("./lawSubject");
const { LawAtom, topicOf } = require("./lawAtom");
const { orderByPlan } = require("../utils/law/coursePlan");

const DIVERGENT_MARKER = "الأستاذ يتبنى رأيا";
const CONFLICT_RELATIONS = ["contradicts", "divergesFrom", "reverses"];

async function decorate(atoms) {
  // Attach the referenced corpus records so the UI can show the canonical id / decision citation.
  const versionIds = atoms.map((a) => a.articleVersionId).filter(Boolean);
  const decisionIds = atoms.map((a) => a.decisionId).filter(Boolean);
  const doctrineIds = atoms.map((a) => a.doctrineRefId).filter(Boolean);
  const [versions, decisions, doctrine] = await Promise.all([
    db().lawArticleVersion.findMany({
      where: { id: { in: versionIds } },
      include: { article: { include: { code: true } } },
    }),
    db().lawDecision.findMany({ where: { id: { in: decisionIds } } }),
    db().lawDoctrineRef.findMany({ where: { id: { in: doctrineIds } } }),
  ]);
  const v = new Map(versions.map((x) => [x.id, x]));
  const d = new Map(decisions.map((x) => [x.id, x]));
  const r = new Map(doctrine.map((x) => [x.id, x]));
  return atoms.map((a) => ({
    ...a,
    article:
      a.articleVersionId && v.get(a.articleVersionId)
        ? {
            canonicalId: v.get(a.articleVersionId).article.canonicalId,
            numberingLabel: v.get(a.articleVersionId).article.code
              .numberingLabel,
            articleNumber: v.get(a.articleVersionId).article.articleNumber,
            verifiedByUser: v.get(a.articleVersionId).verifiedByUser,
          }
        : null,
    decision: a.decisionId ? d.get(a.decisionId) || null : null,
    doctrine: a.doctrineRefId ? r.get(a.doctrineRefId) || null : null,
  }));
}

const LawLenses = {
  DIVERGENT_MARKER,

  content: async function (subjectId, { mode, now = new Date() } = {}) {
    const subject = await LawSubject.get(subjectId, { now });
    if (!subject) return null;
    const defaultMode = subject.lockdown ? "exam" : "jurist";
    const m = mode === "exam" || mode === "jurist" ? mode : defaultMode;
    const all = await LawAtom.list({ subjectId, take: 5000 });
    const plan = subject.coursePlan || [];

    if (m === "exam") {
      const examAtoms = all.filter(
        (a) =>
          ["PROF", "TEXT"].includes(a.provenance) &&
          LawAtom.ACCEPTED.includes(a.verificationStatus) &&
          a.examRelevant
      );
      const ordered = orderByPlan(examAtoms, plan).map((a) =>
        a.profDivergent ? { ...a, divergenceMarker: DIVERGENT_MARKER } : a
      );
      return {
        subject,
        mode: m,
        defaultMode,
        lockdown: subject.lockdown,
        coursePlan: plan,
        atoms: await decorate(ordered),
      };
    }

    const decorated = await decorate(
      orderByPlan(
        all.filter((a) => a.verificationStatus !== "rejected"),
        plan
      )
    );
    const groups = new Map();
    for (const a of decorated) {
      const t = topicOf(a);
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(a);
    }
    const ids = decorated.map((a) => a.id);
    const conflicts = await db().lawLink.findMany({
      where: {
        relation: { in: CONFLICT_RELATIONS },
        OR: [
          { fromType: "noteAtom", fromId: { in: ids } },
          { toType: "noteAtom", toId: { in: ids } },
        ],
      },
    });
    return {
      subject,
      mode: m,
      defaultMode,
      lockdown: subject.lockdown,
      coursePlan: plan,
      groups: [...groups.entries()].map(([topic, atoms]) => ({
        topic,
        atoms,
        bridge: atoms.filter((a) => a.mentionBridge),
      })),
      conflicts,
    };
  },
};

module.exports = { LawLenses };
