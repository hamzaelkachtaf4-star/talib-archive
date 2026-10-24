// FTS5 index for LAW-OS (spec §5.8), kept in its own file `storage/law/fts.db`.
// Why a separate file: Prisma cannot model virtual tables, and FTS5 shadow tables inside the main DB show
// up as drift on every `prisma migrate dev` (see docs/DECISIONS.md D-004). The index is fully rebuildable
// from the main DB, so it is excluded from backups. Uses Node's built-in node:sqlite (Node >= 22.13).
//
// Each table stores the owning row id (UNINDEXED), the original text, a normalized shadow (§6.4) and a
// light-stemmed shadow. Sync happens in the service layer of each phase, not via triggers.

const { lawPath } = require("./storage");

const FTS_TABLES = {
  law_fts_article_versions: [
    "ref_id",
    "canonical_id",
    "text_original",
    "text_normalized",
    "text_stemmed",
  ],
  law_fts_note_atoms: [
    "ref_id",
    "subject_id",
    "text_original",
    "text_normalized",
    "text_stemmed",
  ],
  law_fts_decisions: [
    "ref_id",
    "decision_key",
    "text_original",
    "text_normalized",
    "text_stemmed",
  ],
  // A student's own course topics (title + notes). Rows are found here, then loaded through the scoped client,
  // so another student's rows can never be returned even if ids collide.
  law_fts_course_topics: [
    "ref_id",
    "course_id",
    "user_id",
    "text_original",
    "text_normalized",
    "text_stemmed",
  ],
};

const UNINDEXED = new Set(["ref_id", "subject_id", "course_id", "user_id"]);

function createSql(table) {
  const cols = FTS_TABLES[table]
    .map((c) => (UNINDEXED.has(c) ? `${c} UNINDEXED` : c))
    .join(", ");
  return `CREATE VIRTUAL TABLE IF NOT EXISTS "${table}" USING fts5(${cols}, tokenize = 'unicode61 remove_diacritics 2')`;
}

let _db = null;
let _dbPath = null;

/**
 * Opens (once) and returns the FTS database, creating missing tables.
 * @param {string} [file] override path, used by tests
 * @returns {import('node:sqlite').DatabaseSync}
 */
function ftsDb(file = lawPath("fts.db")) {
  if (_db && _dbPath === file) return _db;
  if (_db) _db.close();
  const { DatabaseSync } = require("node:sqlite");
  require("fs").mkdirSync(require("path").dirname(file), { recursive: true });
  _db = new DatabaseSync(file);
  _dbPath = file;
  _db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;"
  );
  for (const table of Object.keys(FTS_TABLES)) _db.exec(createSql(table));
  return _db;
}

function closeFts() {
  if (_db) _db.close();
  _db = null;
  _dbPath = null;
}

// Indexers are registered by later phases: table -> async (db) => void (refills the table from Prisma).
const indexers = {};
function registerFtsIndexer(table, fn) {
  if (!FTS_TABLES[table]) throw new Error(`Unknown FTS table ${table}`);
  indexers[table] = fn;
}

async function rebuildFts(db = ftsDb()) {
  const rebuilt = [];
  for (const table of Object.keys(FTS_TABLES)) {
    db.exec(`DROP TABLE IF EXISTS "${table}"`);
    db.exec(createSql(table));
    if (indexers[table]) await indexers[table](db);
    rebuilt.push(table);
  }
  return rebuilt;
}

function ftsTables(db = ftsDb()) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'law_fts_%' AND sql LIKE '%fts5%'"
    )
    .all()
    .map((r) => r.name);
}

module.exports = {
  FTS_TABLES,
  createSql,
  ftsDb,
  closeFts,
  ftsTables,
  rebuildFts,
  registerFtsIndexer,
};
