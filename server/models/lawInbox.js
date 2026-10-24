// The Inbox (spec §9.3): everything waiting for the student. Unverified AI derivatives, failed jobs and
// budget pauses now; candidate atoms (Phase 4) and new source documents (Phase 6) join later.
const { db } = require("../utils/law/dbClient");
const { signAsset } = require("../utils/law/signedUrl");
const { isAdmin } = require("../utils/law/tenant");

const STATUSES = ["unverified", "verified", "edited", "rejected"];
const REVIEWABLE_KINDS = [
  "ocr_text",
  "transcript",
  "segments",
  "candidate_atoms",
  "polycopie_map",
];
const ATOM_SOURCE_KINDS = ["transcript", "ocr_text"];

function parse(v) {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function assetUrl(asset) {
  const { exp, sig } = signAsset(asset.id);
  return `/api/law/assets/${asset.id}/file?exp=${exp}&sig=${sig}`;
}

const LawInbox = {
  items: async function () {
    const derivatives = await db().lawDerivative.findMany({
      where: {
        verificationStatus: "unverified",
        kind: { in: REVIEWABLE_KINDS },
      },
      orderBy: { createdAt: "desc" },
      include: {
        batch: {
          select: {
            id: true,
            kind: true,
            subjectId: true,
            sessionId: true,
            capturedAt: true,
          },
        },
      },
      take: 100,
    });
    const subjectIds = [
      ...new Set(derivatives.map((d) => d.batch?.subjectId).filter(Boolean)),
    ];
    const subjects = await db().lawSubject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true, color: true },
    });
    const failed = await db().lawJob.findMany({
      where: { status: { in: ["failed", "paused_budget"] } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    const active = await db().lawJob.count({
      where: { status: { in: ["queued", "running"] } },
    });
    // Radar items are global and only the admin curates the corpus, so only admins see them.
    const admin = isAdmin();
    const newSources = admin
      ? await db().lawSourceDocument.findMany({
          where: { parseStatus: "new" },
          orderBy: { retrievedAt: "desc" },
          take: 50,
        })
      : [];
    const { sourcesStatus } = require("../utils/law/radar/scraper");
    const stoppedSources = admin
      ? (await sourcesStatus())
          .filter((s) => s.enabled && s.state.disabled)
          .map((s) => ({
            id: s.id,
            label: s.label,
            lastError: s.state.lastError,
          }))
      : [];
    return {
      derivatives: derivatives.map(({ content, ...d }) => ({
        ...d,
        subject: subjects.find((s) => s.id === d.batch?.subjectId) || null,
        size: content.length,
      })),
      failedJobs: failed
        .filter((j) => j.status === "failed")
        .map((j) => ({ ...j, payload: parse(j.payload) })),
      pausedJobs: failed
        .filter((j) => j.status === "paused_budget")
        .map((j) => ({ ...j, payload: parse(j.payload) })),
      processingCount: active,
      newSources,
      stoppedSources,
      count:
        derivatives.length +
        failed.length +
        newSources.length +
        stoppedSources.length,
    };
  },

  count: async function () {
    const [d, j] = await Promise.all([
      db().lawDerivative.count({
        where: {
          verificationStatus: "unverified",
          kind: { in: REVIEWABLE_KINDS },
        },
      }),
      db().lawJob.count({
        where: { status: { in: ["failed", "paused_budget"] } },
      }),
    ]);
    const n = isAdmin()
      ? await db().lawSourceDocument.count({ where: { parseStatus: "new" } })
      : 0;
    return d + j + n;
  },

  /** Derivative with its originals (signed URLs) for side-by-side review. */
  derivative: async function (id) {
    const d = await db().lawDerivative.findUnique({
      where: { id },
      include: {
        batch: { select: { id: true, subjectId: true, sessionId: true } },
      },
    });
    if (!d) return null;
    const assets = d.batchId
      ? await db().lawAsset.findMany({
          where: { batchId: d.batchId },
          orderBy: { orderInBatch: "asc" },
        })
      : d.assetId
        ? [await db().lawAsset.findUnique({ where: { id: d.assetId } })]
        : [];
    return {
      ...d,
      content: parse(d.content),
      assets: assets.filter(Boolean).map((a) => ({ ...a, url: assetUrl(a) })),
    };
  },

  /**
   * Edit content and/or set the verification status (spec §1.3). Editing content without an explicit
   * status marks it "edited" (= verified by a human, with changes). Originals are never touched.
   */
  updateDerivative: async function (id, { content, verificationStatus } = {}) {
    const d = await db().lawDerivative.findUnique({ where: { id } });
    if (!d) return { error: "not_found" };
    const data = {};
    if (content !== undefined) {
      const str =
        typeof content === "string" ? content : JSON.stringify(content);
      if (str.length > 5_000_000) return { error: "content too large" };
      data.content = str;
      data.verificationStatus = "edited";
    }
    if (verificationStatus !== undefined) {
      if (!STATUSES.includes(verificationStatus))
        return { error: "invalid verificationStatus" };
      data.verificationStatus = verificationStatus;
    }
    if (d.kind === "candidate_atoms" && content !== undefined)
      return { error: "use accept-atoms for candidate atoms" };
    const updated = await db().lawDerivative.update({ where: { id }, data });
    // Verified lecture text feeds the next step (spec §6.3): candidate atoms, and polycopié alignment.
    const nowAccepted = ["verified", "edited"].includes(
      updated.verificationStatus
    );
    if (
      nowAccepted &&
      d.verificationStatus === "unverified" &&
      ATOM_SOURCE_KINDS.includes(d.kind)
    ) {
      const { LawJob } = require("./lawJob");
      await LawJob.enqueue("candidate_atoms", { derivativeId: id });
      if (d.kind === "ocr_text" && parse(updated.content)?.source === "pdf")
        await LawJob.enqueue("align_polycopie", { derivativeId: id });
      require("../utils/law/worker").kick();
    }
    // A session is reviewed once none of its derivatives is still unverified.
    if (updated.batchId) {
      const batch = await db().lawCaptureBatch.findUnique({
        where: { id: updated.batchId },
      });
      if (batch?.sessionId) {
        const pending = await db().lawDerivative.count({
          where: {
            batch: { sessionId: batch.sessionId },
            verificationStatus: "unverified",
            kind: { in: REVIEWABLE_KINDS },
          },
        });
        if (!pending)
          await db().lawClassSession.updateMany({
            where: { id: batch.sessionId },
            data: { status: "reviewed" },
          });
      }
    }
    return {
      derivative: { ...updated, content: parse(updated.content) },
      error: null,
    };
  },

  /**
   * Accept selected candidate atoms (spec §9.3). Each becomes a PROF atom with its source reference;
   * unchanged text is "verified", edited text "edited". Idempotent: an index is accepted once.
   * @param {{index:number, body?:string, headingPath?:string[], profEmphasis?:boolean, examRelevant?:boolean}[]} selections
   */
  acceptAtoms: async function (
    id,
    selections,
    { subjectId: overrideSubject } = {}
  ) {
    const d = await db().lawDerivative.findUnique({
      where: { id },
      include: { batch: true },
    });
    if (!d || d.kind !== "candidate_atoms") return { error: "not_found" };
    if (!Array.isArray(selections)) return { error: "atoms must be an array" };
    const content = parse(d.content);
    const subjectId = overrideSubject || d.batch?.subjectId;
    if (!subjectId) return { error: "assign a subject to this capture first" };
    const { LawAtom } = require("./lawAtom");
    const accepted = new Set(content.accepted || []);
    const created = [];
    for (const sel of selections) {
      const c = content.atoms?.[sel?.index];
      if (!c || accepted.has(sel.index)) continue;
      const body =
        typeof sel.body === "string" && sel.body.trim()
          ? sel.body.trim()
          : c.body;
      const r = await LawAtom.create({
        subjectId,
        sessionId: content.sessionId || null,
        provenance: "PROF",
        body,
        headingPath: Array.isArray(sel.headingPath)
          ? sel.headingPath
          : c.headingPath,
        sourceAssetId: c.sourceAssetId,
        sourceTimestampSec: c.sourceTimestampSec ?? null,
        sourcePage: c.sourcePage ?? null,
        profEmphasis:
          typeof sel.profEmphasis === "boolean"
            ? sel.profEmphasis
            : c.profEmphasis,
        examRelevant:
          typeof sel.examRelevant === "boolean" ? sel.examRelevant : true,
        verificationStatus: body === c.body ? "verified" : "edited",
        fromDerivativeId: d.id,
      });
      if (r.error) return { error: `atom ${sel.index}: ${r.error}`, created };
      accepted.add(sel.index);
      created.push(r.atom);
    }
    await db().lawDerivative.update({
      where: { id },
      data: {
        content: JSON.stringify({ ...content, accepted: [...accepted] }),
        verificationStatus: "verified",
      },
    });
    return { created, error: null };
  },
};

module.exports = { LawInbox };
