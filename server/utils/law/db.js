// SQLite tuning for the dv6's HDD (spec §2.1, §4.3). WAL lets readers proceed during writes;
// synchronous=NORMAL is safe in WAL mode and avoids an fsync per transaction.

/**
 * @param {import('@prisma/client').PrismaClient} client
 */
async function applySqlitePragmas(client) {
  // PRAGMAs that return rows must go through $queryRaw on SQLite.
  const [mode] = await client.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
  await client.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
  await client.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
  return mode?.journal_mode;
}

async function journalMode(client) {
  const [row] = await client.$queryRawUnsafe("PRAGMA journal_mode;");
  return row?.journal_mode;
}

module.exports = { applySqlitePragmas, journalMode };
