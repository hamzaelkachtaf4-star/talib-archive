// Student-led courses: /api/law/courses/*. A course notebook (.ctb) is uploaded through the normal chunked upload
// pipeline (kind "other"); these routes then preview / import it. No AI is involved, so no AI quota applies,
// but imports are rate limited because they parse a user-supplied SQLite file and write thousands of rows.
const { reqBody } = require("../../utils/http");
const { auth, handle, badRequest } = require("./helpers");
const { db } = require("../../utils/law/dbClient");
const { assetAbsPath } = require("../../utils/law/assets");
const { hit } = require("../../utils/law/rateLimit");
const { LawCourse } = require("../../models/lawCourse");
const { LawGap } = require("../../models/lawGap");

const me = (res) => res.locals.lawUser.id;
const importsPerDay = () => Number(process.env.COURSE_IMPORTS_PER_DAY) || 20;
const analysesPerDay = () => Number(process.env.GAP_ANALYSES_PER_DAY) || 30;
const previewsPerDay = () => Number(process.env.COURSE_PREVIEWS_PER_DAY) || 60;

/** The student's own uploaded notebook file, or an error code. */
async function notebookFile(assetId) {
  const asset = typeof assetId === "string" && assetId ? await db().lawAsset.findUnique({ where: { id: assetId } }) : null;
  if (!asset) return { error: "not_found" };
  if (asset.kind !== "other") return { error: "not_a_notebook" };
  return { file: assetAbsPath(asset.storagePath), name: null };
}

function lawCourseEndpoints(router) {
  router.post(
    "/law/courses/preview",
    auth,
    handle("courses_preview", async (req, res) => {
      const f = await notebookFile(reqBody(req).assetId);
      if (f.error) return badRequest(res, f.error);
      if (!(await hit("course_preview", me(res), previewsPerDay()))) return res.status(429).json({ error: "rate_limited" });
      const r = await LawCourse.preview(f.file);
      if (r.error) return badRequest(res, r.error);
      res.json(r);
    })
  );

  router.post(
    "/law/courses/import",
    auth,
    handle("courses_import", async (req, res) => {
      const body = reqBody(req);
      const f = await notebookFile(body.assetId);
      if (f.error) return badRequest(res, f.error);
      if (body.rootNodeIds !== undefined && !(Array.isArray(body.rootNodeIds) && body.rootNodeIds.every(Number.isInteger)))
        return badRequest(res, "invalid_rootNodeIds");
      if (!(await hit("course_import", me(res), importsPerDay())))
        return res.status(429).json({ error: "rate_limited" });
      const r = await LawCourse.importCtb(f.file, {
        sourceName: typeof body.sourceName === "string" ? body.sourceName.slice(0, 200) : f.name,
        rootNodeIds: body.rootNodeIds,
        subjectId: typeof body.subjectId === "string" ? body.subjectId : null,
        replace: body.replace === true,
      });
      if (r.error === "import_failed") return res.status(500).json({ error: r.error, courses: r.courses || [] }); // courses already created stay listed
      if (r.error) return badRequest(res, r.error);
      res.status(201).json(r);
    })
  );

  router.get(
    "/law/courses",
    auth,
    handle("courses_list", async (_req, res) => {
      res.json({ courses: await LawCourse.list() });
    })
  );

  // Registered before /:id so "search" is not taken for a course id.
  router.get(
    "/law/courses/search",
    auth,
    handle("courses_search", async (req, res) => {
      const q = String(req.query.q || "").slice(0, 200);
      res.json({ results: await LawCourse.search(q, { courseId: req.query.courseId ? String(req.query.courseId) : null }) });
    })
  );

  router.get(
    "/law/courses/:id",
    auth,
    handle("courses_outline", async (req, res) => {
      const r = await LawCourse.outline(req.params.id);
      if (r.error) return badRequest(res, r.error);
      res.json(r);
    })
  );

  router.get(
    "/law/courses/:id/topics/:topicId",
    auth,
    handle("courses_topic", async (req, res) => {
      const r = await LawCourse.topic(req.params.id, req.params.topicId);
      if (r.error) return badRequest(res, r.error);
      res.json({ topic: r });
    })
  );

  // ---- gap radar (rule-based: no AI, so no AI quota; analysing is CPU work, so it is rate limited)
  router.post(
    "/law/courses/:id/gaps/analyze",
    auth,
    handle("gaps_analyze", async (req, res) => {
      const body = reqBody(req) || {};
      if (!(await LawGap.exists(req.params.id))) return badRequest(res, "not_found"); // cheap: no topics loaded
      if (body.codes !== undefined && !LawGap.validCodes(body.codes)) return badRequest(res, "invalid_codes"); // before the quota
      if (!(await hit("gap_analyze", me(res), analysesPerDay()))) return res.status(429).json({ error: "rate_limited" });
      const r = await LawGap.analyze(req.params.id, body.codes === undefined ? {} : { codes: body.codes });
      if (r.error) return badRequest(res, r.error);
      res.json(r);
    })
  );

  router.get(
    "/law/courses/:id/gaps",
    auth,
    handle("gaps_list", async (req, res) => {
      const r = await LawGap.list(req.params.id, { status: typeof req.query.status === "string" ? req.query.status : null });
      if (r.error) return badRequest(res, r.error);
      res.json(r);
    })
  );

  router.patch(
    "/law/courses/:id/gaps/:gapId",
    auth,
    handle("gaps_status", async (req, res) => {
      const r = await LawGap.setStatus(req.params.id, req.params.gapId, reqBody(req)?.status);
      if (r.error) return badRequest(res, r.error);
      res.json(r);
    })
  );

  router.get(
    "/law/courses/:id/readiness",
    auth,
    handle("gaps_readiness", async (req, res) => {
      const limit = Number.parseInt(req.query.limit, 10);
      const r = await LawGap.readiness(req.params.id, Number.isInteger(limit) && limit > 0 ? { limit } : {});
      if (r.error) return badRequest(res, r.error);
      res.json(r);
    })
  );

  router.delete(
    "/law/courses/:id",
    auth,
    handle("courses_delete", async (req, res) => {
      const r = await LawCourse.remove(req.params.id);
      if (r.error) return badRequest(res, r.error);
      res.json(r);
    })
  );
}

module.exports = { lawCourseEndpoints };
