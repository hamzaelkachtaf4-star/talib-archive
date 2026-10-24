// Qanouni Collab, Phase A: study squads (max 6 students, one squad per student), module workspaces (one per
// module AND professor), the shared master lecture note, and squad flashcard decks.
// Squads cross user boundaries, so this model uses the unscoped client with explicit membership checks:
// every read or write first resolves the caller's membership and refuses anything outside their squad.
// Squad deck cards are copied into each subscribed member's own LawFlashcard (via runAs, so the copy is that
// member's row): content follows the squad card, the FSRS schedule stays personal.
const crypto = require("crypto");
const { rawDb, db } = require("../utils/law/dbClient");
const { runAs } = require("../utils/law/tenant");
const { LawSetting } = require("./lawSetting");
const { LawProgress } = require("./lawProgress");
const note = require("../utils/law/masterNote");
const E = require("../utils/law/enums");

const MAX_MEMBERS = 6;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const DEFAULT_COHORT = "FSJES-AinChock-S3-DP-G01";
const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const json = (v, fallback) => {
  try {
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};

function inviteCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");
}

const normalizeCode = (c) =>
  String(c || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** Initials and a stable colour for the avatar (there are no profile photos). */
function avatar(name, userId) {
  const parts = String(name || "?").trim().split(/\s+/);
  const initials = (parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  const hue = (userId * 137) % 360;
  return { initials: initials.toUpperCase(), color: `hsl(${hue} 55% 30%)` };
}

/** The saved avatar drawings of some students: userId -> config (or nothing when they never made one). */
async function avatarConfigs(userIds) {
  const rows = await rawDb().lawUserProfile.findMany({ where: { userId: { in: [...new Set(userIds)] }, avatarConfig: { not: null } }, select: { userId: true, avatarConfig: true } });
  const out = new Map();
  for (const r of rows) { try { out.set(r.userId, JSON.parse(r.avatarConfig)); } catch { /* damaged config: initials are shown */ } }
  return out;
}

async function names(userIds) {
  const rows = await rawDb().lawUserProfile.findMany({ where: { userId: { in: [...new Set(userIds)] } } });
  const byId = new Map(rows.map((r) => [r.userId, r.fullName]));
  return (id) => byId.get(id) || "—";
}

const deckKey = (workspaceId) => `squadDeck:${workspaceId}`;

// Phase B visibility: private (creator only) | squad (squad members) | public (Faculty Hub, read-only).
const VISIBILITIES = ["private", "squad", "public"];
const VERIFIED_AT = 5; // endorsements for "موثق من الفوج"
const canSee = (n, userId) => n.visibility !== "private" || n.createdById === userId;

/**
 * Checks a visibility change (or initial visibility) against the note's final content and authors.
 * Only the creator decides; a note with other members' sections cannot become private (that would hide their
 * work from them); a public note must not link to app media or audio.
 */
function visibilityError({ visibility, n, userId, content, pins, authors }) {
  if (!VISIBILITIES.includes(visibility)) return "invalid visibility";
  if (n && n.createdById !== userId && visibility !== n.visibility) return "creator_only";
  if (visibility === "private" && authors.some((a) => a.userId !== userId)) return "has_contributors";
  if (visibility === "public" && note.hasMediaLinks(content, pins)) return "media_not_allowed";
  return null;
}

const P = require("../utils/law/permissions");
const canWrite = (m) => P.can(m.role, "doc.create"); // viewers read only; a legacy "contributor" is an editor
const canModerate = (m) => P.can(m.role, "doc.edit_any"); // owner and admin

const LawSquad = {
  MAX_MEMBERS,

  /** A new invite code: whoever was demoted to viewer, kicked, or left as a viewer must not get back in with the old one. */
  rotateInvite: async function (squadId) {
    for (let i = 0; i < 10; i++) {
      try {
        await rawDb().lawSquad.update({ where: { id: squadId }, data: { inviteCode: inviteCode() } });
        return;
      } catch (e) {
        if (e?.code !== "P2002") throw e;
      }
    }
    throw new Error("could not rotate the invite code");
  },

  /** Validates the settings a caller sent; only the keys present are returned. */
  cleanSettings: function (b = {}) {
    const data = {};
    if (b.moduleTitle !== undefined) data.moduleTitle = b.moduleTitle === null ? null : text(b.moduleTitle, 120) || null;
    if (b.visibility !== undefined) { if (!["private", "public"].includes(b.visibility)) return { error: "invalid_visibility" }; data.visibility = b.visibility; }
    if (b.publishMode !== undefined) { if (!["admin_only", "members_propose"].includes(b.publishMode)) return { error: "invalid_publish_mode" }; data.publishMode = b.publishMode; }
    return { data };
  },

  /** Owner or admin: module, visibility and who publishes. */
  setSettings: async function (userId, body = {}) {
    const m = await this.membership(userId);
    if (!m) return { error: "not_in_squad" };
    if (!["owner", "admin"].includes(m.role)) return { error: "forbidden", status: 403 };
    const s = this.cleanSettings(body);
    if (s.error) return s;
    if (!Object.keys(s.data).length) return { error: "nothing_to_update" };
    const squad = await rawDb().lawSquad.update({ where: { id: m.squadId }, data: s.data });
    return { squad, error: null };
  },

  /** Public groups with free seats, newest first. Never exposes the invite code. */
  listPublic: async function (userId, q = "") {
    const term = text(q, 60);
    const rows = await rawDb().lawSquad.findMany({
      where: { visibility: "public", ...(term ? { OR: [{ name: { contains: term } }, { moduleTitle: { contains: term } }] } : {}) },
      orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { members: true } } },
    });
    return { squads: rows.map((r) => ({ id: r.id, name: r.name, moduleTitle: r.moduleTitle, memberCount: r._count.members, createdAt: r.createdAt })), error: null };
  },

  joinPublic: async function (userId, squadId) {
    const squad = await rawDb().lawSquad.findUnique({ where: { id: String(squadId || "") } });
    if (!squad || squad.visibility !== "public") return { error: "not_found", status: 404 };
    if (await rawDb().lawSquadExclusion.findUnique({ where: { squadId_userId: { squadId: squad.id, userId } } })) return { error: "removed_from_squad", status: 403 };
    return this._joinSquad(userId, squad);
  },

  membership: async function (userId) {
    return rawDb().lawSquadMember.findUnique({ where: { userId }, include: { squad: true } });
  },

  create: async function (userId, { name, cohortTag, moduleTitle, visibility, publishMode }) {
    const n = text(name, 80);
    if (!n) return { error: "invalid name" };
    const s = this.cleanSettings({ moduleTitle, visibility, publishMode });
    if (s.error) return s;
    if (await this.membership(userId)) return { error: "already_in_squad" };
    const tag = text(cohortTag, 60) || DEFAULT_COHORT;
    if (!/^[\w.-]+$/.test(tag)) return { error: "invalid cohortTag" };
    for (let i = 0; i < 10; i++) {
      try {
        const squad = await rawDb().lawSquad.create({
          data: {
            name: n,
            cohortTag: tag,
            inviteCode: inviteCode(),
            createdById: userId,
            ...s.data,
            members: { create: { userId, role: "owner" } },
          },
        });
        return { squad, error: null };
      } catch (e) {
        if (e?.code !== "P2002") throw e;
        if (await this.membership(userId)) return { error: "already_in_squad" };
      }
    }
    throw new Error("could not allocate an invite code");
  },

  /**
   * Joins by invite code. The 6-member cap holds under concurrent joins: the row is inserted by one SQL
   * statement that only inserts while the squad has fewer than 6 members (SQLite runs it as one atomic write).
   */
  join: async function (userId, code) {
    const c = normalizeCode(code);
    if (c.length !== 6) return { error: "invalid_invite_code" };
    const squad = await rawDb().lawSquad.findUnique({ where: { inviteCode: c } });
    if (!squad) return { error: "invalid_invite_code" };
    return this._joinSquad(userId, squad);
  },

  _joinSquad: async function (userId, squad) {
    const mine = await this.membership(userId);
    if (mine) return { error: mine.squadId === squad.id ? "already_member" : "already_in_squad" };
    // 6 seats, +1 per activated referral of a current member (Phase C), at most 8.
    const { LawReferral } = require("./lawReferral");
    const capacity = await LawReferral.squadCapacity(squad.id);
    let inserted;
    try {
      // DateTime is stored as epoch milliseconds by Prisma's SQLite connector.
      inserted = await rawDb().$executeRaw`
        INSERT INTO "LawSquadMember" ("id", "squadId", "userId", "role", "joinedAt")
        SELECT ${`sm_${crypto.randomUUID()}`}, ${squad.id}, ${userId}, 'contributor', ${Date.now()}
        WHERE (SELECT COUNT(*) FROM "LawSquadMember" WHERE "squadId" = ${squad.id}) < ${capacity}`;
    } catch (e) {
      if (/UNIQUE constraint failed/i.test(e?.message || "")) return { error: "already_in_squad" };
      throw e;
    }
    if (inserted !== 1) return { error: "squad_full" };
    return { squad, error: null };
  },

  /** Leaves the squad. An owner hands over to the longest-standing member; the last one out deletes it. */
  leave: async function (userId) {
    const m = await this.membership(userId);
    if (!m) return { error: "not_in_squad" };
    await rawDb().lawSquadMember.delete({ where: { id: m.id } });
    if (m.role === "viewer") await rawDb().lawSquadExclusion.upsert({ where: { squadId_userId: { squadId: m.squadId, userId } }, create: { squadId: m.squadId, userId }, update: {} });
    if (m.role === "viewer") await this.rotateInvite(m.squadId); // a viewer who leaves cannot rejoin as an editor with the old code
    const rest = await rawDb().lawSquadMember.findMany({
      where: { squadId: m.squadId },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    });
    if (!rest.length) await rawDb().lawSquad.delete({ where: { id: m.squadId } });
    else if (m.role === "owner" && !rest.some((r) => r.role === "owner"))
      await rawDb().lawSquadMember.update({ where: { id: (rest.find((r) => r.role === "admin") || rest.find((r) => r.role !== "viewer") || rest[0]).id }, data: { role: "owner" } });
    return { ok: true };
  },

  /** The owner removes a member. */
  removeMember: async function (ownerId, targetUserId) {
    const m = await this.membership(ownerId);
    if (!m || !["owner", "admin"].includes(m.role)) return { error: "owner_only" };
    if (targetUserId === ownerId) return { error: "use_leave" };
    const t = await rawDb().lawSquadMember.findUnique({ where: { userId: targetUserId } });
    if (!t || t.squadId !== m.squadId) return { error: "not_found" };
    if (!require("../utils/law/permissions").canRemove(m.role, t.role)) return { error: "owner_only" }; // an admin never removes an admin or the owner
    await rawDb().lawSquadMember.delete({ where: { id: t.id } });
    await rawDb().lawSquadExclusion.upsert({ where: { squadId_userId: { squadId: m.squadId, userId: targetUserId } }, create: { squadId: m.squadId, userId: targetUserId }, update: {} });
    await this.rotateInvite(m.squadId);
    return { ok: true };
  },

  /** The caller's squad with members (avatar, XP, streak), collective XP and workspaces, or null. */
  my: async function (userId, now = new Date()) {
    const m = await this.membership(userId);
    if (!m) return null;
    const members = await rawDb().lawSquadMember.findMany({
      where: { squadId: m.squadId },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    });
    const nameOf = await names(members.map((x) => x.userId));
    const cfgOf = await avatarConfigs(members.map((x) => x.userId));
    // One member at a time: memberStats may recompute a streak (a write; SQLite has one writer).
    const people = [];
    for (const x of members)
      people.push({
        userId: x.userId,
        name: nameOf(x.userId),
        role: x.role,
        joinedAt: x.joinedAt,
        me: x.userId === userId,
        avatar: avatar(nameOf(x.userId), x.userId),
        avatarConfig: cfgOf.get(x.userId) || null,
        ...(await LawProgress.memberStats(x.userId, now)),
      });
    return {
      squad: {
        id: m.squad.id,
        name: m.squad.name,
        cohortTag: m.squad.cohortTag,
        moduleTitle: m.squad.moduleTitle,
        visibility: m.squad.visibility,
        publishMode: m.squad.publishMode,
        ...(P.can(m.role, "member.invite_roles") ? { inviteCode: m.squad.inviteCode } : {}),
        createdAt: m.squad.createdAt,
        maxMembers: await require("./lawReferral").LawReferral.squadCapacity(m.squadId),
      },
      myRole: m.role,
      members: people,
      collectiveXp: people.reduce((s, p) => s + p.xp, 0),
      collectiveWeeklyXp: people.reduce((s, p) => s + p.weeklyXp, 0),
      workspaces: await this.listWorkspaces(userId),
    };
  },

  // ---- module workspaces ----------------------------------------------------------------------------
  /** The workspace if it belongs to the caller's squad (else null), with the caller's membership. */
  workspaceFor: async function (userId, workspaceId) {
    const m = await this.membership(userId);
    if (!m) return null;
    const ws = await rawDb().lawModuleWorkspace.findUnique({ where: { id: String(workspaceId || "") } });
    return ws && ws.squadId === m.squadId ? { ws, m } : null;
  },

  listWorkspaces: async function (userId) {
    const m = await this.membership(userId);
    if (!m) return [];
    const rows = await rawDb().lawModuleWorkspace.findMany({
      where: { squadId: m.squadId },
      orderBy: [{ moduleName: "asc" }, { professorName: "asc" }],
      include: { _count: { select: { masterNotes: true, cards: { where: { deletedAt: null } } } } },
    });
    return rows.map(({ _count, ...w }) => ({ ...w, noteCount: _count.masterNotes, cardCount: _count.cards }));
  },

  createWorkspace: async function (userId, { moduleName, professorName, academicYear }) {
    const m = await this.membership(userId);
    if (!m) return { error: "not_in_squad" };
    if (!canWrite(m)) return { error: "forbidden" };
    const mod = text(moduleName, 160);
    const prof = text(professorName, 120);
    if (!mod || !prof) return { error: "invalid workspace" };
    const year = text(academicYear, 9);
    if (year && !/^\d{4}\/\d{4}$/.test(year)) return { error: "invalid academicYear" };
    const workspace = await rawDb().lawModuleWorkspace.create({
      data: { squadId: m.squadId, moduleName: mod, professorName: prof, createdById: userId, ...(year ? { academicYear: year } : {}) },
    });
    return { workspace, error: null };
  },

  deleteWorkspace: async function (userId, workspaceId) {
    const found = await this.workspaceFor(userId, workspaceId);
    if (!found) return { error: "not_found" };
    if (!canModerate(found.m) && found.ws.createdById !== userId) return { error: "owner_only" };
    await rawDb().lawModuleWorkspace.delete({ where: { id: found.ws.id } });
    return { ok: true };
  },

  // ---- master notes -------------------------------------------------------------------------------------
  listNotes: async function (userId, workspaceId) {
    const found = await this.workspaceFor(userId, workspaceId);
    if (!found) return { error: "not_found" };
    const notes = await rawDb().lawMasterNote.findMany({
      where: { workspaceId: found.ws.id, OR: [{ visibility: { not: "private" } }, { createdById: userId }] },
      orderBy: { sessionNumber: "asc" },
      select: {
        id: true,
        sessionNumber: true,
        date: true,
        title: true,
        contributors: true,
        updatedAt: true,
        version: true,
        visibility: true,
        forkedFromAuthorName: true,
        _count: { select: { endorsements: true } },
      },
    });
    return {
      workspace: found.ws,
      notes: notes.map(({ _count, ...n }) => ({
        ...n,
        contributors: json(n.contributors, []),
        endorsementCount: _count.endorsements,
        verified: _count.endorsements >= VERIFIED_AT,
      })),
    };
  },

  /** A note with resolved pin previews and member names/avatars for its contributors and section authors. */
  getNote: async function (userId, noteId) {
    const n = await rawDb().lawMasterNote.findUnique({ where: { id: String(noteId || "") } });
    if (!n || !canSee(n, userId) || !(await this.workspaceFor(userId, n.workspaceId))) return { error: "not_found" };
    return { note: await this.present(n, userId), error: null };
  },

  present: async function (n, viewerId = null) {
    const pins = json(n.sourcePins, []);
    const authors = json(n.sectionAuthors, []);
    const contrib = json(n.contributors, []);
    const nameOf = await names([...authors.map((a) => a.userId), ...contrib.map((c) => c.userId), n.createdById]);
    const person = (id) => ({ userId: id, name: nameOf(id), avatar: avatar(nameOf(id), id) });
    // Article pins must resolve in the local corpus (LAW-OS grounding rule); unresolved ones are flagged.
    const { LawCorpus } = require("./lawCorpus");
    const refs = pins.filter((p) => p.type === "ref").map((p) => p.ref);
    const resolved = refs.length ? await runAs({ system: true }, () => LawCorpus.resolve(refs)) : {};
    const previews = {};
    for (const ref of refs) {
      const r = resolved[ref];
      if (!r?.exists) continue;
      const v = r.versionId
        ? await rawDb().lawArticleVersion.findUnique({ where: { id: r.versionId }, select: { textAr: true } })
        : null;
      previews[ref] = (v?.textAr || "").slice(0, 280);
    }
    return {
      ...n,
      planJson: json(n.planJson, []),
      sourcePins: pins.map((p) =>
        p.type === "ref"
          ? { ...p, resolved: !!resolved[p.ref]?.exists, preview: previews[p.ref] ?? null }
          : { ...p, resolved: true, preview: null }
      ),
      danglingPins: note.danglingPins(n.content, pins),
      // Sections in order, each with its author (Law Blame), so clients never re-parse the Markdown.
      sections: note.parseSections(n.content).map((sec) => {
        const by = authors.find((x) => x.key === sec.key)?.userId ?? n.createdById;
        return { ...sec, kind: sec.level ? note.kindOf(sec.heading) : "intro", author: person(by) };
      }),
      contributors: contrib.map((c) => ({ ...c, ...person(c.userId) })),
      sectionAuthors: authors.map((a) => ({ ...a, ...person(a.userId) })),
      createdBy: person(n.createdById),
      ...(await this.socialCounts(n.id, viewerId)),
    };
  },

  /** Endorsements (count, verified, mine) and forks of a note. */
  socialCounts: async function (noteId, viewerId) {
    const [endorsementCount, forkCount, mine] = await Promise.all([
      rawDb().lawEndorsement.count({ where: { noteId } }),
      rawDb().lawMasterNote.count({ where: { forkedFromId: noteId } }),
      viewerId ? rawDb().lawEndorsement.findUnique({ where: { noteId_userId: { noteId, userId: viewerId } } }) : null,
    ]);
    return { endorsementCount, verified: endorsementCount >= VERIFIED_AT, endorsedByMe: !!mine, forkCount };
  },

  /** Shared validation for create and update. */
  _noteFields: function (input, { creating }) {
    const data = {};
    if (creating || "title" in input) {
      const t = text(input.title, 200);
      if (!t) return { error: "invalid title" };
      data.title = t;
    }
    if (creating || "sessionNumber" in input) {
      const s = Number(input.sessionNumber);
      if (!Number.isInteger(s) || s < 1 || s > 200) return { error: "invalid sessionNumber" };
      data.sessionNumber = s;
    }
    if ("date" in input && input.date) {
      const d = new Date(input.date);
      if (Number.isNaN(d.getTime())) return { error: "invalid date" };
      data.date = d;
    }
    if (creating || "content" in input) {
      if (typeof input.content !== "string" || input.content.length > note.MAX_CONTENT)
        return { error: "invalid content" };
      data.content = input.content;
    }
    if ("docType" in input) {
      if (input.docType !== null && !E.NOTE_DOC_TYPES.includes(input.docType)) return { error: "invalid docType" };
      data.docType = input.docType;
    }
    if ("sourcePins" in input) {
      const p = note.cleanPins(input.sourcePins);
      if (p.error) return { error: p.error };
      data.sourcePins = JSON.stringify(p.pins);
    }
    return { data };
  },

  createNote: async function (userId, workspaceId, input = {}) {
    const found = await this.workspaceFor(userId, workspaceId);
    if (!found) return { error: "not_found" };
    if (!canWrite(found.m)) return { error: "forbidden" };
    const f = this._noteFields(input, { creating: true });
    if (f.error) return f;
    const sections = note.parseSections(f.data.content);
    const authors = note.blame([], [], sections, userId);
    const visibility = input.visibility ?? "squad";
    const vErr = visibilityError({
      visibility,
      n: null,
      userId,
      content: f.data.content,
      pins: json(f.data.sourcePins, []),
      authors,
    });
    if (vErr) return { error: vErr };
    try {
      const n = await rawDb().lawMasterNote.create({
        data: {
          ...f.data,
          visibility,
          publishedAt: visibility === "public" ? new Date() : null,
          workspaceId: found.ws.id,
          sourcePins: f.data.sourcePins || "[]",
          planJson: JSON.stringify(note.outline(sections)),
          sectionAuthors: JSON.stringify(authors),
          contributors: JSON.stringify(note.contributors(sections, authors)),
          createdById: userId,
          updatedById: userId,
        },
      });
      return { note: await this.present(n, userId), error: null };
    } catch (e) {
      if (e?.code === "P2002") return { error: "session_exists" };
      throw e;
    }
  },

  /**
   * Saves a member's edit. `version` must be the one they started from: if someone saved in between, the
   * edit is refused (409) with the current note, so nobody silently overwrites a squad-mate.
   */
  updateNote: async function (userId, noteId, input = {}) {
    const n = await rawDb().lawMasterNote.findUnique({ where: { id: String(noteId || "") } });
    const ws = n && canSee(n, userId) ? await this.workspaceFor(userId, n.workspaceId) : null;
    if (!ws) return { error: "not_found" };
    if (!canWrite(ws.m)) return { error: "forbidden" };
    if (!Number.isInteger(input.version)) return { error: "version required" };
    const f = this._noteFields(input, { creating: false });
    if (f.error) return f;
    const data = { ...f.data, updatedById: userId, version: { increment: 1 } };
    let authors = json(n.sectionAuthors, []);
    if ("content" in f.data) {
      const prev = note.parseSections(n.content);
      const next = note.parseSections(f.data.content);
      authors = note.blame(prev, authors, next, userId);
      data.planJson = JSON.stringify(note.outline(next));
      data.sectionAuthors = JSON.stringify(authors);
      data.contributors = JSON.stringify(note.contributors(next, authors));
    }
    // The resulting visibility is checked against the resulting content: an edit cannot sneak media into a
    // public note, and only the creator can change who sees it.
    const visibility = "visibility" in input ? input.visibility : n.visibility;
    const vErr = visibilityError({
      visibility,
      n,
      userId,
      content: f.data.content ?? n.content,
      pins: json(f.data.sourcePins ?? n.sourcePins, []),
      authors,
    });
    if (vErr) return { error: vErr };
    if (visibility !== n.visibility) {
      data.visibility = visibility;
      if (visibility === "public") data.publishedAt = new Date();
    }
    let count;
    try {
      ({ count } = await rawDb().lawMasterNote.updateMany({ where: { id: n.id, version: input.version }, data }));
    } catch (e) {
      if (e?.code === "P2002") return { error: "session_exists" };
      throw e;
    }
    if (count !== 1) {
      const current = await rawDb().lawMasterNote.findUnique({ where: { id: n.id } });
      return { error: "edit_conflict", current: await this.present(current, userId) };
    }
    return {
      note: await this.present(await rawDb().lawMasterNote.findUnique({ where: { id: n.id } }), userId),
      error: null,
    };
  },

  deleteNote: async function (userId, noteId) {
    const n = await rawDb().lawMasterNote.findUnique({ where: { id: String(noteId || "") } });
    const found = n && canSee(n, userId) && (await this.workspaceFor(userId, n.workspaceId));
    if (!found) return { error: "not_found" };
    if (!canModerate(found.m) && n.createdById !== userId) return { error: "owner_only" };
    await rawDb().lawMasterNote.delete({ where: { id: n.id } });
    return { ok: true };
  },

  // ---- squad decks ---------------------------------------------------------------------------------------
  listCards: async function (userId, workspaceId) {
    const found = await this.workspaceFor(userId, workspaceId);
    if (!found) return { error: "not_found" };
    const cards = await rawDb().lawSquadCard.findMany({
      where: { workspaceId: found.ws.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const subscribed = !!(await runAs({ userId, role: "default" }, () => LawSetting.getUserMeta(deckKey(found.ws.id))));
    const nameOf = await names(cards.map((c) => c.createdById));
    return {
      subscribed,
      cards: cards.map((c) => ({ ...c, canonicalIds: json(c.canonicalIds, []), createdBy: nameOf(c.createdById) })),
    };
  },

  _cardFields: function (input, { creating }) {
    const data = {};
    for (const k of ["front", "back"])
      if (creating || k in input) {
        if (typeof input[k] !== "string" || !input[k].trim() || input[k].length > 5000) return { error: `invalid ${k}` };
        data[k] = input[k].trim();
      }
    if ("canonicalIds" in input) {
      if (!Array.isArray(input.canonicalIds) || input.canonicalIds.length > 20) return { error: "invalid canonicalIds" };
      const { normalizeCanonicalId } = require("../utils/law/arabic");
      const ids = input.canonicalIds.map(normalizeCanonicalId);
      if (ids.some((x) => !x)) return { error: "invalid canonicalIds" };
      data.canonicalIds = JSON.stringify([...new Set(ids)]);
    }
    return { data };
  },

  createCard: async function (userId, workspaceId, input = {}) {
    const found = await this.workspaceFor(userId, workspaceId);
    if (!found) return { error: "not_found" };
    if (!canWrite(found.m)) return { error: "forbidden" };
    const f = this._cardFields(input, { creating: true });
    if (f.error) return f;
    const card = await rawDb().lawSquadCard.create({ data: { ...f.data, workspaceId: found.ws.id, createdById: userId } });
    await this.fanOut(found.ws);
    return { card, error: null };
  },

  updateCard: async function (userId, cardId, input = {}) {
    const c = await rawDb().lawSquadCard.findUnique({ where: { id: String(cardId || "") } });
    const found = c && !c.deletedAt && (await this.workspaceFor(userId, c.workspaceId));
    if (!found) return { error: "not_found" };
    if (!canWrite(found.m)) return { error: "forbidden" };
    const f = this._cardFields(input, { creating: false });
    if (f.error) return f;
    const card = await rawDb().lawSquadCard.update({ where: { id: c.id }, data: { ...f.data, version: { increment: 1 } } });
    await this.fanOut(found.ws);
    return { card, error: null };
  },

  deleteCard: async function (userId, cardId) {
    const c = await rawDb().lawSquadCard.findUnique({ where: { id: String(cardId || "") } });
    const found = c && !c.deletedAt && (await this.workspaceFor(userId, c.workspaceId));
    if (!found) return { error: "not_found" };
    if (!canModerate(found.m) && c.createdById !== userId) return { error: "owner_only" };
    await rawDb().lawSquadCard.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
    await this.fanOut(found.ws);
    return { ok: true };
  },

  /**
   * Brings one member's copies of a workspace deck up to date: missing cards are created in their personal
   * subject for the module (created on first use), changed content is copied, deleted cards are retired.
   * Runs as that member, so every write lands in their own rows. FSRS fields are never touched.
   */
  syncDeckFor: async function (memberId, ws) {
    const cards = await rawDb().lawSquadCard.findMany({ where: { workspaceId: ws.id } });
    return runAs({ userId: memberId, role: "default" }, async () => {
      let subject = await db().lawSubject.findFirst({ where: { name: ws.moduleName, professorName: ws.professorName } });
      if (!subject)
        subject = await db().lawSubject.create({ data: { name: ws.moduleName, professorName: ws.professorName } });
      const copies = await db().lawFlashcard.findMany({ where: { squadCardId: { in: cards.map((c) => c.id) } } });
      const bySquad = new Map(copies.map((c) => [c.squadCardId, c]));
      let created = 0;
      let updated = 0;
      for (const c of cards) {
        const mine = bySquad.get(c.id);
        if (c.deletedAt) {
          if (mine && !mine.deletedAt)
            await db().lawFlashcard.update({ where: { id: mine.id }, data: { deletedAt: c.deletedAt } });
          continue;
        }
        const content = { front: c.front, back: c.back, canonicalIds: c.canonicalIds };
        if (!mine) {
          await db().lawFlashcard.create({ data: { ...content, subjectId: subject.id, origin: "squad", squadCardId: c.id } });
          created++;
        } else if (mine.front !== c.front || mine.back !== c.back || mine.canonicalIds !== c.canonicalIds || mine.deletedAt) {
          await db().lawFlashcard.update({ where: { id: mine.id }, data: { ...content, deletedAt: null } });
          updated++;
        }
      }
      await LawSetting.setUserMeta(deckKey(ws.id), true);
      return { created, updated, subjectId: subject.id };
    });
  },

  /** Subscribes the caller to a workspace deck and syncs it into their reviews. */
  subscribe: async function (userId, workspaceId) {
    const found = await this.workspaceFor(userId, workspaceId);
    if (!found) return { error: "not_found" };
    return { ...(await this.syncDeckFor(userId, found.ws)), error: null };
  },

  /** Propagates a deck change to every current member who subscribed to it. */
  fanOut: async function (ws) {
    const members = await rawDb().lawSquadMember.findMany({ where: { squadId: ws.squadId } });
    for (const m of members) {
      const on = await runAs({ userId: m.userId, role: "default" }, () => LawSetting.getUserMeta(deckKey(ws.id)));
      if (on) await this.syncDeckFor(m.userId, ws);
    }
  },
};

module.exports = { LawSquad, normalizeCode, avatar, avatarConfigs, names, json, VERIFIED_AT, DEFAULT_COHORT };
