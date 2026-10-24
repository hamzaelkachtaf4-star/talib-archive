// Student-led courses: a CherryTree notebook becomes one course per root with its topic outline, indexed in
// law_fts_course_topics, owned by the importing student only.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { makeCtb, richText } = require("../../utils/law/testing/makeCtb");
const { db, rawDb } = require("../../utils/law/dbClient");
const { asUser, LawTenantError } = require("../../utils/law/tenant");
const { ftsDb, closeFts, rebuildFts } = require("../../utils/law/fts");
const { LawCourse } = require("../../models/lawCourse");
const { LawSubject } = require("../../models/lawSubject");

jest.setTimeout(60000);

let tmp;
let dir;
let ownerId;
let otherId;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-course-"));
  process.env.STORAGE_DIR = dir;
  tmp = await createTempDb();
  ownerId = tmp.ownerId;
  otherId = (await tmp.client.users.create({ data: { username: "other-student", password: "!", role: "default" } })).id;
});
afterEach(async () => {
  closeFts();
  await tmp.cleanup();
  fs.rmSync(dir, { recursive: true, force: true });
});

const notebook = (extra = {}) =>
  makeCtb(path.join(dir, "n.ctb"), [
    { id: 1, name: "القانون التجاري", seq: 1, txt: richText(["مدخل"]) },
    { id: 2, name: "الأهلية التجارية", parent: 1, seq: 1, txt: richText(["الأهلية هي ", { b: "سن الرشد" }, " وعدم الحجر."]) },
    { id: 3, name: "الإبطال والبطلان", parent: 2, seq: 1, txt: richText(["يختلف الإبطال عن البطلان المطلق."]) },
    { id: 4, name: "السجل التجاري", parent: 1, seq: 2, txt: richText(["التقييد في السجل التجاري إلزامي."]) },
    { id: 5, name: "القانون الجنائي", seq: 2, txt: richText(["الجريمة والعقوبة."]) },
    ...(extra.nodes || []),
  ]);
const asOwner = (fn) => asUser(ownerId, fn);
const asOther = (fn) => asUser(otherId, fn);

describe("importCtb", () => {
  test("one course per root, with the outline rebuilt from the edges", async () => {
    const r = await asOwner(() => LawCourse.importCtb(notebook(), { sourceName: "finaaal.ctb" }));
    expect(r.error).toBeFalsy();
    expect(r.courses.map((c) => [c.title, c.topicCount, c.status])).toEqual([
      ["القانون التجاري", 4, "created"],
      ["القانون الجنائي", 1, "created"],
    ]);
    const outline = await asOwner(() => LawCourse.outline(r.courses[0].id));
    expect(outline.course).toMatchObject({ title: "القانون التجاري", source: "ctb", sourceName: "finaaal.ctb" });
    expect(outline.topics.map((t) => [t.title, t.depth, t.parentId === null ? null : "has-parent"])).toEqual([
      ["القانون التجاري", 0, null],
      ["الأهلية التجارية", 1, "has-parent"],
      ["الإبطال والبطلان", 2, "has-parent"],
      ["السجل التجاري", 1, "has-parent"],
    ]); // document order
    const t = outline.topics[2];
    expect(t.headingPath).toEqual(["القانون التجاري", "الأهلية التجارية", "الإبطال والبطلان"]);
    expect(t.parentId).toBe(outline.topics[1].id);
    expect(outline.topics.map((x) => x.ord)).toEqual([0, 0, 0, 1]); // position among siblings
    const topic = await asOwner(() => LawCourse.topic(r.courses[0].id, outline.topics[1].id));
    expect(topic.text).toBe("الأهلية هي سن الرشد وعدم الحجر.");
    expect(topic.emphasis).toEqual([{ start: 11, end: 19 }]);
  });

  test("re-importing identical notes changes nothing; edited notes need replace", async () => {
    const f = notebook();
    const first = await asOwner(() => LawCourse.importCtb(f));
    const again = await asOwner(() => LawCourse.importCtb(f));
    expect(again.courses.map((c) => c.status)).toEqual(["unchanged", "unchanged"]);
    expect(again.courses.map((c) => c.id)).toEqual(first.courses.map((c) => c.id));
    expect(await rawDb().lawCourseTopic.count()).toBe(5);

    const edited = notebook({}); // same file path, now edit a node of root 1
    const { DatabaseSync } = require("node:sqlite");
    const raw = new DatabaseSync(edited);
    raw.prepare("UPDATE node SET txt = ? WHERE node_id = 4").run(richText(["نص معدل."]));
    raw.close();
    const conflict = await asOwner(() => LawCourse.importCtb(edited));
    expect(conflict.courses.map((c) => c.status)).toEqual(["exists", "unchanged"]);
    expect(conflict.courses[0].id).toBe(first.courses[0].id);
    expect(await asOwner(() => LawCourse.search("معدل"))).toEqual([]); // nothing replaced yet

    const replaced = await asOwner(() => LawCourse.importCtb(edited, { replace: true }));
    expect(replaced.courses.map((c) => c.status)).toEqual(["replaced", "unchanged"]);
    expect(replaced.courses[0].id).not.toBe(first.courses[0].id);
    expect(await rawDb().lawCourseTopic.count()).toBe(5);
    expect(await rawDb().lawStudentCourse.count()).toBe(2);
    expect((await asOwner(() => LawCourse.search("معدل"))).length).toBe(1);
    expect(await asOwner(() => LawCourse.search("التقييد"))).toEqual([]); // the old text left the index
  });

  test("rootNodeIds imports only the chosen courses", async () => {
    const r = await asOwner(() => LawCourse.importCtb(notebook(), { rootNodeIds: [5] }));
    expect(r.courses.map((c) => c.title)).toEqual(["القانون الجنائي"]);
  });

  test("subjectId must be the student's own subject, and only for a single course", async () => {
    const mine = await asOwner(() => LawSubject.create({ name: "قانون تجاري" }));
    const theirs = await asOther(() => LawSubject.create({ name: "خاص بالآخر" }));
    const mineId = (mine.subject || mine).id;
    const theirsId = (theirs.subject || theirs).id;
    expect((await asOwner(() => LawCourse.importCtb(notebook(), { rootNodeIds: [1], subjectId: theirsId }))).error).toBe("subject_not_found");
    expect((await asOwner(() => LawCourse.importCtb(notebook(), { subjectId: mineId }))).error).toBe("subject_needs_single_course");
    const ok = await asOwner(() => LawCourse.importCtb(notebook(), { rootNodeIds: [1], subjectId: mineId }));
    expect((await asOwner(() => LawCourse.outline(ok.courses[0].id))).course.subjectId).toBe(mineId);
  });

  test("unreadable notebooks come back as an error code, nothing is stored", async () => {
    const junk = path.join(dir, "junk.ctb");
    fs.writeFileSync(junk, "definitely not sqlite");
    expect((await asOwner(() => LawCourse.importCtb(junk))).error).toBe("not_sqlite");
    expect(await rawDb().lawStudentCourse.count()).toBe(0);
  });

  test("preview lists the courses with sizes and writes nothing", async () => {
    const p = await asOwner(() => LawCourse.preview(notebook()));
    expect(p.roots.map((r) => [r.nodeId, r.title, r.topics])).toEqual([[1, "القانون التجاري", 4], [5, "القانون الجنائي", 1]]);
    expect(await rawDb().lawStudentCourse.count()).toBe(0);
  });
});

describe("search and isolation", () => {
  test("Arabic variants match (hamza, ta marbuta, definite article) and results carry their heading path", async () => {
    const r = await asOwner(() => LawCourse.importCtb(notebook()));
    const hits = await asOwner(() => LawCourse.search("ابطال"));
    expect(hits.map((h) => h.title)).toContain("الإبطال والبطلان");
    expect(hits[0].headingPath).toEqual(["القانون التجاري", "الأهلية التجارية", "الإبطال والبطلان"]);
    expect(hits[0].courseId).toBe(r.courses[0].id);
    const scoped = await asOwner(() => LawCourse.search("الجريمة", { courseId: r.courses[0].id }));
    expect(scoped).toEqual([]); // that word lives in the other course
    expect((await asOwner(() => LawCourse.search("الجريمة"))).map((h) => h.title)).toEqual(["القانون الجنائي"]);
  });

  test("a query made only of FTS syntax characters is harmless", async () => {
    await asOwner(() => LawCourse.importCtb(notebook()));
    for (const q of ['"', "AND OR NOT", "(((", "*", "title:", "", "   "]) expect(await asOwner(() => LawCourse.search(q))).toEqual([]);
  });

  test("another student sees none of it: list, outline, topic, search, delete", async () => {
    const r = await asOwner(() => LawCourse.importCtb(notebook()));
    const id = r.courses[0].id;
    expect(await asOther(() => LawCourse.list())).toEqual([]);
    expect(await asOther(() => LawCourse.outline(id))).toEqual({ error: "not_found" });
    const topicId = (await asOwner(() => LawCourse.outline(id))).topics[1].id;
    expect(await asOther(() => LawCourse.topic(id, topicId))).toEqual({ error: "not_found" });
    expect(await asOther(() => LawCourse.search("الأهلية"))).toEqual([]);
    expect(await asOther(() => LawCourse.remove(id))).toEqual({ error: "not_found" });
    expect(await rawDb().lawStudentCourse.count()).toBe(2);
    // and the same notebook imported by the other student is their own copy, not a clash
    const mine = await asOther(() => LawCourse.importCtb(notebook()));
    expect(mine.courses.map((c) => c.status)).toEqual(["created", "created"]);
    expect((await asOther(() => LawCourse.search("الأهلية"))).length).toBe(1);
  });

  test("outside a user context the model refuses to run", async () => {
    await expect(LawCourse.list()).resolves.toBeDefined(); // test fallback user is the owner here
    const { setTestFallbackUser } = require("../../utils/law/tenant");
    setTestFallbackUser(null);
    await expect(LawCourse.list()).rejects.toBeInstanceOf(LawTenantError);
    setTestFallbackUser(ownerId);
  });
});

describe("lifecycle", () => {
  test("deleting a course removes its topics and its index rows", async () => {
    const r = await asOwner(() => LawCourse.importCtb(notebook()));
    expect(ftsDb().prepare("SELECT COUNT(*) AS n FROM law_fts_course_topics").get().n).toBe(5);
    expect(await asOwner(() => LawCourse.remove(r.courses[0].id))).toEqual({ ok: true });
    expect(await rawDb().lawCourseTopic.count()).toBe(1);
    expect(ftsDb().prepare("SELECT COUNT(*) AS n FROM law_fts_course_topics").get().n).toBe(1);
  });

  test("the search index can be rebuilt from the database", async () => {
    await asOwner(() => LawCourse.importCtb(notebook()));
    ftsDb().exec("DELETE FROM law_fts_course_topics");
    expect(await asOwner(() => LawCourse.search("الأهلية"))).toEqual([]);
    await rebuildFts();
    expect((await asOwner(() => LawCourse.search("الأهلية"))).length).toBe(1);
  });

  test("a failure half way leaves no course behind", async () => {
    const orig = rawDb().lawCourseTopic.create;
    let n = 0;
    const spy = jest.spyOn(rawDb().lawCourseTopic, "create").mockImplementation((...a) => {
      if (++n === 3) throw new Error("disk full");
      return orig.apply(rawDb().lawCourseTopic, a);
    });
    const r = await asOwner(() => LawCourse.importCtb(notebook()));
    spy.mockRestore();
    expect(r.error).toBe("import_failed");
    expect(await rawDb().lawStudentCourse.count()).toBe(0);
    expect(await rawDb().lawCourseTopic.count()).toBe(0);
    expect(ftsDb().prepare("SELECT COUNT(*) AS n FROM law_fts_course_topics").get().n).toBe(0);
  });
});

describe("hardening", () => {
  const sqlite = () => require("node:sqlite").DatabaseSync;
  const edit = (f, sql, ...args) => {
    const d = new (sqlite())(f);
    d.prepare(sql).run(...args);
    d.close();
  };

  test("roots with the same title stay separate courses: nothing is dropped, replace never deletes a sibling", async () => {
    const f = makeCtb(path.join(dir, "dup.ctb"), [
      { id: 1, name: "X", seq: 1, txt: richText(["الأول"]) },
      { id: 2, name: "X", seq: 2, txt: richText(["الثاني"]) },
      { id: 3, name: "   ", seq: 3, txt: richText(["ثالث"]) },
      { id: 4, name: "   ", seq: 4, txt: richText(["رابع"]) },
    ]);
    const first = await asOwner(() => LawCourse.importCtb(f));
    expect(first.courses.map((c) => c.status)).toEqual(["created", "created", "created", "created"]);
    expect(await rawDb().lawStudentCourse.count()).toBe(4);
    expect((await asOwner(() => LawCourse.importCtb(f))).courses.map((c) => c.status)).toEqual(["unchanged", "unchanged", "unchanged", "unchanged"]);

    edit(f, "UPDATE node SET txt = ? WHERE node_id = 1", richText(["الأول معدل"]));
    edit(f, "UPDATE node SET txt = ? WHERE node_id = 2", richText(["الثاني معدل"]));
    const replaced = await asOwner(() => LawCourse.importCtb(f, { replace: true }));
    expect(replaced.courses.map((c) => c.status)).toEqual(["replaced", "replaced", "unchanged", "unchanged"]);
    expect(await rawDb().lawStudentCourse.count()).toBe(4);
    expect(new Set(replaced.courses.map((c) => c.id)).size).toBe(4);
    expect((await asOwner(() => LawCourse.search("معدل"))).length).toBe(2);
  });

  test("another student's many matches cannot push a student's own result out of search", async () => {
    const nodes = Array.from({ length: 150 }, (_, i) => ({ id: i + 2, name: `الأهلية ${i}`, parent: 1, txt: richText(["الأهلية التجارية"]) }));
    const big = makeCtb(path.join(dir, "big.ctb"), [{ id: 1, name: "مادة الآخر" }, ...nodes]);
    await asOther(() => LawCourse.importCtb(big));
    await asOwner(() => LawCourse.importCtb(notebook()));
    const mine = await asOwner(() => LawCourse.search("الأهلية"));
    expect(mine.map((h) => h.title)).toContain("الأهلية التجارية");
    expect(mine.every((h) => h.courseId)).toBe(true);
    expect((await asOther(() => LawCourse.search("الأهلية"))).length).toBeGreaterThan(20);
  });

  test("a failure in a later insert chunk leaves nothing behind (course, topics, index)", async () => {
    const nodes = Array.from({ length: 700 }, (_, i) => ({ id: i + 2, name: `فرع ${i}`, parent: 1, txt: richText(["نص"]) }));
    const f = makeCtb(path.join(dir, "chunks.ctb"), [{ id: 1, name: "كبير" }, ...nodes]);
    const orig = rawDb().$transaction.bind(rawDb());
    let calls = 0;
    const spy = jest.spyOn(rawDb(), "$transaction").mockImplementation((...a) => {
      if (++calls === 2) return Promise.reject(new Error("disk full"));
      return orig(...a);
    });
    const r = await asOwner(() => LawCourse.importCtb(f));
    spy.mockRestore();
    expect(calls).toBe(2); // chunk 1 was committed, chunk 2 failed
    expect(r.error).toBe("import_failed");
    expect(await rawDb().lawStudentCourse.count()).toBe(0);
    expect(await rawDb().lawCourseTopic.count()).toBe(0);
    expect(ftsDb().prepare("SELECT COUNT(*) AS n FROM law_fts_course_topics").get().n).toBe(0);
  });

  test("when a later course fails, the response still lists the courses already created", async () => {
    const orig = rawDb().lawCourseTopic.create;
    let n = 0;
    const spy = jest.spyOn(rawDb().lawCourseTopic, "create").mockImplementation((...a) => {
      if (++n === 5) throw new Error("boom"); // inside the second course (the first has 4 topics)
      return orig.apply(rawDb().lawCourseTopic, a);
    });
    const r = await asOwner(() => LawCourse.importCtb(notebook()));
    spy.mockRestore();
    expect(r.error).toBe("import_failed");
    expect(r.courses.map((c) => [c.title, c.status])).toEqual([["القانون التجاري", "created"]]);
    expect(await rawDb().lawStudentCourse.count()).toBe(1);
  });

  test("a course left half-imported by a crash is not trusted: re-importing rebuilds it", async () => {
    const f = notebook();
    const ok = await asOwner(() => LawCourse.importCtb(f, { rootNodeIds: [1] }));
    const id = ok.courses[0].id;
    await rawDb().lawStudentCourse.update({ where: { id }, data: { status: "IMPORTING", updatedAt: new Date(Date.now() - 3600 * 1000) } }); // crashed an hour ago
    await rawDb().lawCourseTopic.deleteMany({ where: { courseId: id, depth: 2 } });
    expect((await asOwner(() => LawCourse.list())).map((c) => c.id)).not.toContain(id); // not shown while importing
    const again = await asOwner(() => LawCourse.importCtb(f, { rootNodeIds: [1] }));
    expect(again.courses[0].status).toBe("created");
    expect(again.courses[0].id).not.toBe(id);
    expect((await asOwner(() => LawCourse.outline(again.courses[0].id))).topics).toHaveLength(4);
    expect(await rawDb().lawStudentCourse.count()).toBe(1);
  });

  test("an import that is still running (recent IMPORTING) is not deleted by another request", async () => {
    const f = notebook();
    const ok = await asOwner(() => LawCourse.importCtb(f, { rootNodeIds: [1] }));
    await rawDb().lawStudentCourse.update({ where: { id: ok.courses[0].id }, data: { status: "IMPORTING" } });
    const again = await asOwner(() => LawCourse.importCtb(f, { rootNodeIds: [1] }));
    expect(again.error).toBeUndefined();
    expect(await rawDb().lawStudentCourse.findUnique({ where: { id: ok.courses[0].id } })).toBeTruthy();
    expect(again.courses[0].status).toBe("importing");
  });

  test("two identical imports at once both succeed (one creates, one sees it unchanged)", async () => {
    const f = notebook();
    const [a, b] = await Promise.all([asOwner(() => LawCourse.importCtb(f, { rootNodeIds: [1] })), asOwner(() => LawCourse.importCtb(f, { rootNodeIds: [1] }))]);
    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();
    expect(await rawDb().lawStudentCourse.count()).toBe(1);
  });

  test("an import that would store too much is refused before anything is written", async () => {
    const r = await asOwner(() => LawCourse.importCtb(notebook(), { limits: { maxStoredChars: 50 } }));
    expect(r.error).toBe("too_large");
    expect(await rawDb().lawStudentCourse.count()).toBe(0);
  });

  test("the search snippet never cuts a character in half", async () => {
    const f = makeCtb(path.join(dir, "emoji.ctb"), [{ id: 1, name: "عنوان", txt: richText(["😀".repeat(200)]) }]);
    const r = await asOwner(() => LawCourse.importCtb(f));
    const hit = (await asOwner(() => LawCourse.search("عنوان")))[0];
    expect(hit).toBeTruthy();
    expect(Buffer.from(hit.snippet, "utf8").toString("utf8")).toBe(hit.snippet);
    expect(hit.snippet).not.toMatch(/[\ud800-\udbff]$/);
    expect(r.error).toBeUndefined();
  });
});

describe("cost does not depend on other students' data", () => {
  test("indexing 2 000 topics stays fast when the shared index already holds 20 000 rows", async () => {
    const fts = ftsDb();
    const ins = fts.prepare("INSERT INTO law_fts_course_topics (ref_id, course_id, user_id, text_original, text_normalized, text_stemmed) VALUES (?, ?, ?, ?, ?, ?)");
    fts.exec("BEGIN");
    for (let i = 0; i < 20000; i++) ins.run(`x${i}`, "other-course", "999", "نص", "نص", "نص");
    fts.exec("COMMIT");
    const nodes = Array.from({ length: 2000 }, (_, i) => ({ id: i + 2, name: `فرع ${i}`, parent: 1, txt: richText(["نص عن الأهلية"]) }));
    const f = makeCtb(path.join(dir, "many.ctb"), [{ id: 1, name: "كبير" }, ...nodes]);
    const t = Date.now();
    const r = await asOwner(() => LawCourse.importCtb(f));
    expect(r.error).toBeUndefined();
    expect(Date.now() - t).toBeLessThan(8000); // with a per-row DELETE over the unindexed table this took minutes
  });

  test("importing never runs a per-row DELETE against the shared index (it would scan every student's rows)", async () => {
    const fts = ftsDb();
    const seen = [];
    const orig = fts.prepare.bind(fts);
    fts.prepare = (sql) => (seen.push(sql), orig(sql));
    try {
      await asOwner(() => LawCourse.importCtb(notebook()));
    } finally {
      fts.prepare = orig;
    }
    expect(seen.some((q) => /INSERT INTO law_fts_course_topics/.test(q))).toBe(true);
    expect(seen.filter((q) => /DELETE\s+FROM\s+law_fts_course_topics\s+WHERE\s+ref_id/i.test(q))).toEqual([]);
  });

  test("indexing never blocks the event loop for long, even for a large notebook", async () => {
    const nodes = Array.from({ length: 3000 }, (_, i) => ({ id: i + 2, name: `فرع ${i}`, parent: 1, txt: richText(["نص عن الأهلية التجارية والسجل"]) }));
    const f = makeCtb(path.join(dir, "loop.ctb"), [{ id: 1, name: "كبير" }, ...nodes]);
    let worst = 0;
    let last = Date.now();
    const beat = setInterval(() => {
      worst = Math.max(worst, Date.now() - last);
      last = Date.now();
    }, 5);
    await asOwner(() => LawCourse.importCtb(f));
    clearInterval(beat);
    expect(worst).toBeLessThan(700);
  });

  test("a rebuild that overlaps an import cannot make a topic appear twice in search", async () => {
    await asOwner(() => LawCourse.importCtb(notebook()));
    const topic = await rawDb().lawCourseTopic.findFirst({ where: { title: "الأهلية التجارية" } });
    const { indexTopics } = require("../../utils/law/course");
    await indexTopics([topic]); // the same row indexed a second time
    const hits = await asOwner(() => LawCourse.search("الأهلية"));
    expect(hits.map((h) => h.id).filter((id) => id === topic.id)).toHaveLength(1);
  });

  test("the size budget is checked by arithmetic before any heading path is built", async () => {
    const { storedSize } = require("../../models/lawCourse");
    const tree = { title: "ا".repeat(10), text: "abc", emphasis: [], children: [{ title: "ب", text: "xy", emphasis: [], children: [] }] };
    // actual rows: root path ["اااااااااا"], child path ["اااااااااا","ب"]
    const actual = ["اااااااااا"], child = ["اااااااااا", "ب"];
    expect(storedSize(tree, Infinity)).toBe(3 + JSON.stringify(actual).length + 2 + JSON.stringify(child).length);
    expect(storedSize(tree, 5)).toBeGreaterThan(5); // stops early once over the limit
  });

  test("a notebook whose heading paths would be enormous is refused without building them", async () => {
    const chain = Array.from({ length: 31 }, (_, i) => ({ id: i + 1, name: "ع".repeat(200), parent: i }));
    const leaves = Array.from({ length: 3000 }, (_, i) => ({ id: 100 + i, name: "ورقة" + i, parent: 31 }));
    const f = makeCtb(path.join(dir, "amp.ctb"), [...chain, ...leaves]);
    const strings = [];
    const orig = JSON.stringify;
    const spy = jest.spyOn(JSON, "stringify").mockImplementation((...a) => (Array.isArray(a[0]) && a[0].length >= 20 && a[0].every((x) => typeof x === "string") && strings.push(a[0].length), orig(...a)));
    let r;
    try {
      r = await asOwner(() => LawCourse.importCtb(f, { limits: { maxStoredChars: 1_000_000 } }));
    } finally {
      spy.mockRestore();
    }
    expect(r.error).toBe("too_large");
    expect(strings).toEqual([]); // no 20+-element heading path array was serialised: the check is arithmetic
    expect(await rawDb().lawStudentCourse.count()).toBe(0);
  });
});

describe("half-imported courses stay invisible", () => {
  test("search and topic ignore a course that is still importing (or crashed)", async () => {
    const r = await asOwner(() => LawCourse.importCtb(notebook(), { rootNodeIds: [1] }));
    const id = r.courses[0].id;
    const topicId = (await asOwner(() => LawCourse.outline(id))).topics[1].id;
    await rawDb().lawStudentCourse.update({ where: { id }, data: { status: "IMPORTING" } });
    expect(await asOwner(() => LawCourse.search("الأهلية"))).toEqual([]);
    expect(await asOwner(() => LawCourse.topic(id, topicId))).toEqual({ error: "not_found" });
    expect(await asOwner(() => LawCourse.outline(id))).toEqual({ error: "not_found" });
  });

  test("another course's many hits while it is importing cannot push a ready course's hit out of search", async () => {
    const ready = await asOwner(() => LawCourse.importCtb(notebook(), { rootNodeIds: [1] }));
    const nodes = Array.from({ length: 150 }, (_, i) => ({ id: i + 2, name: `الأهلية ${i}`, parent: 1, txt: richText(["الأهلية التجارية"]) }));
    const big = makeCtb(path.join(dir, "bigimp.ctb"), [{ id: 1, name: "ضخم" }, ...nodes]);
    const b = await asOwner(() => LawCourse.importCtb(big));
    await rawDb().lawStudentCourse.update({ where: { id: b.courses[0].id }, data: { status: "IMPORTING" } });
    const hits = await asOwner(() => LawCourse.search("الأهلية"));
    expect(hits.map((h) => h.courseId)).toEqual([ready.courses[0].id]);
  });

  test("an import keeps its course row fresh while it runs (so it is never mistaken for a crash)", async () => {
    const nodes = Array.from({ length: 1200 }, (_, i) => ({ id: i + 2, name: `فرع ${i}`, parent: 1, txt: richText(["نص"]) }));
    const f = makeCtb(path.join(dir, "alive.ctb"), [{ id: 1, name: "حي" }, ...nodes]);
    const orig = rawDb().lawStudentCourse.update;
    const touches = [];
    const spy = jest.spyOn(rawDb().lawStudentCourse, "update").mockImplementation((a) => (touches.push(a.data.status), orig.call(rawDb().lawStudentCourse, a)));
    try {
      await asOwner(() => LawCourse.importCtb(f));
    } finally {
      spy.mockRestore();
    }
    // 1 201 topics = 3 insert chunks and 7 index slices, each followed by a touch, then READY
    expect(touches.filter((x) => x === "IMPORTING").length).toBeGreaterThanOrEqual(10);
    expect(touches[touches.length - 1]).toBe("READY");
  });

  test("two identical roots in one notebook list the course once", async () => {
    const f = makeCtb(path.join(dir, "twins.ctb"), [{ id: 1, name: "Z", seq: 1, txt: richText(["نفس"]) }, { id: 2, name: "Z", seq: 2, txt: richText(["نفس"]) }]);
    const r = await asOwner(() => LawCourse.importCtb(f));
    expect(r.courses).toHaveLength(1);
    expect(new Set(r.courses.map((c) => c.id)).size).toBe(r.courses.length);
  });
});
