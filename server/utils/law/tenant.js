// Qanouni multi-user isolation (docs/plans/qanouni.md §3). Every LAW-OS query runs inside a context:
//   { userId, role }  → a request or job acting for one student; owned models are filtered to that user;
//   { system: true }  → the worker, the scheduler or a signed-URL check; nothing is filtered.
// No context means a programming error, and the scoped client refuses the query (fail closed).
const { AsyncLocalStorage } = require("node:async_hooks");

const als = new AsyncLocalStorage();
let testFallback = null;

class LawTenantError extends Error {
  constructor(message) {
    super(message);
    this.name = "LawTenantError";
  }
}

/** Models whose rows belong to one user. Everything else (corpus, reforms, settings) is global. */
const OWNED = new Set([
  "LawDevice",
  "LawAiCall",
  "LawSubject",
  "LawTimetableSlot",
  "LawClassSession",
  "LawFlashcard",
  "LawReviewLog",
  "LawStudyDay",
  "LawStreak",
  "LawAsset",
  "LawCaptureBatch",
  "LawUpload",
  "LawJob",
  "LawDerivative",
  "LawDecision",
  "LawDoctrineRef",
  "LawLink",
  "LawNoteAtom",
  "LawCaseExercise",
  "LawCaseAttempt",
  "LawDissertation",
  "LawWeeklyRecap",
  "LawPushSubscription",
  "LawStudentCourse",
  "LawCourseTopic",
  "LawKnowledgeGap",
  "LawTodo",
  "LawCurriculumSeed",
  "LawModuleProfile",
  "LawProfessorCard",
  "LawLectureSource",
  "LawModuleNode",
  "LawModuleProposal",
  "LawExamDate",
  "LawDrillAttempt",
  "LawReminderPref",
]);

/** Foreign keys that point at owned rows: a write may only reference the writer's own rows. */
const FOREIGN = {
  subjectId: "lawSubject",
  sessionId: "lawClassSession",
  slotId: "lawTimetableSlot",
  cardId: "lawFlashcard",
  batchId: "lawCaptureBatch",
  assetId: "lawAsset",
  exerciseId: "lawCaseExercise",
  noteAtomId: "lawNoteAtom",
  decisionId: "lawDecision",
  doctrineRefId: "lawDoctrineRef",
  sourceAssetId: "lawAsset",
  fromDerivativeId: "lawDerivative",
  courseId: "lawStudentCourse",
};
// LawSourceDocument.assetId points at an owned asset too, but source documents are admin-only.

/** LawLink ends that are owned rows (the others are corpus rows, which everyone may reference). */
const LINK_TYPES = {
  decision: "lawDecision",
  doctrine: "lawDoctrineRef",
  noteAtom: "lawNoteAtom",
  flashcard: "lawFlashcard",
  caseAttempt: "lawCaseAttempt",
};

/**
 * Keys that were unique on their own before Qanouni and are now unique per user. A `where` written the old
 * way ({ date } or { court_decisionNumber_decisionDate: … }) is rewritten to the per-user compound key, so
 * callers keep working and can only ever match their own row.
 */
const PER_USER_UNIQUE = {
  LawStudyDay: [["date"]],
  LawAsset: [["sha256"], ["clientCaptureId"]],
  LawCaptureBatch: [["clientBatchId"]],
  LawUpload: [["clientCaptureId"]],
  LawWeeklyRecap: [["weekStart"]],
  LawDecision: [["court", "decisionNumber", "decisionDate"]],
  LawLink: [["fromType", "fromId", "toType", "toId", "relation"]],
};

function rewriteUnique(model, where, userId) {
  const w = { ...(where || {}) };
  for (const fields of PER_USER_UNIQUE[model] || []) {
    const oldName = fields.join("_");
    const values =
      w[oldName] && typeof w[oldName] === "object"
        ? w[oldName]
        : fields.every((f) => f in w && typeof w[f] !== "object")
          ? Object.fromEntries(fields.map((f) => [f, w[f]]))
          : null;
    if (!values || "id" in w) continue;
    delete w[oldName];
    for (const f of fields) delete w[f];
    w[`userId_${oldName}`] = { userId, ...values };
  }
  return { ...w, userId };
}

const UNIQUE_WHERE = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "upsert",
  "delete",
]);

function context() {
  return als.getStore() || testFallback;
}

function runAs(ctx, fn) {
  if (!ctx || (!ctx.system && !Number.isInteger(ctx.userId)))
    throw new LawTenantError("runAs needs { userId } or { system: true }");
  // Await inside the context: Prisma queries are lazy thenables that only run when awaited, so a query
  // returned un-awaited would otherwise execute after the context has ended.
  return als.run(Object.freeze({ ...ctx }), async () => await fn());
}

const asSystem = (fn) => runAs({ system: true }, fn);
const asUser = (userId, fn, role = "default") => runAs({ userId, role }, fn);

/** The acting user's id; throws outside a user context. */
function currentUserId() {
  const ctx = context();
  if (!ctx || ctx.system || !Number.isInteger(ctx.userId))
    throw new LawTenantError("No LAW-OS user in context");
  return ctx.userId;
}

function isAdmin() {
  const ctx = context();
  return !!ctx && (ctx.system || ctx.role === "admin");
}

/** Test-only: integration tests act as the temp DB's owner without wrapping every call. */
function setTestFallbackUser(userId) {
  if (process.env.NODE_ENV !== "test" && userId !== null)
    throw new LawTenantError("setTestFallbackUser is test-only");
  testFallback = userId === null ? null : { userId, role: "admin" };
}

/**
 * Prisma client extension: scopes every owned model to the context user. Global models pass through.
 * @param {import('@prisma/client').PrismaClient} base unscoped client, used for ownership checks
 */
function scopedExtension(base) {
  async function assertOwned(delegate, id, userId) {
    if (id === null || id === undefined) return;
    const n = await base[delegate].count({ where: { id, userId } });
    if (!n) throw new LawTenantError(`Reference not found: ${delegate}`);
  }

  async function checkData(model, data, userId) {
    for (const row of Array.isArray(data) ? data : [data]) {
      if (!row || typeof row !== "object") continue;
      if (row.userId !== undefined && row.userId !== userId)
        throw new LawTenantError("Cannot write rows for another user");
      for (const [field, delegate] of Object.entries(FOREIGN)) {
        const v = row[field];
        if (typeof v === "string") await assertOwned(delegate, v, userId);
        else if (v && typeof v === "object" && typeof v.set === "string")
          await assertOwned(delegate, v.set, userId);
      }
      if (model === "LawLink")
        for (const end of ["from", "to"]) {
          const delegate = LINK_TYPES[row[`${end}Type`]];
          if (delegate && typeof row[`${end}Id`] === "string")
            await assertOwned(delegate, row[`${end}Id`], userId);
        }
    }
  }

  const withUser = (where, userId) => ({ ...(where || {}), userId });
  const stamp = (data, userId) =>
    Array.isArray(data)
      ? data.map((d) => ({ ...d, userId }))
      : { ...(data || {}), userId };

  return {
    name: "law-tenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!OWNED.has(model)) return query(args);
          const ctx = context();
          if (!ctx)
            throw new LawTenantError(
              `No LAW-OS context for ${model}.${operation}`
            );
          if (ctx.system) return query(args);
          const userId = ctx.userId;
          const a = { ...(args || {}) };
          if (UNIQUE_WHERE.has(operation))
            a.where = rewriteUnique(model, a.where, userId);

          switch (operation) {
            case "create":
            case "createMany":
              await checkData(model, a.data, userId);
              return query({ ...a, data: stamp(a.data, userId) });
            case "upsert":
              // A matching row of another user fails the userId filter, so Prisma tries to create and
              // hits the unique constraint: the other user's row is never touched.
              await checkData(model, a.create, userId);
              await checkData(model, a.update, userId);
              return query({
                ...a,
                where: withUser(a.where, userId),
                create: stamp(a.create, userId),
              });
            case "update":
            case "updateMany":
              await checkData(model, a.data, userId);
              return query({ ...a, where: withUser(a.where, userId) });
            default:
              // findUnique (Prisma 5 accepts extra filters next to the unique key), findFirst, findMany,
              // count, aggregate, groupBy, delete (P2025 when it is not ours), deleteMany, …
              return query({ ...a, where: withUser(a.where, userId) });
          }
        },
      },
    },
  };
}

module.exports = {
  OWNED,
  LawTenantError,
  context,
  runAs,
  asSystem,
  asUser,
  currentUserId,
  isAdmin,
  setTestFallbackUser,
  scopedExtension,
};
