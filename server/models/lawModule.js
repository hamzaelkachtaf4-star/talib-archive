// RC3 Phase 3: a student's module workspace. Their own modules (a default list copied from a curriculum seed, or added by
// hand), how they study each one (setup profile), what they know about the professor, the content tree and the lecture
// sources behind it, a recap, and a mentor that only reads this module's material.
// Shared official modules (from the published timetable) stay in LawCourseModule with ownerId null; a student's own
// modules are the same table with ownerId set, so the path, progress and hub pins work on both unchanged.
const { rawDb } = require("../utils/law/dbClient");
const { serialWrite } = require("../utils/law/writeLock");
const { normalize } = require("../utils/law/arabic");
const curricula = require("../utils/law/curricula");
const rateLimit = require("../utils/law/rateLimit");
const E = require("../utils/law/enums");

const MAX_OWN_PER_SEMESTER = 30;
const TITLE_MAX = 80;
const NOTE_MAX = 2000;
const NAME_MAX = 120;
const MAX_NODES = 2000;
const MAX_DEPTH = 6;
const MAX_REPORTS = 20; // per rolling day
const MAX_SOURCES = 300;
const SOURCES_PER_DAY = 100;
const MAX_MODULE_CHARS = 1500000; // total pasted/extracted text a module may hold
const MAX_TEXT = 60000;
const MAX_EXTRACTED = 200000;
const NODE_TITLE_MAX = 200;
const NODE_BODY_MAX = 20000;
const BATCH_KIND = { audio: ["audio_recording", "import"], image: ["photo_batch", "import"], pdf: ["pdf", "import"] };

const ownParcours = (userId) => `u${userId}`;
const cleanTitle = (t) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim() : "");

const LawModule = {
  /**
   * The student's own modules of one semester. When `seed` is set, the default list for their scope is copied in once
   * (a record in LawCurriculumSeed makes it a one-time event); titles the student or the faculty already has are skipped.
   */
  ownedFor: async function (userId, scope, { seed = false, skipTitles = [] } = {}) {
    const where = { ownerId: userId, semester: scope.semester };
    let rows = await rawDb().lawCourseModule.findMany({ where, orderBy: { ordinal: "asc" } });
    if (seed) rows = await this.seedFor(userId, scope, skipTitles);
    return rows;
  },

  /** Copies the default list into the student's own modules. Idempotent and race-safe. */
  seedFor: async function (userId, scope, skipTitles = []) {
    const cur = curricula.find(scope);
    if (!cur) return rawDb().lawCourseModule.findMany({ where: { ownerId: userId, semester: scope.semester }, orderBy: { ordinal: "asc" } });
    const { LawPath } = require("./lawPath");
    await serialWrite(async () => {
      if (await rawDb().lawCurriculumSeed.findUnique({ where: { userId_key: { userId, key: cur.key } } })) return;
      await rawDb().$transaction(async (tx) => {
        await tx.lawCurriculumSeed.create({ data: { userId, key: cur.key } });
        const have = await tx.lawCourseModule.findMany({ where: { ownerId: userId, semester: scope.semester }, select: { title: true, ordinal: true } });
        const taken = new Set([...have.map((x) => normalize(x.title)), ...skipTitles.map(normalize)]);
        let ordinal = have.reduce((n, x) => Math.max(n, x.ordinal), 0);
        for (const m of cur.modules) {
          if (taken.has(normalize(m.title))) continue;
          const row = await tx.lawCourseModule.create({
            data: { facultyCode: scope.facultyCode, semester: scope.semester, track: scope.track, language: scope.language, parcours: ownParcours(userId), ordinal: ++ordinal, title: m.title.trim(), ownerId: userId, source: "seed", verified: cur.verified },
          });
          await LawPath.writeScaffold(row.id, tx);
        }
      }, { maxWait: 15000, timeout: 30000 });
    });
    return rawDb().lawCourseModule.findMany({ where: { ownerId: userId, semester: scope.semester }, orderBy: { ordinal: "asc" } });
  },

  /**
   * "My modules" for one semester: the shared official ones (from the published timetable) plus the student's own.
   * When nothing official covers the semester, the default list for their scope is copied in once. A known semester is
   * never answered with "nothing is published". (GET /path/semesters/:s/modules keeps answering for official modules only.)
   */
  listFor: async function (userId, semester) {
    const { LawPath } = require("./lawPath");
    const base = await LawPath.modules(userId, semester);
    if (base.error) return base;
    const p = await rawDb().lawUserProfile.findUnique({ where: { userId }, select: { facultyCode: true, track: true, studyLang: true } });
    const scope = { facultyCode: p.facultyCode, semester, track: p.track, language: p.studyLang };
    const own = await this.ownedFor(userId, scope, { seed: true, skipTitles: base.modules.map((m) => m.title) });
    const modules = [...base.modules, ...(await LawPath.summarize(userId, own))];
    const profiles = await rawDb().lawModuleProfile.findMany({ where: { userId, moduleId: { in: modules.map((m) => m.id) } }, select: { moduleId: true, formats: true, viewStyle: true, isPublic: true, color: true } });
    const byId = new Map(profiles.map((p) => [p.moduleId, { formats: parseFormats(p.formats), viewStyle: p.viewStyle, isPublic: !!p.isPublic, color: p.color || null }]));
    return { semester, modules: modules.map((m) => ({ ...m, formats: byId.get(m.id)?.formats || [], viewStyle: byId.get(m.id)?.viewStyle || "reader", isPublic: byId.get(m.id)?.isPublic || false, color: byId.get(m.id)?.color || null })), canAdd: true, error: null };
  },

  /** A module the student may see: shared in their scope, or their own. Null otherwise. */
  visible: async function (userId, moduleId) {
    const { LawPath } = require("./lawPath");
    return LawPath._moduleFor(userId, moduleId);
  },

  /** A module the student owns (they may rename, delete or confirm it). */
  owned: async function (userId, moduleId) {
    const m = await rawDb().lawCourseModule.findUnique({ where: { id: String(moduleId || "") } });
    return m && m.ownerId === userId ? m : null;
  },

  addCustom: async function (userId, scope, semester, title) {
    if (!["S1", "S2", "S3", "S4", "S5", "S6"].includes(semester)) return { error: "invalid_semester" };
    const t = cleanTitle(title);
    if (t.length < 2 || t.length > TITLE_MAX) return { error: "invalid_title" };
    const { LawPath } = require("./lawPath");
    return serialWrite(async () => {
      const mine = await rawDb().lawCourseModule.findMany({ where: { ownerId: userId, semester } });
      if (mine.length >= MAX_OWN_PER_SEMESTER) return { error: "too_many_modules", status: 409 };
      if (mine.some((m) => normalize(m.title) === normalize(t))) return { error: "duplicate_title", status: 409 };
      const ordinal = mine.reduce((n, m) => Math.max(n, m.ordinal), 0) + 1;
      const row = await rawDb().$transaction(async (tx) => {
        const created = await tx.lawCourseModule.create({ data: { facultyCode: scope.facultyCode, semester, track: scope.track, language: scope.language, parcours: ownParcours(userId), ordinal, title: t, ownerId: userId, source: "custom", verified: true } });
        await LawPath.writeScaffold(created.id, tx);
        return created;
      }, { maxWait: 15000, timeout: 30000 });
      return { module: present(row), error: null };
    });
  },

  rename: async function (userId, moduleId, title) {
    const m = await this.owned(userId, moduleId);
    if (!m) return { error: "not_found" };
    const t = cleanTitle(title);
    if (t.length < 2 || t.length > TITLE_MAX) return { error: "invalid_title" };
    const siblings = await rawDb().lawCourseModule.findMany({ where: { ownerId: userId, semester: m.semester, NOT: { id: m.id } } });
    if (siblings.some((x) => normalize(x.title) === normalize(t))) return { error: "duplicate_title", status: 409 };
    const row = await rawDb().lawCourseModule.update({ where: { id: m.id }, data: { title: t } });
    return { module: present(row), error: null };
  },

  /** "I checked this module": a seeded module stops showing the default-list badge. */
  confirm: async function (userId, moduleId) {
    const m = await this.owned(userId, moduleId);
    if (!m) return { error: "not_found" };
    const row = await rawDb().lawCourseModule.update({ where: { id: m.id }, data: { verified: true } });
    return { module: present(row), error: null };
  },

  remove: async function (userId, moduleId) {
    const m = await this.owned(userId, moduleId);
    if (!m) return { error: "not_found" };
    await rawDb().lawCourseModule.delete({ where: { id: m.id } });
    return { error: null };
  },

  // ---- setup profile ----
  getProfile: async function (userId, moduleId) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const p = await rawDb().lawModuleProfile.findUnique({ where: { userId_moduleId: { userId, moduleId: String(moduleId) } } });
    return { profile: p ? presentProfile(p) : DEFAULT_PROFILE, error: null };
  },

  saveProfile: async function (userId, moduleId, input) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const b = input && typeof input === "object" ? input : {};
    const data = {};
    if ("hasPolycopie" in b) {
      if (b.hasPolycopie !== null && typeof b.hasPolycopie !== "boolean") return { error: "invalid_profile" };
      data.hasPolycopie = b.hasPolycopie;
    }
    if ("strategy" in b) {
      if (b.strategy !== null && !E.isOneOf(E.MODULE_STRATEGIES, b.strategy)) return { error: "invalid_profile" };
      data.strategy = b.strategy;
    }
    if ("viewStyle" in b) {
      if (!E.isOneOf(E.MODULE_VIEW_STYLES, b.viewStyle)) return { error: "invalid_profile" };
      data.viewStyle = b.viewStyle;
    }
    if ("depth" in b) {
      if (!E.isOneOf(E.MODULE_DEPTHS, b.depth)) return { error: "invalid_profile" };
      data.depth = b.depth;
    }
    if ("sessionsAttended" in b) {
      if (!Number.isInteger(b.sessionsAttended) || b.sessionsAttended < 0 || b.sessionsAttended > 400) return { error: "invalid_profile" };
      data.sessionsAttended = b.sessionsAttended;
    }
    if ("comprehension" in b) {
      if (b.comprehension !== null && (!Number.isInteger(b.comprehension) || b.comprehension < 1 || b.comprehension > 5)) return { error: "invalid_profile" };
      data.comprehension = b.comprehension;
    }
    if ("isPublic" in b) {
      if (typeof b.isPublic !== "boolean") return { error: "invalid_profile" };
      data.isPublic = b.isPublic;
    }
    if ("color" in b) {
      if (b.color !== null && !E.isOneOf(E.MODULE_COLORS, b.color)) return { error: "invalid_profile" };
      data.color = b.color;
    }
    if ("examConfig" in b) {
      if (b.examConfig === null) data.examConfig = null;
      else {
        const c = validExamConfig(b.examConfig);
        if (!c) return { error: "invalid_profile" };
        data.examConfig = JSON.stringify(c);
      }
    }
    if ("sourceMix" in b) {
      if (b.sourceMix === null) data.sourceMix = null;
      else {
        const mix = validSourceMix(b.sourceMix);
        if (!mix) return { error: "invalid_profile" };
        data.sourceMix = JSON.stringify(mix);
      }
    }
    if ("formats" in b) {
      const f = b.formats;
      if (!Array.isArray(f) || f.length > E.MODULE_FORMATS.length || new Set(f).size !== f.length || !f.every((x) => E.isOneOf(E.MODULE_FORMATS, x))) return { error: "invalid_profile" };
      data.formats = JSON.stringify(f);
    }
    if (b.setupDone === true) data.setupDoneAt = new Date();
    const id = String(moduleId);
    const row = await serialWrite(() =>
      rawDb().lawModuleProfile.upsert({ where: { userId_moduleId: { userId, moduleId: id } }, create: { userId, moduleId: id, ...data }, update: data })
    );
    return { profile: presentProfile(row), error: null };
  },

  // ---- professor card (private to the student) ----
  getProfessor: async function (userId, moduleId) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const c = await rawDb().lawProfessorCard.findUnique({ where: { userId_moduleId: { userId, moduleId: String(moduleId) } } });
    return { card: c ? presentCard(c) : EMPTY_CARD, error: null };
  },

  saveProfessor: async function (userId, moduleId, input) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const b = input && typeof input === "object" ? input : {};
    const data = {};
    const text = (k, max) => {
      if (!(k in b)) return true;
      if (b[k] === null || b[k] === "") { data[k] = null; return true; }
      if (typeof b[k] !== "string" || b[k].length > max) return false;
      data[k] = b[k].trim() || null;
      return true;
    };
    const pick = (k, list) => {
      if (!(k in b)) return true;
      if (b[k] === null) { data[k] = null; return true; }
      if (!E.isOneOf(list, b[k])) return false;
      data[k] = b[k];
      return true;
    };
    if (!text("name", NAME_MAX) || !text("notes", NOTE_MAX) || !pick("teachingStyle", E.TEACHING_STYLES) || !pick("attendanceFocus", E.ATTENDANCE_FOCUS) || !pick("examTendency", E.EXAM_TENDENCIES) || !pick("examFormat", E.EXAM_FORMATS))
      return { error: "invalid_card" };
    const id = String(moduleId);
    const row = await serialWrite(() =>
      rawDb().lawProfessorCard.upsert({ where: { userId_moduleId: { userId, moduleId: id } }, create: { userId, moduleId: id, ...data }, update: data })
    );
    return { card: presentCard(row), error: null };
  },

  // ---- content tree ----
  tree: async function (userId, moduleId) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const rows = await rawDb().lawModuleNode.findMany({ where: { userId, moduleId: String(moduleId) }, orderBy: [{ level: "asc" }, { ord: "asc" }, { createdAt: "asc" }], take: MAX_NODES });
    return { nodes: rows.map(presentNode), error: null };
  },

  addNode: async function (userId, moduleId, input) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const b = input && typeof input === "object" ? input : {};
    const v = await validNode(userId, moduleId, b, { creating: true });
    if (v.error) return v;
    return serialWrite(async () => {
      const total = await rawDb().lawModuleNode.count({ where: { userId, moduleId: String(moduleId) } });
      if (total >= MAX_NODES) return { error: "too_many_nodes", status: 409 };
      const parent = v.parent;
      const level = parent ? parent.level + 1 : 0;
      if (level >= MAX_DEPTH) return { error: "too_deep" };
      const last = await rawDb().lawModuleNode.findFirst({ where: { userId, moduleId: String(moduleId), parentId: parent ? parent.id : null }, orderBy: { ord: "desc" } });
      const row = await rawDb().lawModuleNode.create({
        data: { userId, moduleId: String(moduleId), parentId: parent ? parent.id : null, level, kind: v.data.kind || (level === 0 ? "lecture" : "section"), title: v.data.title, body: v.data.body ?? "", ord: (last?.ord ?? -1) + 1, sourceRefs: JSON.stringify(v.data.sourceRefs || []) },
      });
      return { node: presentNode(row), error: null };
    });
  },

  updateNode: async function (userId, moduleId, nodeId, input) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const n = await rawDb().lawModuleNode.findFirst({ where: { id: String(nodeId || ""), userId, moduleId: String(moduleId) } });
    if (!n) return { error: "not_found" };
    const b = input && typeof input === "object" ? input : {};
    const v = await validNode(userId, moduleId, b, { creating: false });
    if (v.error) return v;
    const data = { ...v.data };
    if ("ord" in b) {
      if (!Number.isInteger(b.ord) || b.ord < 0 || b.ord > 100000) return { error: "invalid_node" };
      data.ord = b.ord;
    }
    if ("sourceRefs" in data) data.sourceRefs = JSON.stringify(data.sourceRefs);
    if ("done" in b) {
      if (typeof b.done !== "boolean") return { error: "invalid_node" };
      data.doneAt = b.done ? n.doneAt || new Date() : null;
    }
    // The AI label stays until the student really changes the text (saving an unchanged sheet must not remove it).
    const changed = ("title" in data && data.title !== n.title) || ("body" in data && data.body !== n.body);
    const row = await rawDb().lawModuleNode.update({ where: { id: n.id }, data: { ...data, aiDraft: n.aiDraft && !changed } });
    return { node: presentNode(row), error: null };
  },

  /** A student's note that a piece of their own content is wrong. Capped so it cannot become a way to fill the table. */
  reportNode: async function (userId, moduleId, nodeId, input) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const n = await rawDb().lawModuleNode.findFirst({ where: { id: String(nodeId || ""), userId, moduleId: String(moduleId) }, select: { id: true } });
    if (!n) return { error: "not_found" };
    const note = input && typeof input.note === "string" ? input.note.trim() : "";
    if (!note || note.length > 500) return { error: "invalid_report" };
    return serialWrite(async () => {
      if ((await rawDb().lawNodeReport.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } })) >= MAX_REPORTS) return { error: "too_many_reports", status: 429 };
      await rawDb().lawNodeReport.create({ data: { userId, moduleId: String(moduleId), nodeId: n.id, note } });
      return { ok: true, error: null };
    });
  },

  deleteNode: async function (userId, moduleId, nodeId) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const all = await rawDb().lawModuleNode.findMany({ where: { userId, moduleId: String(moduleId) }, select: { id: true, parentId: true } });
    if (!all.some((n) => n.id === String(nodeId))) return { error: "not_found" };
    const kids = new Map();
    for (const n of all) kids.set(n.parentId, [...(kids.get(n.parentId) || []), n.id]);
    const doomed = [];
    const stack = [String(nodeId)];
    while (stack.length) { const id = stack.pop(); doomed.push(id); stack.push(...(kids.get(id) || [])); }
    await rawDb().lawModuleNode.deleteMany({ where: { id: { in: doomed }, userId } });
    return { deleted: doomed.length, error: null };
  },

  // ---- lecture sources ----
  sources: async function (userId, moduleId) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const rows = await rawDb().lawLectureSource.findMany({ where: { userId, moduleId: String(moduleId) }, orderBy: { createdAt: "desc" }, take: MAX_SOURCES });
    const out = [];
    for (const r of rows) out.push(presentSource(await this.refreshSource(r)));
    return { sources: out, error: null };
  },

  addSource: async function (userId, moduleId, input) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const b = input && typeof input === "object" ? input : {};
    if (!E.isOneOf(E.SOURCE_KINDS, b.kind)) return { error: "invalid_source" };
    let lectureId = null;
    if (b.lectureId != null) {
      const lec = await rawDb().lawModuleNode.findFirst({ where: { id: String(b.lectureId), userId, moduleId: String(moduleId), kind: "lecture" } });
      if (!lec) return { error: "invalid_lecture" };
      lectureId = lec.id;
    }
    const count = await rawDb().lawLectureSource.count({ where: { userId, moduleId: String(moduleId) } });
    if (count >= MAX_SOURCES) return { error: "too_many_sources", status: 409 };
    if (!(await rateLimit.hit("module_source", userId, SOURCES_PER_DAY))) return { error: "rate_limited", status: 429 };
    const base = { userId, moduleId: String(moduleId), lectureId, kind: b.kind };
    if (b.kind === "text") {
      const text = typeof b.text === "string" ? b.text.trim() : "";
      if (!text) return { error: "empty_text" };
      if (text.length > MAX_TEXT) return { error: "text_too_long" };
      const used = (await rawDb().lawLectureSource.findMany({ where: { userId, moduleId: String(moduleId), status: "ready" }, select: { extracted: true } })).reduce((n, r) => n + (r.extracted ? r.extracted.length : 0), 0);
      if (used + text.length > MAX_MODULE_CHARS) return { error: "module_text_full", status: 409 };
      const row = await rawDb().lawLectureSource.create({ data: { ...base, status: "ready", extracted: text } });
      return { source: presentSource(row), error: null };
    }
    if (b.kind === "audio" && b.recordingPermission !== true) return { error: "recording_permission_required" };
    // The device queues captures offline and the upload engine creates the batch later: a source may name the batch by its
    // device id (clientBatchId) and is "pending" until that batch exists on the server.
    const byClient = typeof b.clientBatchId === "string" && b.clientBatchId.length >= 8 && b.clientBatchId.length <= 100;
    if (typeof b.batchId !== "string" && !byClient) return { error: "invalid_batch" };
    const batch = await rawDb().lawCaptureBatch.findFirst({ where: typeof b.batchId === "string" ? { id: b.batchId, userId } : { clientBatchId: b.clientBatchId, userId } });
    if (typeof b.batchId === "string" && !batch) return { error: "invalid_batch" };
    if (batch && !BATCH_KIND[b.kind].includes(batch.kind)) return { error: "invalid_batch" };
    const clientBatchId = batch ? batch.clientBatchId : b.clientBatchId;
    // Claiming a batch is one step: check and insert together so two requests cannot link it twice (the unique keys
    // (userId, clientBatchId) and (userId, batchId) are the last line of defence).
    return serialWrite(async () => {
      const taken = await rawDb().lawLectureSource.findFirst({ where: { userId, OR: [{ clientBatchId }, ...(batch ? [{ batchId: batch.id }] : [])] } });
      if (taken) return { error: "batch_already_used", status: 409 };
      let row;
      try {
        row = await rawDb().lawLectureSource.create({ data: { ...base, status: batch ? "processing" : "pending", batchId: batch ? batch.id : null, clientBatchId, keepRaw: b.keepRaw === true } });
      } catch (e) {
        if (e.code === "P2002") return { error: "batch_already_used", status: 409 };
        throw e;
      }
      return { source: presentSource(await this.refreshSource(row)), error: null };
    });
  },

  /** One source with its extracted text, for the preview step. */
  sourceText: async function (userId, moduleId, sourceId) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const row = await rawDb().lawLectureSource.findFirst({ where: { id: Number(sourceId) || -1, userId, moduleId: String(moduleId) } });
    if (!row) return { error: "not_found" };
    const src = await this.refreshSource(row);
    return { source: { ...presentSource(src), text: src.extracted || "" }, error: null };
  },

  /** The student corrects the text that OCR, transcription or PDF extraction produced, before the mentor structures it. */
  editSource: async function (userId, moduleId, sourceId, input) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const row = await rawDb().lawLectureSource.findFirst({ where: { id: Number(sourceId) || -1, userId, moduleId: String(moduleId) } });
    if (!row) return { error: "not_found" };
    if (row.status !== "ready") return { error: "source_not_ready", status: 409 };
    const text = input && typeof input.text === "string" ? input.text.trim() : "";
    if (!text) return { error: "empty_text" };
    if (text.length > (row.kind === "text" ? MAX_TEXT : MAX_EXTRACTED)) return { error: "text_too_long" };
    const updated = await serialWrite(() => rawDb().lawLectureSource.update({ where: { id: row.id }, data: { extracted: text } }));
    return { source: { ...presentSource(updated), text }, error: null };
  },

  deleteSource: async function (userId, moduleId, sourceId) {
    if (!(await this.visible(userId, moduleId))) return { error: "not_found" };
    const r = await rawDb().lawLectureSource.deleteMany({ where: { id: Number(sourceId) || -1, userId, moduleId: String(moduleId) } });
    return r.count ? { error: null } : { error: "not_found" };
  },

  /** Moves a media source along pending -> processing -> ready | failed by looking at its capture batch. Never throws. */
  refreshSource: async function (src) {
    if (src.status !== "processing" && src.status !== "pending") return src;
    if (!src.batchId && !src.clientBatchId) return src;
    try {
      const batch = await rawDb().lawCaptureBatch.findFirst({ where: src.batchId ? { id: src.batchId, userId: src.userId } : { clientBatchId: src.clientBatchId, userId: src.userId }, include: { derivatives: true } });
      if (!batch && !src.batchId) return src; // still on the device: stays pending
      if (batch && !src.batchId) {
        // The device named the batch before it existed: now that it does, it must be of the declared kind.
        if (!BATCH_KIND[src.kind]?.includes(batch.kind)) return this._finish(src, { status: "failed", error: "invalid_batch" });
        src = await rawDb().lawLectureSource.update({ where: { id: src.id }, data: { batchId: batch.id, status: "processing" } });
      }
      if (!batch) return this._finish(src, { status: "failed", error: "batch_missing" });
      const texts = batch.derivatives.filter((d) => d.kind === "ocr_text" || d.kind === "transcript").map((d) => derivativeText(d)).filter(Boolean);
      if (texts.length) {
        const out = await this._finish(src, { status: "ready", extracted: texts.join("\n\n").slice(0, MAX_EXTRACTED), error: null });
        if (src.kind === "audio" && !src.keepRaw) await deleteRawAudio(src.userId, batch.id);
        return out;
      }
      const failed = await rawDb().lawJob.findFirst({ where: { userId: src.userId, status: "failed", type: { in: ["ocr_photo_batch", "transcribe_audio", "extract_pdf"] }, payload: { contains: batch.id } } });
      if (failed || batch.status === "failed") return this._finish(src, { status: "failed", error: "processing_failed" });
      return src;
    } catch {
      return src;
    }
  },

  /** Brings every in-flight source of a module up to date, so the mentor, drills and the recap see finished transcripts. */
  refreshPending: async function (userId, moduleId) {
    const rows = await rawDb().lawLectureSource.findMany({ where: { userId, moduleId: String(moduleId), status: { in: ["pending", "processing"] } }, take: MAX_SOURCES });
    for (const r of rows) await this.refreshSource(r);
  },

  _finish: async function (src, data) {
    return rawDb().lawLectureSource.update({ where: { id: src.id }, data });
  },

  // ---- recap ----
  recap: async function (userId, moduleId) {
    const m = await this.visible(userId, moduleId);
    if (!m) return { error: "not_found" };
    await this.refreshPending(userId, moduleId);
    const id = String(moduleId);
    const [nodes, sources, progress, profile] = await Promise.all([
      rawDb().lawModuleNode.findMany({ where: { userId, moduleId: id }, select: { kind: true, aiDraft: true } }),
      rawDb().lawLectureSource.count({ where: { userId, moduleId: id, status: "ready" } }),
      rawDb().lawNodeProgress.findMany({ where: { userId, node: { moduleId: id } }, select: { state: true } }),
      rawDb().lawModuleProfile.findUnique({ where: { userId_moduleId: { userId, moduleId: id } }, select: { subjectId: true, sessionsAttended: true, comprehension: true } }),
    ]);
    const drills = await rawDb().lawDrillAttempt.findMany({ where: { userId, moduleId: id, status: "submitted", score: { not: null } }, select: { score: true } });
    const pathTotal = await rawDb().lawPathNode.count({ where: { moduleId: id } });
    return {
      recap: {
        lectures: nodes.filter((n) => n.kind === "lecture").length,
        sourcesReady: sources,
        nodesCompleted: progress.filter((p) => p.state === "COMPLETED").length,
        nodesTotal: pathTotal,
        notesGenerated: nodes.filter((n) => n.aiDraft).length,
        gapRadarScore: await this._gapScore(userId, m, profile?.subjectId),
        completionPct: pathTotal ? Math.round((100 * progress.filter((p) => p.state === "COMPLETED").length) / pathTotal) : 0,
        sessionsAttended: profile?.sessionsAttended ?? 0,
        comprehension: profile?.comprehension ?? null,
        drillCount: drills.length,
        drillAverage: drills.length ? Math.round(drills.reduce((s, d) => s + d.score, 0) / drills.length) : null,
      },
      error: null,
    };
  },

  /** Share of the gaps found in this module's linked course notes that are no longer open (null before any analysis). */
  _gapScore: async function (userId, m, subjectId) {
    let subject = subjectId ? await rawDb().lawSubject.findFirst({ where: { id: subjectId, userId } }) : null;
    if (!subject) {
      const key = normalize(m.title);
      const subjects = await rawDb().lawSubject.findMany({ where: { userId, archived: false }, select: { id: true, name: true } });
      subject = subjects.find((s) => normalize(s.name) === key) || null;
    }
    if (!subject) return null;
    const courses = await rawDb().lawStudentCourse.findMany({ where: { userId, subjectId: subject.id }, select: { id: true } });
    if (!courses.length) return null;
    const gaps = await rawDb().lawKnowledgeGap.findMany({ where: { userId, courseId: { in: courses.map((c) => c.id) } }, select: { status: true } });
    if (!gaps.length) return null;
    const closed = gaps.filter((g) => ["COVERED", "RESOLVED", "DISMISSED"].includes(g.status)).length;
    return Math.round((100 * closed) / gaps.length);
  },
};

const presentNode = (n) => ({ id: n.id, parentId: n.parentId, level: n.level, kind: n.kind, title: n.title, body: n.body, order: n.ord, sourceRefs: parseJson(n.sourceRefs, []), aiDraft: n.aiDraft, done: !!n.doneAt });
const presentSource = (r) => ({ id: r.id, kind: r.kind, status: r.status, lectureId: r.lectureId, keepRaw: r.keepRaw, error: r.error, chars: r.extracted ? r.extracted.length : 0, createdAt: r.createdAt });
const EXAM_TYPES = ["cards", "qcu", "qcm", "direct", "analytic", "case", "dissertation"];
/** The exam set-up of one subject, or null when it is not valid. */
function validExamConfig(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const { types, difficulty, count, caseSource, builtAt } = c;
  if (!Array.isArray(types) || !types.length || new Set(types).size !== types.length || !types.every((t) => EXAM_TYPES.includes(t))) return null;
  const mode = c.mode === undefined ? "quiz" : c.mode;
  if (!["easy", "medium", "hard", "progressive"].includes(difficulty) || !Number.isInteger(count) || count < 5 || count > 20 || !["real", "ai", "both"].includes(caseSource) || !["cards", "quiz", "final"].includes(mode)) return null;
  if (builtAt !== null && (typeof builtAt !== "string" || Number.isNaN(Date.parse(builtAt)) || !/^\d{4}-\d{2}-\d{2}T/.test(builtAt))) return null;
  return { types, difficulty, count, caseSource, mode, builtAt };
}

/** Share of each kind of source for one subject: whole multiples of 5 that add up to 100. */
function validSourceMix(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const keys = ["lectures", "printed", "research", "legal"];
  if (Object.keys(m).length !== keys.length || !keys.every((k) => Number.isInteger(m[k]) && m[k] >= 0 && m[k] <= 100 && m[k] % 5 === 0)) return null;
  if (keys.reduce((n, k) => n + m[k], 0) !== 100) return null;
  if (m.lectures + m.printed + m.legal === 0) return null; // "research" alone would leave nothing to read
  return Object.fromEntries(keys.map((k) => [k, m[k]]));
}
const parseJson = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };

/** Plain text of an OCR or transcript derivative (their JSON shapes differ). */
function derivativeText(d) {
  const c = parseJson(d.content, null);
  if (!c) return typeof d.content === "string" ? d.content.trim() : "";
  if (Array.isArray(c.pages)) return c.pages.map((p) => (p.text || "").trim()).filter(Boolean).join("\n\n");
  if (Array.isArray(c.segments)) return c.segments.map((s) => (s.text || "").trim()).filter(Boolean).join(" ");
  return "";
}

/** Deletes the raw audio of a transcribed batch (files and rows). Files shared with another asset row are kept. */
async function deleteRawAudio(userId, batchId) {
  const fs = require("fs");
  const { assetAbsPath } = require("../utils/law/assets");
  const assets = await rawDb().lawAsset.findMany({ where: { userId, batchId, kind: "audio" } });
  for (const a of assets) {
    await rawDb().lawAsset.delete({ where: { id: a.id } });
    const shared = await rawDb().lawAsset.count({ where: { storagePath: a.storagePath } });
    if (!shared) { try { fs.unlinkSync(assetAbsPath(a.storagePath)); } catch { /* already gone */ } }
  }
}

/** Shared validation of node input. `data` holds only the fields that were sent. */
async function validNode(userId, moduleId, b, { creating }) {
  const data = {};
  if (creating || "title" in b) {
    const t = cleanTitle(b.title);
    if (!t || t.length > NODE_TITLE_MAX) return { error: "invalid_node" };
    data.title = t;
  }
  if ("body" in b) {
    if (typeof b.body !== "string" || b.body.length > NODE_BODY_MAX) return { error: "invalid_node" };
    data.body = b.body;
  }
  if ("kind" in b) {
    if (!E.isOneOf(E.NODE_KINDS, b.kind)) return { error: "invalid_node" };
    data.kind = b.kind;
  }
  if ("sourceRefs" in b) {
    if (!Array.isArray(b.sourceRefs) || b.sourceRefs.length > 20 || b.sourceRefs.some((x) => !Number.isInteger(x))) return { error: "invalid_node" };
    const ids = [...new Set(b.sourceRefs)];
    const found = await rawDb().lawLectureSource.count({ where: { id: { in: ids }, userId, moduleId: String(moduleId) } });
    if (found !== ids.length) return { error: "invalid_node" };
    data.sourceRefs = ids;
  }
  let parent = null;
  if (creating && b.parentId != null) {
    parent = await rawDb().lawModuleNode.findFirst({ where: { id: String(b.parentId), userId, moduleId: String(moduleId) } });
    if (!parent) return { error: "invalid_node" };
  }
  return { data, parent, error: null };
}

const present = (m) => ({ id: m.id, ordinal: m.ordinal, title: m.title, semester: m.semester, owned: m.ownerId != null, source: m.source, verified: m.verified });
const DEFAULT_PROFILE = Object.freeze({ hasPolycopie: null, strategy: null, viewStyle: "reader", depth: "concise", sessionsAttended: 0, comprehension: null, setupDone: false, formats: [], isPublic: false, color: null, examConfig: null, sourceMix: null });
const parseFormats = (raw) => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((x) => E.isOneOf(E.MODULE_FORMATS, x)) : []; } catch { return []; } };
const presentProfile = (p) => ({ hasPolycopie: p.hasPolycopie, strategy: p.strategy, viewStyle: p.viewStyle, depth: p.depth, sessionsAttended: p.sessionsAttended, comprehension: p.comprehension, setupDone: !!p.setupDoneAt, formats: parseFormats(p.formats), isPublic: !!p.isPublic, color: p.color || null, examConfig: parseJson(p.examConfig, null), sourceMix: parseJson(p.sourceMix, null) });
const EMPTY_CARD = Object.freeze({ name: null, teachingStyle: null, attendanceFocus: null, examTendency: null, examFormat: null, notes: null });
const presentCard = (c) => ({ name: c.name, teachingStyle: c.teachingStyle, attendanceFocus: c.attendanceFocus, examTendency: c.examTendency, examFormat: c.examFormat, notes: c.notes });

module.exports = { LawModule };
