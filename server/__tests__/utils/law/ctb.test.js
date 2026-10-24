const fs = require("fs");
const os = require("os");
const path = require("path");
const { makeCtb, richText } = require("../../../utils/law/testing/makeCtb");
const { readCtb, readCtbIsolated, parseRichText, CtbError } = require("../../../utils/law/course/ctb");

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-ctb-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const file = (nodes, name = "n.ctb") => makeCtb(path.join(dir, name), nodes);

describe("parseRichText", () => {
  test("joins rich_text runs, records the student's bold runs as emphasis spans", () => {
    const r = parseRichText(richText(["الأهلية التجارية هي ", { b: "سن الرشد" }, " القانوني."]));
    expect(r.text).toBe("الأهلية التجارية هي سن الرشد القانوني.");
    expect(r.emphasis).toEqual([{ start: 20, end: 28 }]);
    expect(r.text.slice(20, 28)).toBe("سن الرشد");
  });

  test("decodes XML entities and never expands external ones", () => {
    const r = parseRichText('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><node><rich_text>a &amp; b &lt;c&gt; &#1575; &#x628; &e;</rich_text></node>');
    expect(r.text).toBe("a & b <c> ا ب &e;");
    expect(r.text).not.toMatch(/root:/);
  });

  test("merges adjacent bold runs, drops empty ones, and keeps spans valid after trimming", () => {
    const r = parseRichText(richText(["  ", { b: "ا" }, { b: "ب" }, " ", { b: "" }, "ج  "]));
    expect(r.text).toBe("اب ج");
    expect(r.emphasis).toEqual([{ start: 0, end: 2 }]);
  });

  test("plain text and empty values are accepted", () => {
    expect(parseRichText("just text")).toEqual({ text: "just text", emphasis: [] });
    expect(parseRichText(null)).toEqual({ text: "", emphasis: [] });
    expect(parseRichText("<?xml version='1.0'?><node/>")).toEqual({ text: "", emphasis: [] });
  });

  test("tables, images and code boxes are ignored, not crashed on", () => {
    const r = parseRichText('<node><rich_text>نص</rich_text><encoded_png char_offset="3">AAAA</encoded_png><rich_text>آخر</rich_text></node>');
    expect(r.text).toBe("نصآخر");
  });
});

describe("readCtb", () => {
  test("builds the tree from the children edges: depth comes from the edges (level is always 0), order from sequence", () => {
    const f = file([
      { id: 1, name: "القانون التجاري", seq: 2, txt: richText(["مقدمة"]) },
      { id: 2, name: "شروط اكتساب صفة تاجر", parent: 1, seq: 2 },
      { id: 3, name: "الأنشطة التجارية", parent: 2, seq: 1, txt: richText([{ b: "مهم" }]) },
      { id: 4, name: "الأهلية", parent: 1, seq: 1 },
      { id: 5, name: "القانون الجنائي", seq: 1 },
    ]);
    const r = readCtb(f);
    expect(r.roots.map((x) => x.title)).toEqual(["القانون الجنائي", "القانون التجاري"]);
    const com = r.roots[1];
    expect(com.children.map((x) => x.title)).toEqual(["الأهلية", "شروط اكتساب صفة تاجر"]);
    expect(com.children[1].children[0]).toMatchObject({ title: "الأنشطة التجارية", text: "مهم", emphasis: [{ start: 0, end: 3 }] });
    expect(r.stats).toMatchObject({ nodes: 5, maxDepth: 3 });
  });

  test("an orphan (father missing) is attached as a root with a warning; a cycle is reported and left out", () => {
    const f = file([
      { id: 1, name: "جذر" },
      { id: 2, name: "يتيم", parent: 99 },
      { id: 3, name: "دورة أ", parent: 4 },
      { id: 4, name: "دورة ب", parent: 3 },
    ]);
    const r = readCtb(f);
    expect(r.roots.map((x) => x.title).sort()).toEqual(["جذر", "يتيم"].sort());
    expect(r.warnings.map((w) => w.code).sort()).toEqual(["orphan", "unreachable", "unreachable"]);
    expect(r.stats.nodes).toBe(2);
  });

  test("whitespace in titles is normalised and an empty title gets a placeholder", () => {
    const f = file([{ id: 1, name: "  الفصل   الأول:\n أحكام  " }, { id: 2, name: "   ", parent: 1 }]);
    const r = readCtb(f);
    expect(r.roots[0].title).toBe("الفصل الأول: أحكام");
    expect(r.roots[0].children[0].title).toBe("(بدون عنوان)");
  });

  test("rejects files that are not SQLite, not CherryTree, or too large, before reading any content", () => {
    const junk = path.join(dir, "junk.ctb");
    fs.writeFileSync(junk, "not a database at all, really not");
    expect(() => readCtb(junk)).toThrow(expect.objectContaining({ name: "CtbError", code: "not_sqlite" }));
    const other = path.join(dir, "other.db");
    const { DatabaseSync } = require("node:sqlite");
    const d = new DatabaseSync(other);
    d.exec("CREATE TABLE t (a)");
    d.close();
    expect(() => readCtb(other)).toThrow(expect.objectContaining({ code: "bad_schema" }));
    expect(() => readCtb(file([{ id: 1, name: "a" }]), { maxBytes: 100 })).toThrow(expect.objectContaining({ code: "too_large" }));
  });

  test("node and depth limits protect the server: too many nodes fails, too deep is cut with a warning", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `n${i}` }));
    expect(() => readCtb(file(many), { maxNodes: 10 })).toThrow(expect.objectContaining({ code: "too_many_nodes" }));
    const chain = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `c${i}`, parent: i }));
    const r = readCtb(file(chain, "deep.ctb"), { maxDepth: 5 });
    expect(r.stats.maxDepth).toBe(5);
    expect(r.warnings.some((w) => w.code === "too_deep")).toBe(true);
  });

  test("a very long node text is truncated with a warning instead of exhausting memory", () => {
    const f = file([{ id: 1, name: "a", txt: richText(["ن".repeat(5000)]) }]);
    const r = readCtb(f, { maxTextChars: 1000 });
    expect(r.roots[0].text).toHaveLength(1000);
    expect(r.warnings.some((w) => w.code === "text_truncated")).toBe(true);
  });

  test("the notebook is opened read-only and never modified", () => {
    const f = file([{ id: 1, name: "a" }]);
    const before = fs.readFileSync(f);
    readCtb(f);
    expect(fs.readFileSync(f).equals(before)).toBe(true);
    expect(fs.readdirSync(dir).filter((x) => x.endsWith("-wal") || x.endsWith("-journal"))).toEqual([]);
  });
});

describe("hostile notebooks", () => {
  const raw = (name, sql) => {
    const { DatabaseSync } = require("node:sqlite");
    const f = path.join(dir, name);
    const d = new DatabaseSync(f);
    d.exec(sql);
    d.close();
    return f;
  };
  const CHILDREN = "CREATE TABLE children (node_id INTEGER UNIQUE,father_id INTEGER,sequence INTEGER,master_id INTEGER);";

  test("a generated column that would allocate gigabytes is rejected before any row is read", () => {
    const f = raw(
      "bomb.ctb",
      `CREATE TABLE node (node_id INTEGER UNIQUE, name TEXT, txt TEXT GENERATED ALWAYS AS (printf('%.*c', 20000000, 'x')) VIRTUAL);
       INSERT INTO node (node_id, name) VALUES (1, 'a'), (2, 'b'), (3, 'c'); ${CHILDREN}
       INSERT INTO children VALUES (1,0,1,0),(2,0,2,0),(3,0,3,0);`
    );
    const before = process.memoryUsage().rss;
    expect(() => readCtb(f)).toThrow(expect.objectContaining({ code: "bad_schema" }));
    expect(process.memoryUsage().rss - before).toBeLessThan(200 * 1024 * 1024);
  });

  test("a generated column hidden behind a comment (AS/**/(...)) is still rejected", () => {
    const f = raw(
      "gen2.ctb",
      `CREATE TABLE node (node_id INTEGER UNIQUE, name TEXT, txt TEXT AS/**/(printf('%.*c', 1000, 'x')));
       INSERT INTO node (node_id, name) VALUES (1, 'a'); ${CHILDREN} INSERT INTO children VALUES (1,0,1,0);`
    );
    expect(() => readCtb(f)).toThrow(expect.objectContaining({ code: "bad_schema" }));
  });

  test("an extra generated column (not one we read) is rejected too: only the table_xinfo check can see it", () => {
    const f = raw(
      "gen3.ctb",
      `CREATE TABLE node (node_id INTEGER UNIQUE, name TEXT, txt TEXT, bomb TEXT AS/**/(printf('%.*c', 1000, 'x')));
       INSERT INTO node (node_id, name, txt) VALUES (1, 'a', ''); ${CHILDREN} INSERT INTO children VALUES (1,0,1,0);`
    );
    expect(() => readCtb(f)).toThrow(expect.objectContaining({ code: "bad_schema" }));
  });

  test("control characters become spaces; invisible format characters (ZWNJ, RLM, soft hyphen) are removed without splitting words", () => {
    const f = file([{ id: 1, name: "a\u0001\u0002b" }, { id: 2, name: "ك\u200cتاب\u200f\u00adي", parent: 1 }]);
    const r = readCtb(f);
    expect(r.roots[0].title).toBe("a b");
    expect(r.roots[0].children[0].title).toBe("كتابي");
  });

  test("a BLOB in the text column is treated as empty, not as '255,255,...'", () => {
    const { DatabaseSync } = require("node:sqlite");
    const f = file([{ id: 1, name: "a" }]);
    const d = new DatabaseSync(f);
    d.prepare("UPDATE node SET txt = ? WHERE node_id = 1").run(new Uint8Array([255, 255, 255]));
    d.close();
    expect(readCtb(f).roots[0].text).toBe("");
  });

  test("a virtual table posing as node or children is rejected", () => {
    const f = raw("virt.ctb", `CREATE VIRTUAL TABLE node USING fts5(name, txt); ${CHILDREN}`);
    expect(() => readCtb(f)).toThrow(expect.objectContaining({ code: "bad_schema" }));
  });

  test("more children edges than the node limit is rejected (edges are bounded too)", () => {
    const f = raw(
      "edges.ctb",
      `CREATE TABLE node (node_id INTEGER UNIQUE,name TEXT,txt TEXT); INSERT INTO node VALUES (1,'a',''); ${CHILDREN}
       WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM c WHERE i < 200) INSERT INTO children SELECT i, 0, i, 0 FROM c;`
    );
    expect(() => readCtb(f, { maxNodes: 50 })).toThrow(expect.objectContaining({ code: "too_many_nodes" }));
  });

  test("a huge title is cut (it is copied into every descendant's path) and reported", () => {
    const f = file([{ id: 1, name: "ع".repeat(100000) }, { id: 2, name: "فرع", parent: 1 }]);
    const r = readCtb(f);
    expect(r.roots[0].title.length).toBeLessThanOrEqual(200);
    expect(r.warnings.some((w) => w.code === "title_truncated")).toBe(true);
  });

  test("a 8000-node chain is processed in linear time (no quadratic cycle cleanup)", () => {
    const chain = Array.from({ length: 8000 }, (_, i) => ({ id: i + 1, name: `c${i}`, parent: i }));
    const f = file(chain, "chain.ctb");
    const t = Date.now();
    const r = readCtb(f, { maxNodes: 20000 });
    expect(Date.now() - t).toBeLessThan(2000);
    expect(r.stats.maxDepth).toBe(32);
    expect(r.warnings.filter((w) => w.code === "unreachable")).toEqual([]); // cut by the depth limit, not a cycle
    expect(r.warnings.filter((w) => w.code === "too_deep")).toHaveLength(1);
  });

  test("a real cycle below a cut is still reported", () => {
    const f = file([{ id: 1, name: "a" }, { id: 2, name: "x", parent: 3 }, { id: 3, name: "y", parent: 2 }]);
    expect(readCtb(f).warnings.filter((w) => w.code === "unreachable").map((w) => w.nodeId).sort()).toEqual([2, 3]);
  });

  test("unclosed <rich_text> openers cannot make parsing quadratic", () => {
    const t = Date.now();
    parseRichText("<node>" + "<rich_text>x".repeat(40000) + "</node>");
    expect(Date.now() - t).toBeLessThan(500);
  });

  test("raw node text is cut before parsing, so a giant column cannot be expanded in memory", () => {
    const f = file([{ id: 1, name: "a", txt: richText(["ن".repeat(60000)]) }]);
    const r = readCtb(f, { maxTextChars: 1000 });
    expect(r.roots[0].text).toHaveLength(1000);
  });

  test("plain-text nodes that happen to start with '<' keep their text", () => {
    const { DatabaseSync } = require("node:sqlite");
    const f = file([{ id: 1, name: "a" }]);
    const d = new DatabaseSync(f);
    d.prepare("UPDATE node SET syntax = 'plain-text', txt = ? WHERE node_id = 1").run("<x> أقل من y");
    d.close();
    expect(readCtb(f).roots[0].text).toBe("<x> أقل من y");
  });

  test("tables and code boxes the importer cannot read are reported, not silently dropped", () => {
    const { DatabaseSync } = require("node:sqlite");
    const f = file([{ id: 1, name: "a" }]);
    const d = new DatabaseSync(f);
    d.exec("UPDATE node SET has_table = 1, has_codebox = 1 WHERE node_id = 1");
    d.close();
    expect(readCtb(f).warnings.map((w) => w.code)).toContain("dropped_objects");
  });

  test("reading a WAL-mode notebook leaves no -wal / -shm files next to it", () => {
    const { DatabaseSync } = require("node:sqlite");
    const f = file([{ id: 1, name: "a" }]);
    const d = new DatabaseSync(f);
    d.exec("PRAGMA journal_mode=WAL; UPDATE node SET name = 'b';");
    d.close();
    for (const x of fs.readdirSync(dir)) if (x.endsWith("-wal") || x.endsWith("-shm")) fs.rmSync(path.join(dir, x));
    readCtb(f);
    expect(fs.readdirSync(dir).filter((x) => x.endsWith("-wal") || x.endsWith("-shm"))).toEqual([]);
  });
});

describe("readCtbIsolated (worker thread)", () => {
  test("returns the same result as readCtb without blocking this thread", async () => {
    const f = file([{ id: 1, name: "جذر" }, { id: 2, name: "فرع", parent: 1 }]);
    const a = await readCtbIsolated(f);
    expect(a.roots[0].children[0].title).toBe("فرع");
    expect(a.stats).toEqual(readCtb(f).stats);
  });

  test("only notebook errors keep their code; anything else is just 'unreadable'", async () => {
    const corrupt = path.join(dir, "corrupt.ctb");
    fs.writeFileSync(corrupt, Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(4096, 7)]));
    await expect(readCtbIsolated(corrupt)).rejects.toMatchObject({ name: "CtbError", code: "unreadable" });
    await expect(readCtbIsolated(path.join(dir, "missing.ctb"))).rejects.toMatchObject({ code: "unreadable" });
  });

  test("at most two notebooks are read at the same time; the others wait their turn", async () => {
    const { activeReaders } = require("../../../utils/law/course/ctb");
    const f = file(Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, name: `n${i}`, parent: i > 0 ? 1 : 0 })));
    let peak = 0;
    const watch = setInterval(() => (peak = Math.max(peak, activeReaders())), 1);
    const results = await Promise.all(Array.from({ length: 6 }, () => readCtbIsolated(f)));
    clearInterval(watch);
    expect(results.every((r) => r.stats.nodes === 2000)).toBe(true);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(2);
    // slots are handed back when each thread has exited, a moment after its result: wait for that
    for (let i = 0; i < 100 && activeReaders() > 0; i++) await new Promise((r) => setTimeout(r, 10));
    expect(activeReaders()).toBe(0);
  });

  test("no more than two worker THREADS are alive at once, also when reads time out", async () => {
    const wt = require("worker_threads");
    const Real = wt.Worker;
    let live = 0;
    let peak = 0;
    wt.Worker = class extends Real {
      constructor(...a) {
        super(...a);
        peak = Math.max(peak, ++live);
        this.once("exit", () => live--);
      }
    };
    try {
      const f = file(Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, name: `n${i}`, parent: i > 0 ? 1 : 0 })), "threads.ctb");
      const slow = Array.from({ length: 4 }, () => readCtbIsolated(f, {}, { timeoutMs: 1 }).catch((e) => e.code));
      const fast = Array.from({ length: 4 }, () => readCtbIsolated(f));
      expect(await Promise.all(slow)).toEqual(["timeout", "timeout", "timeout", "timeout"]);
      await Promise.all(fast);
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      wt.Worker = Real;
    }
    expect(peak).toBeLessThanOrEqual(2);
    expect(live).toBe(0);
  });

  test("errors keep their code", async () => {
    const junk = path.join(dir, "j.ctb");
    fs.writeFileSync(junk, "nope nope nope nope nope");
    await expect(readCtbIsolated(junk)).rejects.toMatchObject({ name: "CtbError", code: "not_sqlite" });
  });

  test("a read that takes too long is killed with a timeout error", async () => {
    const chain = Array.from({ length: 3000 }, (_, i) => ({ id: i + 1, name: `c${i}`, parent: i }));
    await expect(readCtbIsolated(file(chain, "slow.ctb"), {}, { timeoutMs: 1 })).rejects.toMatchObject({ code: "timeout" });
  });
});
