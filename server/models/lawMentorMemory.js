// Short notes the module mentor keeps about how a student learns («أفضّل الأمثلة المغربية», «أخلط بين العقدية والتقصيرية»).
// Only the student writes them, or accepts one the mentor suggested; they can delete any. They go into the mentor prompt as
// untrusted reading material, never as instructions, and only while the student's «ذاكرتي» switch is on.
const { rawDb } = require("../utils/law/dbClient");
const { serialWrite } = require("../utils/law/writeLock");
const { LawModule } = require("./lawModule");

const MAX_LEN = 200;
const MAX_PER_SCOPE = 20;
const err = (error, status) => ({ error, ...(status ? { status } : {}) });
const present = (r) => ({ id: r.id, content: r.content, scope: r.moduleId ? "module" : "all", source: r.source, createdAt: r.createdAt });

/** The student's «ذاكرتي» switch: notes are neither read nor suggested while it is off. */
async function enabled(userId) {
  const p = await rawDb().lawUserPreferences.findUnique({ where: { userId }, select: { memoryEnabled: true } });
  return !p || p.memoryEnabled !== false;
}

const LawMentorMemory = {
  MAX_LEN,
  enabled,

  /** Notes for this subject and the ones that apply everywhere. */
  list: async function (userId, moduleId) {
    if (!(await LawModule.visible(userId, moduleId))) return err("not_found", 404);
    const rows = await rawDb().lawMentorMemory.findMany({ where: { userId, OR: [{ moduleId: String(moduleId) }, { moduleId: null }] }, orderBy: { createdAt: "asc" }, take: 2 * MAX_PER_SCOPE });
    return { notes: rows.map(present), enabled: await enabled(userId), error: null };
  },

  add: async function (userId, moduleId, input, source = "student") {
    if (!(await LawModule.visible(userId, moduleId))) return err("not_found", 404);
    const content = input && typeof input.content === "string" ? input.content.replace(/\s+/g, " ").trim() : "";
    if (!content || content.length > MAX_LEN) return err("invalid_note");
    const scope = input.scope === "all" ? "all" : "module";
    const mod = scope === "all" ? null : String(moduleId);
    return serialWrite(async () => {
      if ((await rawDb().lawMentorMemory.count({ where: { userId, moduleId: mod } })) >= MAX_PER_SCOPE) return err("too_many_notes", 409);
      if (await rawDb().lawMentorMemory.findFirst({ where: { userId, moduleId: mod, content } })) return err("duplicate_note", 409);
      const row = await rawDb().lawMentorMemory.create({ data: { userId, moduleId: mod, content, source: source === "mentor" ? "mentor" : "student" } });
      return { note: present(row), error: null };
    });
  },

  remove: async function (userId, moduleId, id) {
    if (!(await LawModule.visible(userId, moduleId))) return err("not_found", 404);
    const r = await rawDb().lawMentorMemory.deleteMany({ where: { id: String(id || ""), userId } });
    return r.count ? { error: null } : err("not_found", 404);
  },

  /** The notes as prompt lines (empty when the switch is off). */
  forPrompt: async function (userId, moduleId) {
    if (!(await enabled(userId))) return [];
    const rows = await rawDb().lawMentorMemory.findMany({ where: { userId, OR: [{ moduleId: String(moduleId) }, { moduleId: null }] }, orderBy: { createdAt: "asc" }, take: 2 * MAX_PER_SCOPE });
    return rows.map((r) => r.content);
  },
};

module.exports = { LawMentorMemory };
