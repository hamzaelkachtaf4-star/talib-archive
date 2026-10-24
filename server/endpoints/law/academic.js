const { reqBody } = require("../../utils/http");
const { auth, handle, badRequest } = require("./helpers");
const { isAdmin } = require("../../utils/law/tenant");
const { LawSubject } = require("../../models/lawSubject");
const { LawTimetable } = require("../../models/lawTimetable");
const { LawSession } = require("../../models/lawSession");
const { LawFlashcard } = require("../../models/lawFlashcard");
const { LawReview } = require("../../models/lawReview");
const { LawInbox } = require("../../models/lawInbox");
const { localDate, weekdayOf } = require("../../utils/law/time");
const { db, rawDb } = require("../../utils/law/dbClient");
const { parseTimetable } = require("../../utils/law/timetableParse");
const { LawReferral } = require("../../models/lawReferral");
const { BudgetError, PermanentError } = require("../../utils/law/ai/errors");

/** Each subject gets an upstream workspace for document chat (spec §5.1). Failure is not fatal. */
async function linkUpstreamWorkspace(subject) {
  // Upstream workspaces are instance-wide; students' subjects stay inside LAW-OS (docs/plans/qanouni.md).
  if (!isAdmin()) return null;
  try {
    const { Workspace } = require("../../models/workspace");
    const { workspace } = await Workspace.new(subject.nameFr || subject.name);
    if (workspace) await LawSubject.linkWorkspace(subject.id, workspace.id);
    return workspace?.id ?? null;
  } catch (e) {
    console.error("[LAW-OS] workspace link failed:", e.message);
    return null;
  }
}

function lawAcademicEndpoints(router) {
  router.get(
    "/law/subjects",
    auth,
    handle("subjects_list", async (req, res) => {
      res.json({
        subjects: await LawSubject.list({
          includeArchived: req.query.archived === "1",
        }),
      });
    })
  );

  router.post(
    "/law/subjects",
    auth,
    handle("subjects_create", async (req, res) => {
      const { subject, error } = await LawSubject.create(reqBody(req));
      if (error) return badRequest(res, error);
      const workspaceId = await linkUpstreamWorkspace(subject);
      res
        .status(201)
        .json({ subject: { ...subject, anythingllmWorkspaceId: workspaceId } });
    })
  );

  router.get(
    "/law/subjects/:id",
    auth,
    handle("subjects_get", async (req, res) => {
      const subject = await LawSubject.get(req.params.id);
      if (!subject) return res.status(404).json({ error: "not_found" });
      res.json({ subject });
    })
  );

  router.patch(
    "/law/subjects/:id",
    auth,
    handle("subjects_update", async (req, res) => {
      const { subject, error } = await LawSubject.update(
        req.params.id,
        reqBody(req)
      );
      if (error) return badRequest(res, error);
      res.json({ subject });
    })
  );

  router.get(
    "/law/timetable",
    auth,
    handle("timetable_get", async (_req, res) => {
      res.json({ slots: await LawTimetable.list() });
    })
  );

  router.put(
    "/law/timetable",
    auth,
    handle("timetable_put", async (req, res) => {
      const { slots, error } = await LawTimetable.replace(reqBody(req)?.slots);
      if (error) return badRequest(res, error);
      res.json({ slots });
    })
  );

  // AI import (Gemini Flash): a photo or pasted text → candidate slots for the student to confirm. Saves nothing.
  router.post(
    "/law/schedule/parse-ai",
    auth,
    handle("schedule_parse_ai", async (req, res) => {
      const { image, mimeType, text } = reqBody(req) || {};
      const [subjects, profile] = await Promise.all([
        LawSubject.list(),
        rawDb().lawUserProfile.findUnique({ where: { userId: res.locals.lawUser.id } }),
      ]);
      let r;
      try {
        r = await parseTimetable({
          image,
          mimeType,
          text,
          subjects,
          section: profile?.section || null,
        });
      } catch (e) {
        if (e instanceof BudgetError)
          return res.status(402).json({ error: "ai_budget_reached", budget: true });
        if (e instanceof PermanentError)
          return res.status(503).json({ error: "ai_unavailable" });
        if (e?.name === "ProviderError")
          return res.status(502).json({ error: "ai_failed" });
        throw e;
      }
      if (r.error) return badRequest(res, r.error);
      res.json(r);
    })
  );

  router.get(
    "/law/sessions",
    auth,
    handle("sessions_list", async (req, res) => {
      const { subjectId, from, to } = req.query;
      res.json({ sessions: await LawSession.list({ subjectId, from, to }) });
    })
  );

  router.post(
    "/law/sessions",
    auth,
    handle("sessions_create", async (req, res) => {
      const { session, error } = await LawSession.create(reqBody(req));
      if (error) return badRequest(res, error);
      await LawReferral.checkActivation(res.locals.lawUser.id).catch(() => {});
      res.status(201).json({ session });
    })
  );

  router.patch(
    "/law/sessions/:id",
    auth,
    handle("sessions_update", async (req, res) => {
      const { session, error } = await LawSession.update(
        req.params.id,
        reqBody(req)
      );
      if (error) return badRequest(res, error);
      res.json({ session });
    })
  );

  // Today aggregate (spec §8.5, §9.1)
  router.get(
    "/law/today",
    auth,
    handle("today", async (_req, res) => {
      const now = new Date();
      const today = localDate(now);
      const [slots, sessions, due, streak, subjects, inboxCount] =
        await Promise.all([
          LawTimetable.forDate(today),
          LawSession.list({ from: today, to: today }),
          LawFlashcard.dueQueue({ limit: 500, now }),
          LawReview.streak(now),
          LawSubject.list({ now }),
          LawInbox.count(),
        ]);
      res.json({
        date: today,
        weekday: weekdayOf(today),
        slots,
        sessions,
        due: { reviewCount: due.reviewCount, newCount: due.newCount },
        inboxCount,
        streak,
        exams: subjects
          .filter((s) => s.daysToExam !== null && s.daysToExam >= 0)
          .sort((a, b) => a.daysToExam - b.daysToExam)
          .map(
            ({
              id,
              name,
              color,
              examDate,
              examFormat,
              daysToExam,
              lockdown,
            }) => ({
              id,
              name,
              color,
              examDate,
              examFormat,
              daysToExam,
              lockdown,
            })
          ),
      });
    })
  );

  router.post(
    "/law/devices",
    auth,
    handle("devices_register", async (req, res) => {
      const { name, userAgent } = reqBody(req) || {};
      const device = await db().lawDevice.create({
        data: {
          name:
            typeof name === "string" && name.trim()
              ? name.trim().slice(0, 80)
              : "device",
          userAgent:
            typeof userAgent === "string" ? userAgent.slice(0, 300) : null,
        },
      });
      res.status(201).json({ device });
    })
  );
}

module.exports = { lawAcademicEndpoints };
