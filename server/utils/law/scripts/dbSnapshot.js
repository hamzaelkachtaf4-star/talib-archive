#!/usr/bin/env node
// Consistent SQLite snapshot + verification for LAW-OS backups (spec §11 Phase 0, docs/DEPLOY.md).
// Runs inside the container so it uses the same SQLite as the app. No Prisma: works on a stopped app too.
//
//   node dbSnapshot.js backup <src.db> <dest.db>   online backup (safe while the app writes, WAL-aware)
//   node dbSnapshot.js stats <file.db>             JSON fingerprint used to verify a restore
const { DatabaseSync, backup } = require("node:sqlite");
const fs = require("fs");

// Tables whose row counts fingerprint a backup. Missing tables are reported as null.
const FINGERPRINT_TABLES = [
  "_prisma_migrations",
  "workspaces",
  "system_settings",
  "LawSetting",
  "LawDevice",
  "LawAiCall",
];

function stats(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
  const counts = {};
  for (const t of FINGERPRINT_TABLES) {
    try {
      counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
    } catch {
      counts[t] = null;
    }
  }
  const lastMigration =
    db
      .prepare(
        "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1"
      )
      .get()?.migration_name ?? null;
  db.close();
  return { integrity, counts, lastMigration };
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "backup" && a && b) {
    if (fs.existsSync(b)) fs.rmSync(b);
    const src = new DatabaseSync(a, { readOnly: true });
    await backup(src, b);
    src.close();
    const result = stats(b);
    if (result.integrity !== "ok")
      throw new Error(`integrity_check failed: ${result.integrity}`);
    process.stdout.write(JSON.stringify(result));
    return;
  }
  if (cmd === "stats" && a) {
    process.stdout.write(JSON.stringify(stats(a)));
    return;
  }
  console.error("usage: dbSnapshot.js backup <src> <dest> | stats <file>");
  process.exit(2);
}

main().catch((e) => {
  console.error(`[dbSnapshot] ${e.message}`);
  process.exit(1);
});
