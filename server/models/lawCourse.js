// A student's own course notebook as an outline of topics (spec: student-led courses). Imported from a
// CherryTree (.ctb) notebook: one LawStudentCourse per root node, one LawCourseTopic per node. Everything is
// owned by the importing student; the search index lives in law_fts_course_topics.
const crypto = require("crypto");
const { db, rawDb } = require("../utils/law/dbClient");
const { currentUserId } = require("../utils/law/tenant");
const { readCtbIsolated, CtbError } = require("../utils/law/course/ctb");
const { indexTopics, removeCourseIndex, searchIds } = require("../utils/law/course");

const INSERT_CHUNK = 500;
// Everything one import may store (notes + heading paths): refuses before writing, so a hostile or absurd
// notebook cannot fill the disk.
const MAX_STORED_CHARS = 24_000_000;
const STALE_IMPORT_MS = 15 * 60 * 1000;
const parse = (v, fallback) => {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};

const count = (n) => 1 + n.children.reduce((s, c) => s + count(c), 0);
const chars = (n) => n.text.length + n.children.reduce((s, c) => s + chars(c), 0);
const bold = (n) => n.emphasis.length + n.children.reduce((s, c) => s + bold(c), 0);
const depthOf = (n) => 1 + n.children.reduce((m, c) => Math.max(m, depthOf(c)), 0);

/** Same notes → same hash, whatever the node ids or file are. */
function hashOf(root) {
  const canon = (n) => [n.title, n.text, n.emphasis.map((s) => [s.start, s.end]), n.children.map(canon)];
  return crypto.createHash("sha256").update(JSON.stringify(canon(root))).digest("hex");
}

/**
 * What importing this tree would store (notes + heading paths, in characters), by arithmetic only: no path string
 * is built, so a hostile notebook is refused before it costs memory. Stops as soon as the total passes `limit`.
 * Heading path JSON length = 2 + sum(JSON length of each title) + one comma between titles.
 */
function storedSize(root, limit = Infinity) {
  let total = 0;
  const stack = [{ node: root, inner: JSON.stringify(root.title).length }];
  while (stack.length) {
    const { node, inner } = stack.pop();
    total += node.text.length + inner + 2;
    if (total > limit) return total;
    for (const c of node.children) stack.push({ node: c, inner: inner + 1 + JSON.stringify(c.title).length });
  }
  return total;
}

/** Preorder rows with ids, parents, sibling order, depth and heading path. */
function flatten(root, courseId, userId) {
  const rows = [];
  const walk = (node, parentId, ord, depth, path) => {
    const id = crypto.randomUUID();
    const headingPath = [...path, node.title];
    rows.push({
      id,
      courseId,
      userId,
      parentId,
      ord,
      depth,
      title: node.title,
      headingPath: JSON.stringify(headingPath),
      text: node.text,
      emphasis: JSON.stringify(node.emphasis),
      charCount: node.text.length,
    });
    node.children.forEach((c, i) => walk(c, id, i, depth + 1, headingPath));
  };
  walk(root, null, 0, 0, []);
  return rows;
}

async function readNotebook(file) {
  try {
    return { notebook: await readCtbIsolated(file) };
  } catch (e) {
    if (e instanceof CtbError) return { error: e.code };
    return { error: "unreadable" }; // SQLite refused the file (corrupt, encrypted, ...)
  }
}

const presentCourse = (c) => ({
  id: c.id,
  title: c.title,
  source: c.source,
  sourceName: c.sourceName,
  subjectId: c.subjectId,
  status: c.status,
  topicCount: c.topicCount,
  charCount: c.charCount,
  createdAt: c.createdAt,
});

/**
 * Copies the student's decisions (every gap that is not a plain OPEN suggestion: dismissed, confirmed, drilled, resolved,
 * covered) from a replaced course to its replacement, pointing each at the topic with the same heading path. Open
 * suggestions are recomputed by the next analysis, so they are not copied. Returns how many rows were carried.
 */
async function carryOverGaps(priorId, newCourseId, userId) {
  const rows = await rawDb().lawKnowledgeGap.findMany({ where: { courseId: priorId, status: { not: "OPEN" } } });
  if (!rows.length) return 0;
  const oldIds = [...new Set(rows.map((g) => g.topicId).filter(Boolean))];
  const oldPath = new Map((await rawDb().lawCourseTopic.findMany({ where: { id: { in: oldIds } }, select: { id: true, headingPath: true } })).map((t) => [t.id, t.headingPath]));
  const newByPath = new Map();
  for (const t of await rawDb().lawCourseTopic.findMany({ where: { courseId: newCourseId }, select: { id: true, headingPath: true } })) if (!newByPath.has(t.headingPath)) newByPath.set(t.headingPath, t.id);
  // One transaction: either every decision is copied or none is.
  await rawDb().$transaction(
    rows.map((g) =>
      rawDb().lawKnowledgeGap.create({
        data: {
          courseId: newCourseId,
          userId,
          kind: g.kind,
          canonicalId: g.canonicalId,
          sectionTitle: g.sectionTitle,
          partial: g.partial,
          areaTouched: g.areaTouched,
          topicId: (g.topicId && newByPath.get(oldPath.get(g.topicId))) || null,
          conceptId: g.conceptId,
          coverage: g.coverage,
          severity: g.severity,
          signals: g.signals,
          quote: g.quote,
          explanationAr: g.explanationAr,
          status: g.status,
          analysisVersion: g.analysisVersion,
        },
      })
    )
  );
  return rows.length;
}

async function deleteCourse(id) {
  await rawDb().lawStudentCourse.delete({ where: { id } }); // topics cascade; the index only goes once the rows are gone
  removeCourseIndex(id);
}

const LawCourse = {
  /** What a notebook contains, without storing anything. */
  preview: async function (file) {
    currentUserId();
    const r = await readNotebook(file);
    if (r.error) return { error: r.error };
    return {
      roots: r.notebook.roots.map((n) => ({ nodeId: n.nodeId, title: n.title, topics: count(n), chars: chars(n), boldRuns: bold(n), depth: depthOf(n) })),
      stats: r.notebook.stats,
      warnings: r.notebook.warnings,
    };
  },

  /**
   * `replace` creates a NEW course; the student's gap decisions of the replaced course are copied to it (carriedGaps).
   * @param {string} file path of the notebook (already stored by the upload pipeline)
   * @param {{sourceName?:string, rootNodeIds?:number[], subjectId?:string, replace?:boolean, limits?:{maxStoredChars?:number}}} opts
   * @returns {{courses: {id,title,topicCount,charCount,status:'created'|'unchanged'|'exists'|'replaced'|'importing'}[], warnings}|{error, courses?}}
   */
  importCtb: async function (file, { sourceName = null, rootNodeIds = null, subjectId = null, replace = false, limits = {} } = {}) {
    const userId = currentUserId();
    const r = await readNotebook(file);
    if (r.error) return { error: r.error };
    let roots = r.notebook.roots;
    if (Array.isArray(rootNodeIds)) roots = roots.filter((n) => rootNodeIds.includes(n.nodeId));
    if (!roots.length) return { error: "no_such_course" };
    if (subjectId) {
      if (roots.length !== 1) return { error: "subject_needs_single_course" };
      if (!(await db().lawSubject.findUnique({ where: { id: String(subjectId) } }))) return { error: "subject_not_found" };
    }

    // Size check before anything is written or built: pure arithmetic over the tree.
    const plans = roots.map((root) => ({ root, sourceHash: hashOf(root) }));
    let budget = limits.maxStoredChars ?? MAX_STORED_CHARS;
    for (const p of plans) {
      budget -= storedSize(p.root, budget);
      if (budget < 0) return { error: "too_large" };
    }

    // The student's earlier imports, taken once: each is matched to at most one root of this notebook, and a
    // course created below is never mistaken for an earlier one.
    const all = await rawDb().lawStudentCourse.findMany({ where: { userId, source: "ctb" }, orderBy: { createdAt: "asc" } });
    // An import that has been "importing" for a long time crashed: its rows are never trusted. A recent one belongs
    // to a request still running (e.g. a double click), which must be left alone.
    const staleBefore = Date.now() - STALE_IMPORT_MS;
    for (const stale of all.filter((c) => c.status === "IMPORTING" && c.updatedAt.getTime() < staleBefore)) await deleteCourse(stale.id);
    const priors = all.filter((c) => c.status !== "IMPORTING");
    const used = new Set();
    for (const p of plans) {
      const same = priors.find((c) => c.sourceHash === p.sourceHash && !used.has(c.id));
      if (same) {
        p.same = same;
        used.add(same.id);
      }
    }
    for (const p of plans) {
      if (p.same) continue;
      const prior = priors.find((c) => c.title === p.root.title && !used.has(c.id));
      if (prior) {
        p.prior = prior;
        used.add(prior.id);
      }
    }

    const courses = [];
    // Two identical roots resolve to the same course: list it once.
    const add = (entry) => {
      if (!courses.some((c) => c.id === entry.id)) courses.push(entry);
    };
    for (const p of plans) {
      if (p.same) {
        add({ ...presentCourse(p.same), status: "unchanged" });
        continue;
      }
      if (p.prior && !replace) {
        add({ ...presentCourse(p.prior), status: "exists" });
        continue;
      }
      let course = null;
      let carried = null;
      try {
        course = await rawDb().lawStudentCourse.create({
          data: {
            userId,
            subjectId: subjectId || p.prior?.subjectId || null,
            title: p.root.title,
            source: "ctb",
            sourceName,
            sourceHash: p.sourceHash,
            status: "IMPORTING",
            topicCount: count(p.root),
            charCount: chars(p.root),
          },
        });
        const rows = flatten(p.root, course.id, userId);
        // Any write to the course row refreshes updatedAt, which is what tells other requests it is still alive.
        const alive = () => rawDb().lawStudentCourse.update({ where: { id: course.id }, data: { status: "IMPORTING" } });
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          await rawDb().$transaction(rows.slice(i, i + INSERT_CHUNK).map((data) => rawDb().lawCourseTopic.create({ data })));
          await alive();
        }
        await indexTopics(rows, { onProgress: alive });
        // Copy the student's decisions while the new course is still invisible (IMPORTING), so nothing can analyse it
        // in between. If this fails the whole replacement is abandoned below and the old course, with its decisions, stays.
        if (p.prior) carried = await carryOverGaps(p.prior.id, course.id, userId);
        course = await rawDb().lawStudentCourse.update({ where: { id: course.id }, data: { status: "READY" } });
      } catch (e) {
        if (course) await deleteCourse(course.id).catch(() => removeCourseIndex(course.id));
        if (e.code === "P2002") {
          // the same notes were imported by a concurrent request: that one wins
          const winner = await rawDb().lawStudentCourse.findFirst({ where: { userId, sourceHash: p.sourceHash } });
          if (winner) {
            add({ ...presentCourse(winner), status: winner.status === "READY" ? "unchanged" : "importing" });
            continue;
          }
        }
        console.error("[course] import failed:", e.message);
        return { error: "import_failed", courses };
      }
      if (p.prior) {
        try {
          await deleteCourse(p.prior.id); // replaced: the new course is complete, drop the old one
        } catch (e) {
          console.error("[course] could not remove the replaced course:", e.message);
        }
      }
      add({ ...presentCourse(course), status: p.prior ? "replaced" : "created", ...(p.prior ? { carriedGaps: carried ?? 0 } : {}) });
    }
    return { courses, warnings: r.notebook.warnings };
  },

  list: async function () {
    const rows = await db().lawStudentCourse.findMany({ where: { status: { not: "IMPORTING" } }, orderBy: { createdAt: "desc" } });
    return rows.map(presentCourse);
  },

  /** The course and its topics in document order, without the notes themselves. */
  outline: async function (courseId) {
    const course = await db().lawStudentCourse.findFirst({ where: { id: String(courseId), status: { not: "IMPORTING" } } });
    if (!course) return { error: "not_found" };
    const rows = await db().lawCourseTopic.findMany({
      where: { courseId: course.id },
      select: { id: true, parentId: true, ord: true, depth: true, title: true, headingPath: true, charCount: true, emphasis: true },
    });
    const byParent = new Map();
    for (const t of rows) {
      const k = t.parentId ?? "";
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(t);
    }
    const ordered = [];
    const walk = (parent) => {
      for (const t of (byParent.get(parent) || []).sort((a, b) => a.ord - b.ord)) {
        const { emphasis, ...rest } = t;
        ordered.push({ ...rest, headingPath: parse(t.headingPath, []), hasEmphasis: parse(emphasis, []).length > 0 });
        walk(t.id);
      }
    };
    walk("");
    return { course: presentCourse(course), topics: ordered };
  },

  topic: async function (courseId, topicId) {
    const t = await db().lawCourseTopic.findFirst({ where: { id: String(topicId), courseId: String(courseId), course: { status: { not: "IMPORTING" } } } });
    if (!t) return { error: "not_found" };
    return { ...t, headingPath: parse(t.headingPath, []), emphasis: parse(t.emphasis, []) };
  },

  search: async function (q, { courseId = null, limit = 30 } = {}) {
    const userId = currentUserId();
    const importing = (await rawDb().lawStudentCourse.findMany({ where: { userId, status: "IMPORTING" }, select: { id: true } })).map((c) => c.id);
    const ids = searchIds(String(q ?? ""), { userId, courseId: courseId ? String(courseId) : null, excludeCourseIds: importing });
    if (!ids.length) return [];
    const rows = await db().lawCourseTopic.findMany({ where: { id: { in: ids }, course: { status: { not: "IMPORTING" } } } }); // tenant-scoped; half-imported courses stay hidden
    const byId = new Map(rows.map((t) => [t.id, t]));
    return ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .slice(0, limit)
      .map((t) => ({
        id: t.id,
        courseId: t.courseId,
        title: t.title,
        depth: t.depth,
        headingPath: parse(t.headingPath, []),
        snippet: Array.from(t.text.slice(0, 400)).slice(0, 160).join(""), // whole characters only
        charCount: t.charCount,
      }));
  },

  remove: async function (courseId) {
    const course = await db().lawStudentCourse.findFirst({ where: { id: String(courseId) } });
    if (!course) return { error: "not_found" };
    await deleteCourse(course.id);
    return { ok: true };
  },
};

module.exports = { LawCourse, storedSize };
