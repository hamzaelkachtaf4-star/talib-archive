// Search index of a student's course topics (law_fts_course_topics). Same normalization as the statute corpus,
// so a student's "ابطال" finds "الإبطال". The index only yields ids: callers load rows through the scoped client.
const { ftsDb, registerFtsIndexer } = require("../fts");
const { rawDb } = require("../dbClient");
const { normalize, lightStem } = require("../arabic");

const MAX_TERMS = 8;
const phrase = (s) => `"${String(s).replace(/"/g, '""')}"`;

function insertSql() {
  return ftsDb().prepare(
    "INSERT INTO law_fts_course_topics (ref_id, course_id, user_id, text_original, text_normalized, text_stemmed) VALUES (?, ?, ?, ?, ?, ?)"
  );
}

function rowFor(topic) {
  const text = `${topic.title}\n${topic.text || ""}`;
  const norm = normalize(text);
  return [topic.id, topic.courseId, String(topic.userId), text, norm, lightStem(norm)];
}

const SLICE = 200;
const tick = () => new Promise((r) => setImmediate(r));

/**
 * Adds index rows for these topics. There is deliberately no per-row DELETE: ref_id is UNINDEXED in FTS5, so
 * every DELETE would scan the whole shared table (all students' rows). Topic ids are fresh UUIDs on import and a
 * rebuild drops the table first; searchIds de-duplicates in case a rebuild overlaps an import.
 * Written in small synchronous transactions with a yield between them, so a big notebook never holds the event
 * loop or the shared FTS connection for long. A failure part-way leaves some rows: the caller removes the
 * course's rows (removeCourseIndex). onProgress runs after each slice (the import uses it to show it is alive).
 */
async function indexTopics(topics, { onProgress = null } = {}) {
  const fts = ftsDb();
  const ins = insertSql();
  for (let i = 0; i < topics.length; i += SLICE) {
    fts.exec("BEGIN");
    try {
      for (const t of topics.slice(i, i + SLICE)) ins.run(...rowFor(t));
      fts.exec("COMMIT");
    } catch (e) {
      fts.exec("ROLLBACK");
      throw e;
    }
    if (onProgress) await onProgress(Math.min(i + SLICE, topics.length));
    if (i + SLICE < topics.length) await tick();
  }
}

function removeCourseIndex(courseId) {
  ftsDb().prepare("DELETE FROM law_fts_course_topics WHERE course_id = ?").run(courseId);
}

/** FTS5 expression for free text: normalized, stemmed, quoted terms (AND, then OR as a looser fallback). */
function matchExpressions(q) {
  const terms = [...new Set(lightStem(normalize(q)).split(" ").filter((t) => t.length >= 2))].slice(0, MAX_TERMS);
  if (!terms.length) return [];
  const quoted = terms.map(phrase);
  const exprs = [`text_stemmed : (${quoted.join(" AND ")})`];
  if (terms.length > 1) exprs.push(`text_stemmed : (${quoted.join(" OR ")})`);
  return exprs;
}

/**
 * Ranked topic ids of ONE student for a query, optionally within one course. The index is shared by all
 * students, so the owner is part of the query: another student's matches can never fill the result limit.
 * Never throws on odd input.
 */
function searchIds(q, { userId, courseId = null, limit = 100, excludeCourseIds = [] } = {}) {
  if (userId == null) throw new Error("searchIds needs the owner");
  const fts = ftsDb();
  // Courses still importing (or crashed) are excluded here, inside the query: filtering afterwards would let their
  // many rows fill the limit and push every visible result out.
  const notIn = excludeCourseIds.length ? ` AND course_id NOT IN (${excludeCourseIds.map(() => "?").join(", ")})` : "";
  for (const expr of matchExpressions(q)) {
    try {
      const rows = courseId
        ? fts
            .prepare(`SELECT ref_id FROM law_fts_course_topics WHERE law_fts_course_topics MATCH ? AND user_id = ? AND course_id = ?${notIn} ORDER BY rank LIMIT ?`)
            .all(expr, String(userId), courseId, ...excludeCourseIds, limit)
        : fts
            .prepare(`SELECT ref_id FROM law_fts_course_topics WHERE law_fts_course_topics MATCH ? AND user_id = ?${notIn} ORDER BY rank LIMIT ?`)
            .all(expr, String(userId), ...excludeCourseIds, limit);
      if (rows.length) return [...new Set(rows.map((r) => r.ref_id))];
    } catch {
      // a malformed expression is "no results", not a 500
    }
  }
  return [];
}

registerFtsIndexer("law_fts_course_topics", async () => {
  for (let cursor; ; ) {
    const batch = await rawDb().lawCourseTopic.findMany({
      take: 500,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!batch.length) break;
    await indexTopics(batch);
    cursor = batch[batch.length - 1].id;
  }
});

module.exports = { indexTopics, removeCourseIndex, searchIds, matchExpressions };
