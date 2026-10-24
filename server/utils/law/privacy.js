// One place that decides how much of a student another student may see (RC2 1.2).
//   FULL        owner, or an ACCEPTED follower, or a public (non-private) account that opted into a public profile
//   PUBLIC_CARD display name, avatar, faculty/semester only: no counts, activity or notes
//   NONE        blocked either way, unknown, or not opted in: indistinguishable from "doesn't exist"
const { rawDb } = require("./dbClient");

const LEVEL = { FULL: "FULL", PUBLIC_CARD: "PUBLIC_CARD", NONE: "NONE" };

async function canViewProfile(viewerId, ownerId) {
  const owner = Number(ownerId);
  if (!Number.isInteger(owner)) return LEVEL.NONE;
  if (viewerId === owner) return LEVEL.FULL;
  const db = rawDb();
  const p = await db.lawUserProfile.findUnique({ where: { userId: owner }, select: { isPrivate: true, publicProfile: true } });
  if (!p) return LEVEL.NONE;
  const blocked = await db.lawBlock.findFirst({ where: { OR: [{ blockerId: viewerId, blockedId: owner }, { blockerId: owner, blockedId: viewerId }] } });
  if (blocked) return LEVEL.NONE;
  const follow = await db.lawFollow.findFirst({ where: { followerId: viewerId, followeeId: owner, status: "ACCEPTED" } });
  if (follow) return LEVEL.FULL;
  if (!p.publicProfile) return LEVEL.NONE;
  return p.isPrivate ? LEVEL.PUBLIC_CARD : LEVEL.FULL;
}

/** Explicit allowlist: the card is built by picking fields, never by deleting them from a fuller object. */
const publicCard = (p, extra = {}) => ({ userId: p.userId, name: p.name, avatar: p.avatar, faculty: p.faculty, semester: p.semester, ...extra });

module.exports = { canViewProfile, publicCard, LEVEL };
