// One-off data migration: legacy accepted LawFriendship rows -> two ACCEPTED LawFollow rows (both directions).
// Idempotent. Usage: node utils/law/scripts/migrateFriendships.js [--dry-run]
const dryRun = process.argv.includes("--dry-run");

async function migrateFriendships(db, { dryRun = false } = {}) {
  const rows = await db.lawFriendship.findMany({ where: { status: "accepted" } });
  let created = 0;
  let existing = 0;
  for (const r of rows)
    for (const [f, t] of [[r.requesterId, r.addresseeId], [r.addresseeId, r.requesterId]]) {
      const have = await db.lawFollow.findUnique({ where: { followerId_followeeId: { followerId: f, followeeId: t } } });
      if (have?.status === "ACCEPTED") { existing++; continue; }
      created++;
      if (dryRun) continue;
      await db.lawFollow.upsert({
        where: { followerId_followeeId: { followerId: f, followeeId: t } },
        create: { followerId: f, followeeId: t, status: "ACCEPTED", decidedAt: new Date() },
        update: { status: "ACCEPTED", decidedAt: new Date() },
      });
    }
  return { friendships: rows.length, followsToCreate: created, alreadyAccepted: existing, dryRun };
}

module.exports = { migrateFriendships };

if (require.main === module) {
  const { rawDb } = require("../dbClient");
  migrateFriendships(rawDb(), { dryRun })
    .then((r) => { console.log(JSON.stringify(r)); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
