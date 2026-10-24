// RC3 Phase 10: release guards that outlive the audit: IndexedDB upgrade from the very first schema, and additive-only RC3 migrations.
const fs = require("fs");
const path = require("path");
const { IDBFactory } = require("fake-indexeddb");
const { loadEsm } = require("../../utils/law/testing/renderJsx");

const MIGRATIONS = path.resolve(__dirname, "../../prisma/migrations");

describe("IndexedDB: a device last opened on the first schema reaches the current one without losing a record", () => {
  test("v1 -> v5", async () => {
    globalThis.indexedDB = new IDBFactory();
    await new Promise((resolve, reject) => {
      const req = indexedDB.open("lawos", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("cards", { keyPath: "id" });
        db.createObjectStore("reviewQueue", { keyPath: "clientReviewId" });
        db.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["cards", "reviewQueue", "meta"], "readwrite");
        tx.objectStore("cards").put({ id: "c1", front: "س" });
        tx.objectStore("reviewQueue").put({ clientReviewId: "r1", rating: 3 });
        tx.objectStore("meta").put({ key: "pack", value: { n: 1 } });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    const idb = await loadEsm('export * from "@/components/LawOS/lib/idb";');
    expect(await idb.getAll("cards")).toEqual([{ id: "c1", front: "س" }]);
    expect(await idb.getAll("reviewQueue")).toEqual([{ clientReviewId: "r1", rating: 3 }]);
    expect(await idb.getMeta("pack")).toEqual({ n: 1 });
    const db = await idb.openDb();
    expect(db.version).toBe(5);
    expect([...db.objectStoreNames].sort()).toEqual(["batches", "captures", "cards", "legalTexts", "meta", "reviewQueue", "todos", "ttQueue"]);
    db.close();
  });
});

describe("RC3 migrations are additive", () => {
  const rc3 = fs.readdirSync(MIGRATIONS).filter((d) => /^\d{14}_rc3_/.test(d)).sort();
  test("there is one per phase that changed the schema, in order", () => {
    expect(rc3.map((d) => d.replace(/^\d+_/, ""))).toEqual(["rc3_p2_todos", "rc3_p3_modules", "rc3_p4_exams", "rc3_p3_review_fixes", "rc3_p5_timetable", "rc3_p4_review_fixes", "rc3_p6_corpus", "rc3_p7_squads"]);
  });
  test("no column or table is dropped or renamed, except the data-preserving table rebuild SQLite needs", () => {
    for (const d of rc3) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, d, "migration.sql"), "utf8");
      expect(sql).not.toMatch(/DROP COLUMN|RENAME COLUMN|ALTER TABLE\s+"(?!new_)\w+"\s+RENAME TO/i);
      for (const m of sql.matchAll(/DROP TABLE "(\w+)"/g)) {
        // A rebuild copies the rows first: INSERT INTO "new_X" ... SELECT ... FROM "X" precedes DROP TABLE "X".
        const copy = new RegExp(`INSERT INTO "new_${m[1]}"[^;]*FROM "${m[1]}"`, "s");
        expect({ migration: d, table: m[1], copiedFirst: copy.test(sql.slice(0, m.index)) }).toEqual({ migration: d, table: m[1], copiedFirst: true });
      }
      expect(sql).not.toMatch(/TRUNCATE|createMany/i);
      // The only row deletion allowed is de-duplication in a table that RC3 itself created (never a pre-RC3 table).
      const createdByRc3 = rc3.filter((x) => x <= d).map((x) => fs.readFileSync(path.join(MIGRATIONS, x, "migration.sql"), "utf8")).join("\n");
      for (const m of sql.matchAll(/DELETE FROM "(\w+)"/g)) expect({ migration: d, table: m[1], createdInRc3: new RegExp(`CREATE TABLE "${m[1]}"`).test(createdByRc3) }).toEqual({ migration: d, table: m[1], createdInRc3: true });
    }
  });
});
