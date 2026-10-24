const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  FTS_TABLES,
  ftsDb,
  closeFts,
  ftsTables,
  rebuildFts,
  registerFtsIndexer,
} = require("../../../utils/law/fts");

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-fts-"));
});
afterEach(() => {
  closeFts();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("FTS index", () => {
  test("creates all FTS5 tables in a separate file", () => {
    const db = ftsDb(path.join(dir, "fts.db"));
    expect(ftsTables(db).sort()).toEqual(Object.keys(FTS_TABLES).sort());
    expect(fs.existsSync(path.join(dir, "fts.db"))).toBe(true);
  });

  test("matches Arabic text and keeps ref_id unindexed", () => {
    const db = ftsDb(path.join(dir, "fts.db"));
    db.prepare(
      "INSERT INTO law_fts_article_versions (ref_id, canonical_id, text_original, text_normalized, text_stemmed) VALUES (?, ?, ?, ?, ?)"
    ).run("v1", "DOC:77", "كل فعل ارتكبه الإنسان", "كل فعل ارتكبه الانسان", "فعل ارتكب انسان");
    const hit = db
      .prepare("SELECT ref_id FROM law_fts_article_versions WHERE law_fts_article_versions MATCH ?")
      .get('text_normalized:"الانسان"');
    expect(hit.ref_id).toBe("v1");
    const none = db
      .prepare("SELECT ref_id FROM law_fts_article_versions WHERE law_fts_article_versions MATCH ?")
      .all('"v1"');
    expect(none).toHaveLength(0);
  });

  test("rebuild drops content and runs registered indexers", async () => {
    const db = ftsDb(path.join(dir, "fts.db"));
    db.prepare("INSERT INTO law_fts_decisions (ref_id, decision_key, text_original) VALUES ('d0', 'x', 'قديم')").run();
    registerFtsIndexer("law_fts_decisions", async (d) => {
      d.prepare("INSERT INTO law_fts_decisions (ref_id, decision_key, text_original) VALUES ('d1', 'CC:1', 'جديد')").run();
    });
    const rebuilt = await rebuildFts(db);
    expect(rebuilt.sort()).toEqual(["law_fts_article_versions", "law_fts_course_topics", "law_fts_decisions", "law_fts_note_atoms"]);
    const rows = db.prepare("SELECT ref_id FROM law_fts_decisions").all();
    expect(rows.map((r) => r.ref_id)).toEqual(["d1"]);
  });

  test("rejects indexers for unknown tables", () => {
    expect(() => registerFtsIndexer("nope", async () => {})).toThrow();
  });
});
