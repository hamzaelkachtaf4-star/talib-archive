// Qanouni Collab Phase C: members' raw inputs for one session of a squad workspace, and their AI synthesis.
// A source is visible only to its author (copyright and privacy: raw transcripts and board photos are never
// shared); squad-mates see its kind, label, size and author. Only the synthesised draft is shared, and only
// once a member saves it as a master note.
const { rawDb, db } = require("../utils/law/dbClient");
const { runAs } = require("../utils/law/tenant");
const { LawSquad } = require("./lawSquad");
const { synthesize, MAX_SOURCE_CHARS } = require("../utils/law/synthesis");

const KINDS = ["transcript", "board_ocr", "text"];
const MAX_PER_MEMBER = 5;
const FROM_DERIVATIVE = { transcript: "transcript", ocr_text: "board_ocr" };

/** Text from a derivative's content (plain text, or JSON with text / pages / segments). */
function derivativeText(content) {
  let v;
  try {
    v = JSON.parse(content);
  } catch {
    return String(content || "");
  }
  const pick = (x) =>
    typeof x === "string"
      ? x
      : Array.isArray(x)
        ? x.map(pick).filter(Boolean).join("\n")
        : x && typeof x === "object"
          ? pick(x.text ?? x.pages ?? x.segments ?? "")
          : "";
  return pick(v);
}

const session = (n) => (Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 200 ? Number(n) : null);

const LawSessionSource = {
  MAX_PER_MEMBER,
  derivativeText,

  list: async function (userId, workspaceId, sessionNumber) {
    const found = await LawSquad.workspaceFor(userId, workspaceId);
    const n = session(sessionNumber);
    if (!found || !n) return { error: "not_found" };
    const rows = await rawDb().lawSessionSource.findMany({
      where: { workspaceId: found.ws.id, sessionNumber: n },
      orderBy: { createdAt: "asc" },
    });
    const profiles = await rawDb().lawUserProfile.findMany({
      where: { userId: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: { userId: true, fullName: true },
    });
    const nameOf = new Map(profiles.map((p) => [p.userId, p.fullName]));
    return {
      sources: rows.map((r) =>
        r.userId === userId
          ? { ...r, chars: r.content.length, mine: true, author: nameOf.get(r.userId) }
          : { id: r.id, kind: r.kind, label: r.label, chars: r.content.length, createdAt: r.createdAt, mine: false, author: nameOf.get(r.userId) }
      ),
    };
  },

  add: async function (userId, workspaceId, sessionNumber, input = {}) {
    const found = await LawSquad.workspaceFor(userId, workspaceId);
    const n = session(sessionNumber);
    if (!found || !n) return { error: "not_found" };
    if (!require("../utils/law/permissions").can(found.m.role, "doc.create")) return { error: "forbidden" }; // viewers read only
    if ((await rawDb().lawSessionSource.count({ where: { workspaceId: found.ws.id, sessionNumber: n, userId } })) >= MAX_PER_MEMBER)
      return { error: "too_many_sources" };
    let { kind, label, content } = input;
    if (input.derivativeId) {
      // Only the caller's own transcript / OCR (the scoped client refuses anyone else's).
      const d = await runAs({ userId, role: "default" }, () =>
        db().lawDerivative.findUnique({ where: { id: String(input.derivativeId) } })
      ).catch(() => null);
      if (!d || !FROM_DERIVATIVE[d.kind]) return { error: "not_found" };
      kind = FROM_DERIVATIVE[d.kind];
      content = derivativeText(d.content);
      label = label || (kind === "transcript" ? "تفريغ تسجيلي" : "صورة السبورة");
    }
    if (!KINDS.includes(kind)) return { error: "invalid kind" };
    const l = typeof label === "string" && label.trim() ? label.trim().slice(0, 120) : null;
    if (!l) return { error: "invalid label" };
    if (typeof content !== "string" || !content.trim()) return { error: "invalid content" };
    const source = await rawDb().lawSessionSource.create({
      data: { workspaceId: found.ws.id, sessionNumber: n, userId, kind, label: l, content: content.trim().slice(0, MAX_SOURCE_CHARS) },
    });
    return { source: { ...source, chars: source.content.length, mine: true }, error: null };
  },

  remove: async function (userId, sourceId) {
    const s = await rawDb().lawSessionSource.findUnique({ where: { id: String(sourceId || "") } });
    if (!s || s.userId !== userId) return { error: "not_found" };
    await rawDb().lawSessionSource.delete({ where: { id: s.id } });
    return { ok: true };
  },

  /** AI draft from every member's sources for the session (at least two). Saves nothing. */
  synthesize: async function (userId, workspaceId, sessionNumber) {
    const found = await LawSquad.workspaceFor(userId, workspaceId);
    const n = session(sessionNumber);
    if (!found || !n) return { error: "not_found" };
    if (!require("../utils/law/permissions").can(found.m.role, "doc.create")) return { error: "forbidden" }; // it spends the squad's AI quota
    const sources = await rawDb().lawSessionSource.findMany({
      where: { workspaceId: found.ws.id, sessionNumber: n },
      orderBy: { createdAt: "asc" },
    });
    // The lecturer's plan, when the caller keeps one for this module (their own subject).
    const subject = await runAs({ userId, role: "default" }, () =>
      db().lawSubject.findFirst({ where: { name: found.ws.moduleName, coursePlan: { not: null } } })
    ).catch(() => null);
    let coursePlan = null;
    try {
      coursePlan = subject?.coursePlan ? JSON.parse(subject.coursePlan) : null;
    } catch {}
    const r = await synthesize({
      sources,
      workspace: { moduleName: found.ws.moduleName, professorName: found.ws.professorName },
      sessionNumber: n,
      coursePlan,
    });
    if (r.error) return r;
    return { draft: { ...r.draft, sessionNumber: n, sourceCount: sources.length }, error: null };
  },
};

module.exports = { LawSessionSource };
