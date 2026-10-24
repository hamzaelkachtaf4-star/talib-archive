// Qanouni Collab, Phase B: the Faculty Hub ("GitHub for law").
// - Public master notes are readable by every signed-in student who accepted the notice; the Hub lists the
//   student's own cohort by default and can switch to another cohort.
// - Fork: copy a public note into your squad (attribution kept: forkedFromId + the author's name).
// - التوثيق: toggle an endorsement on a public note (not your own); 5+ = "موثق من الفوج".
// - Public profile (opt-in): name, cohort, level, badges, public notes and endorsements received. Never email.
// Privacy on public notes: the creator chose to publish, so their name is shown (forks need it); other squad
// members who wrote sections stay anonymous unless they turned their own public profile on.
const { canViewProfile, publicCard, LEVEL } = require("../utils/law/privacy");
const { rawDb } = require("../utils/law/dbClient");
const { normalize } = require("../utils/law/arabic");
const { LawSquad, avatar, names, json, VERIFIED_AT, DEFAULT_COHORT } = require("./lawSquad");
const { LawProgress } = require("./lawProgress");
const note = require("../utils/law/masterNote");
const { NOTE_DOC_TYPES } = require("../utils/law/enums");

const EXPERT_AT = 10; // endorsements received on one module's public notes → "خبير <module>"
const PUBLISHER_AT = 3; // public notes
const REFERENCE_AT = 3; // forks of one's notes

const key = (s) =>
  normalize(String(s || ""))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");

/** Plain-text excerpt of Markdown (headings, emphasis, pins and links removed). */
function excerpt(md, max = 220) {
  return String(md || "")
    .replace(/\[\^pin-\d+\]/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function publicProfiles(userIds) {
  const rows = await rawDb().lawUserProfile.findMany({
    where: { userId: { in: [...new Set(userIds)] } },
    select: { userId: true, publicProfile: true },
  });
  return new Map(rows.map((r) => [r.userId, r.publicProfile]));
}

const LawHub = {
  EXPERT_AT,
  VERIFIED_AT,

  /** The cohort a student browses by default: their squad's tag, else the faculty default. */
  cohortOf: async function (userId) {
    const m = await LawSquad.membership(userId);
    return m?.squad?.cohortTag || DEFAULT_COHORT;
  },

  /** Public notes with their workspace and squad (for cohort), newest first. */
  _publicNotes: async function (where = {}) {
    return rawDb().lawMasterNote.findMany({
      where: { visibility: "public", moderationStatus: "ACTIVE", ...where },
      orderBy: { publishedAt: "desc" },
      take: 1000,
      include: {
        workspace: { include: { squad: { select: { cohortTag: true } } } },
        _count: { select: { endorsements: true, forks: true } },
      },
    });
  },

  /** Hub listing: cohort (default: the viewer's), exact module/professor filters, free-text search. */
  list: async function (viewerId, { cohort, module, professor, q, sort, type } = {}) {
    const tag = (typeof cohort === "string" && cohort.trim()) || (await this.cohortOf(viewerId));
    let rows = (await this._publicNotes()).filter((n) => n.workspace.squad.cohortTag === tag);
    if (module) rows = rows.filter((n) => n.workspace.moduleName === module);
    if (professor) rows = rows.filter((n) => n.workspace.professorName === professor);
    if (NOTE_DOC_TYPES.includes(type)) rows = rows.filter((n) => n.docType === type); // an unknown type filters nothing
    const terms = key(q).split(/\s+/).filter(Boolean);
    if (terms.length) rows = rows.filter((n) => terms.every((t) => key(`${n.title} ${n.content}`).includes(t)));
    if (sort === "endorsed")
      rows.sort((a, b) => b._count.endorsements - a._count.endorsements || b.publishedAt - a.publishedAt);
    const nameOf = await names(rows.map((n) => n.createdById));
    const pub = await publicProfiles(rows.map((n) => n.createdById));
    const mine = new Set(
      (
        await rawDb().lawEndorsement.findMany({
          where: { userId: viewerId, noteId: { in: rows.map((n) => n.id) } },
          select: { noteId: true },
        })
      ).map((e) => e.noteId)
    );
    const open = new Map(
      (await rawDb().lawChangeRequest.groupBy({ by: ["noteId"], where: { status: "OPEN", noteId: { in: rows.map((n) => n.id) } }, _count: { _all: true } })).map((g) => [g.noteId, g._count._all])
    );
    return {
      cohort: tag,
      notes: rows.slice(0, 200).map((n) => ({
        docType: n.docType || null,
        pendingRequests: open.get(n.id) || 0,
        id: n.id,
        title: n.title,
        sessionNumber: n.sessionNumber,
        date: n.date,
        publishedAt: n.publishedAt,
        moduleName: n.workspace.moduleName,
        professorName: n.workspace.professorName,
        academicYear: n.workspace.academicYear,
        excerpt: excerpt(n.content),
        author: {
          userId: n.createdById,
          name: nameOf(n.createdById),
          avatar: avatar(nameOf(n.createdById), n.createdById),
          publicProfile: !!pub.get(n.createdById),
        },
        endorsementCount: n._count.endorsements,
        verified: n._count.endorsements >= VERIFIED_AT,
        endorsedByMe: mine.has(n.id),
        forkCount: n._count.forks,
        forkedFromAuthorName: n.forkedFromAuthorName,
        mine: n.createdById === viewerId,
      })),
    };
  },

  /**
   * Colleagues' public subjects (same faculty and semester as the viewer): the forum projects strip. Each card carries the
   * subject's formats and colour and how many edit requests wait on the owner's public notes of the same module.
   */
  projects: async function (viewerId) {
    const me = await rawDb().lawUserProfile.findUnique({ where: { userId: viewerId }, select: { facultyCode: true, semester: true } });
    if (!me?.facultyCode) return { projects: [], error: null };
    if (!me.semester) return { projects: [], error: null };
    const { LawConsent } = require("./lawConsent");
    const classmates = await rawDb().lawUserProfile.findMany({ where: { facultyCode: me.facultyCode, userId: { not: viewerId } }, select: { userId: true } });
    // Only students who accepted the current notice are shown to the faculty (a subject can be public before they did).
    const consented = await rawDb().lawUserConsent.findMany({ where: { userId: { in: classmates.map((c) => c.userId) }, version: LawConsent.CONSENT_VERSION, termsAccepted: true, academicNotice: true, privacyAccepted: true }, select: { userId: true } });
    const kept = await rawDb().lawModuleProfile.findMany({
      where: { isPublic: true, userId: { in: consented.map((c) => c.userId) }, module: { semester: me.semester } },
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: { module: { select: { id: true, title: true, semester: true } } },
    });
    const nameOf = await names(kept.map((r) => r.userId));
    const pub = await publicProfiles(kept.map((r) => r.userId));
    const notes = await rawDb().lawMasterNote.findMany({
      where: { visibility: "public", moderationStatus: "ACTIVE", createdById: { in: kept.map((r) => r.userId) } },
      select: { id: true, createdById: true, workspace: { select: { moduleName: true } } },
    });
    const open = await rawDb().lawChangeRequest.groupBy({ by: ["noteId"], where: { status: "OPEN", noteId: { in: notes.map((n) => n.id) } }, _count: { _all: true } });
    const openOf = new Map(open.map((g) => [g.noteId, g._count._all]));
    const pending = (r) => notes.filter((n) => n.createdById === r.userId && n.workspace.moduleName === r.module.title).reduce((s, n) => s + (openOf.get(n.id) || 0), 0);
    const fmt = (raw) => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
    return {
      projects: kept.map((r) => ({
        id: r.module.id, title: r.module.title, semester: r.module.semester, color: r.color || null, formats: fmt(r.formats),
        author: { userId: r.userId, name: nameOf(r.userId), avatar: avatar(nameOf(r.userId), r.userId), publicProfile: !!pub.get(r.userId) },
        pendingRequests: pending(r),
      })),
      error: null,
    };
  },

  /** Filter values for a cohort, and the cohorts that have public notes. */
  facets: async function (viewerId, { cohort } = {}) {
    const tag = (typeof cohort === "string" && cohort.trim()) || (await this.cohortOf(viewerId));
    const all = await this._publicNotes();
    const inCohort = all.filter((n) => n.workspace.squad.cohortTag === tag);
    const uniq = (xs) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
    return {
      cohort: tag,
      cohorts: uniq([tag, ...all.map((n) => n.workspace.squad.cohortTag)]),
      modules: uniq(inCohort.map((n) => n.workspace.moduleName)),
      professors: uniq(inCohort.map((n) => n.workspace.professorName)),
    };
  },

  /** A public note for any student: squad-mates without a public profile are anonymous. */
  get: async function (viewerId, noteId) {
    const n = await rawDb().lawMasterNote.findUnique({
      where: { id: String(noteId || "") },
      include: { workspace: { include: { squad: { select: { cohortTag: true } } } } },
    });
    if (!n || n.visibility !== "public" || (n.moderationStatus !== "ACTIVE" && n.createdById !== viewerId)) return { error: "not_found" };
    const { workspace, ...row } = n;
    const presented = await LawSquad.present(row, viewerId);
    const pub = await publicProfiles([
      ...presented.contributors.map((c) => c.userId),
      ...presented.sectionAuthors.map((a) => a.userId),
    ]);
    const shown = (p) =>
      p.userId === n.createdById || pub.get(p.userId)
        ? { ...p, publicProfile: !!pub.get(p.userId) }
        : { userId: null, name: "عضو في الفرقة", avatar: { initials: "?", color: "hsl(0 0% 55%)" }, publicProfile: false };
    const membership = await LawSquad.membership(viewerId);
    const { LawHubCollab } = require("./lawHubCollab");
    return {
      note: {
        ...presented,
        moderationStatus: n.moderationStatus,
        hiddenReason: n.createdById === viewerId ? n.hiddenReason : undefined,
        appealed: n.createdById === viewerId ? !!n.appealedAt : undefined,
        coAuthors: await LawHubCollab.coAuthors(n.id),
        // Squad-internal fields never leave the squad.
        version: undefined,
        updatedById: undefined,
        workspaceId: undefined,
        sectionAuthors: undefined,
        contributors: presented.contributors.map((c) => ({ ...shown(c), percent: c.percent })),
        sections: presented.sections.map((s) => ({ ...s, author: shown(s.author) })),
        createdBy: { ...presented.createdBy, publicProfile: !!pub.get(n.createdById) },
        moduleName: workspace.moduleName,
        professorName: workspace.professorName,
        academicYear: workspace.academicYear,
        cohortTag: workspace.squad.cohortTag,
        mine: n.createdById === viewerId,
        canFork: !!membership && membership.squadId !== workspace.squadId,
        inMySquad: !!membership && membership.squadId === workspace.squadId,
      },
      error: null,
    };
  },

  /** التوثيق: toggles the viewer's endorsement of a public note (never their own). */
  endorse: async function (viewerId, noteId) {
    const n = await rawDb().lawMasterNote.findUnique({ where: { id: String(noteId || "") } });
    if (!n || n.visibility !== "public" || n.moderationStatus !== "ACTIVE") return { error: "not_found" };
    if (n.createdById === viewerId) return { error: "cannot_endorse_own" };
    const where = { noteId_userId: { noteId: n.id, userId: viewerId } };
    const existing = await rawDb().lawEndorsement.findUnique({ where });
    if (existing) await rawDb().lawEndorsement.delete({ where }).catch(() => {});
    else
      await rawDb()
        .lawEndorsement.create({ data: { noteId: n.id, userId: viewerId } })
        .catch((e) => {
          if (e?.code !== "P2002") throw e; // a double tap already endorsed it
        });
    const count = await rawDb().lawEndorsement.count({ where: { noteId: n.id } });
    return { endorsed: !existing, endorsementCount: count, verified: count >= VERIFIED_AT };
  },

  /**
   * Forks a public note into the viewer's squad: into `workspaceId`, or the squad's workspace for the same
   * module and professor (created if missing). Sections stay attributed to the original author; later squad
   * edits re-attribute as usual. The fork starts squad-only.
   */
  fork: async function (viewerId, noteId, { workspaceId } = {}) {
    const src = await rawDb().lawMasterNote.findUnique({
      where: { id: String(noteId || "") },
      include: { workspace: true },
    });
    if (!src || src.visibility !== "public" || src.moderationStatus !== "ACTIVE") return { error: "not_found" };
    const m = await LawSquad.membership(viewerId);
    if (!m) return { error: "not_in_squad" };
    if (!require("../utils/law/permissions").can(m.role, "doc.create")) return { error: "forbidden" };
    if (m.squadId === src.workspace.squadId) return { error: "own_squad_note" };
    let ws;
    if (workspaceId) {
      ws = (await LawSquad.workspaceFor(viewerId, workspaceId))?.ws;
      if (!ws) return { error: "not_found" };
    } else {
      ws =
        (await rawDb().lawModuleWorkspace.findFirst({
          where: { squadId: m.squadId, moduleName: src.workspace.moduleName, professorName: src.workspace.professorName },
        })) ||
        (await rawDb().lawModuleWorkspace.create({
          data: {
            squadId: m.squadId,
            moduleName: src.workspace.moduleName,
            professorName: src.workspace.professorName,
            academicYear: src.workspace.academicYear,
            createdById: viewerId,
          },
        }));
    }
    const nameOf = await names([src.createdById]);
    const sections = note.parseSections(src.content);
    const authors = sections.map((s) => ({ key: s.key, heading: s.heading, userId: src.createdById }));
    const taken = new Set(
      (await rawDb().lawMasterNote.findMany({ where: { workspaceId: ws.id }, select: { sessionNumber: true } })).map(
        (x) => x.sessionNumber
      )
    );
    let session = src.sessionNumber;
    while (taken.has(session) && session < 200) session++;
    if (taken.has(session)) return { error: "session_exists" };
    const created = await rawDb().lawMasterNote.create({
      data: {
        workspaceId: ws.id,
        sessionNumber: session,
        date: src.date,
        title: src.title,
        content: src.content,
        planJson: src.planJson,
        sourcePins: src.sourcePins,
        sectionAuthors: JSON.stringify(authors),
        contributors: JSON.stringify(note.contributors(sections, authors)),
        visibility: "squad",
        forkedFromId: src.id,
        forkedFromAuthorName: nameOf(src.createdById),
        createdById: viewerId,
        updatedById: viewerId,
      },
    });
    return { note: await LawSquad.present(created, viewerId), workspaceId: ws.id, error: null };
  },

  // ---- public profiles --------------------------------------------------------------------------------
  setPublicProfile: async function (userId, on) {
    if (typeof on !== "boolean") return { error: "invalid publicProfile" };
    await rawDb().lawUserProfile.update({ where: { userId }, data: { publicProfile: on } });
    return { publicProfile: on };
  },

  /** Badges from what others recognised: module expertise, publishing, being forked, verified notes. */
  badges: function (notes) {
    const byModule = new Map();
    for (const n of notes) byModule.set(n.moduleName, (byModule.get(n.moduleName) || 0) + n.endorsementCount);
    const out = [...byModule.entries()]
      .filter(([, c]) => c >= EXPERT_AT)
      .map(([module, endorsements]) => ({ type: "expert", module, endorsements }));
    if (notes.some((n) => n.verified)) out.push({ type: "verified_author" });
    if (notes.length >= PUBLISHER_AT) out.push({ type: "publisher", count: notes.length });
    const forks = notes.reduce((s, n) => s + n.forkCount, 0);
    if (forks >= REFERENCE_AT) out.push({ type: "reference", count: forks });
    return out;
  },

  /** A student's public profile (404 unless they opted in; always visible to themselves). */
  profile: async function (viewerId, userId) {
    const p = await rawDb().lawUserProfile.findUnique({ where: { userId: Number(userId) } });
    if (!p) return { error: "not_found" };
    const level = await canViewProfile(viewerId, p.userId);
    if (level === LEVEL.NONE) return { error: "not_found" };
    if (level === LEVEL.PUBLIC_CARD)
      return { profile: publicCard({ userId: p.userId, name: p.fullName, avatar: avatar(p.fullName, p.userId), faculty: p.faculty, semester: p.semester }, { me: false, cardOnly: true }), error: null };
    const rows = await this._publicNotes({ createdById: p.userId });
    const notes = rows.map((n) => ({
      id: n.id,
      title: n.title,
      sessionNumber: n.sessionNumber,
      moduleName: n.workspace.moduleName,
      professorName: n.workspace.professorName,
      publishedAt: n.publishedAt,
      endorsementCount: n._count.endorsements,
      verified: n._count.endorsements >= VERIFIED_AT,
      forkCount: n._count.forks,
    }));
    const stats = await LawProgress.memberStats(p.userId);
    const { LawReferral } = require("./lawReferral");
    const ambassador = (await LawReferral.activatedCount(p.userId)) > 0;
    return {
      profile: {
        userId: p.userId,
        name: p.fullName,
        avatar: avatar(p.fullName, p.userId),
        faculty: p.faculty,
        semester: p.semester,
        filiere: p.filiere,
        languageSection: p.languageSection,
        tdGroup: p.tdGroup,
        publicProfile: p.publicProfile,
        me: p.userId === viewerId,
        level: stats.level,
        xp: stats.xp,
        streak: stats.streak,
        endorsementsReceived: notes.reduce((s, n) => s + n.endorsementCount, 0),
        forksReceived: notes.reduce((s, n) => s + n.forkCount, 0),
        badges: [...this.badges(notes), ...(ambassador ? [{ type: "ambassador" }] : [])],
        notes,
      },
      error: null,
    };
  },
};

module.exports = { LawHub, excerpt };
