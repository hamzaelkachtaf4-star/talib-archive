// Phase 4: faculties, the normalized academic profile and the resumable onboarding wizard.
// Academic data lives on LawUserProfile: the normalized columns (facultyCode, track, studyLang, examTrack) plus
// the legacy cohort strings (faculty, semester, filiere, languageSection, tdGroup) kept in sync because the
// Collab features (squads, hub) still read those.
const { rawDb } = require("../utils/law/dbClient");
const { LawPreferences } = require("./lawPreferences");

const TRACKS = ["PRIVE", "PUBLIC"];
const LANGS = ["AR", "FR"];
const SEMESTERS = ["S1", "S2", "S3", "S4", "S5", "S6"];
const EXAM_TRACKS = ["AVOCAT", "MAGISTRAT", "COMMISSAIRE_JUDICIAIRE"];
const GROUP_RE = /^G\d{2}$/;
const STEPS = [1, 2, 3, 4, 5];
const REQUIRED = ["facultyCode", "track", "language", "semester", "groupCode"];

const FACULTIES = [
  ["FSJES_AIN_CHOCK", "كلية العلوم القانونية والاقتصادية والاجتماعية عين الشق", "FSJES Ain Chock", "Casablanca", true],
  ["FSJES_AIN_SEBAA", "كلية العلوم القانونية والاقتصادية والاجتماعية عين السبع", "FSJES Aïn Sebaâ", "Casablanca", false],
  ["FSJES_MOHAMMEDIA", "كلية العلوم القانونية والاقتصادية والاجتماعية المحمدية", "FSJES Mohammedia", "Mohammedia", false],
  ["FSJES_RABAT_AGDAL", "كلية العلوم القانونية والاقتصادية والاجتماعية أكدال", "FSJES Rabat-Agdal", "Rabat", false],
  ["FSJES_SALE", "كلية العلوم القانونية والاقتصادية والاجتماعية سلا", "FSJES Salé", "Salé", false],
  ["FSJES_MARRAKECH", "كلية العلوم القانونية والاقتصادية والاجتماعية مراكش", "FSJES Marrakech", "Marrakech", false],
  ["FSJES_FES", "كلية العلوم القانونية والاقتصادية والاجتماعية فاس", "FSJES Fès", "Fès", false],
  ["FSJES_MEKNES", "كلية العلوم القانونية والاقتصادية والاجتماعية مكناس", "FSJES Meknès", "Meknès", false],
  ["FSJES_TANGER", "كلية العلوم القانونية والاقتصادية والاجتماعية طنجة", "FSJES Tanger", "Tanger", false],
  ["FSJES_AGADIR", "كلية العلوم القانونية والاقتصادية والاجتماعية أكادير", "FSJES Agadir", "Agadir", false],
  ["FSJES_OUJDA", "كلية العلوم القانونية والاقتصادية والاجتماعية وجدة", "FSJES Oujda", "Oujda", false],
  ["FSJES_SETTAT", "كلية العلوم القانونية والاقتصادية والاجتماعية سطات", "FSJES Settat", "Settat", false],
  ["FSJES_KENITRA", "كلية العلوم القانونية والاقتصادية والاجتماعية القنيطرة", "FSJES Kénitra", "Kénitra", false],
];

const FILIERE = { PRIVE: "Droit Privé / القانون الخاص", PUBLIC: "Droit Public / القانون العام" };
const SECTION = { AR: "Section Arabe / الفوج العربي", FR: "Section Française / الفوج الفرنسي" };

let seeded = false;
async function ensureSeed() {
  const db = rawDb();
  if (seeded && (await db.lawFaculty.count()) >= FACULTIES.length) return;
  for (const [code, nameAr, nameFr, city, isLive] of FACULTIES)
    await db.lawFaculty.upsert({ where: { code }, create: { code, nameAr, nameFr, city, isLive }, update: {} });
  seeded = true;
}

/** Validates a partial academic update. Returns { data } (profile column values) or { error }. */
async function validateAcademic(b) {
  const out = {};
  if (b.facultyCode !== undefined) {
    await ensureSeed();
    const f = await rawDb().lawFaculty.findUnique({ where: { code: String(b.facultyCode) } });
    if (!f) return { error: "invalid_faculty" };
    out.facultyCode = f.code;
    out.faculty = f.nameFr;
  }
  if (b.track !== undefined) { if (!TRACKS.includes(b.track)) return { error: "invalid_track" }; out.track = b.track; out.filiere = FILIERE[b.track]; }
  if (b.language !== undefined) { if (!LANGS.includes(b.language)) return { error: "invalid_language" }; out.studyLang = b.language; out.languageSection = SECTION[b.language]; }
  if (b.semester !== undefined) { if (!SEMESTERS.includes(b.semester)) return { error: "invalid_semester" }; out.semester = b.semester; }
  if (b.groupCode !== undefined) { if (!GROUP_RE.test(String(b.groupCode))) return { error: "invalid_group" }; out.tdGroup = b.groupCode; }
  if (b.examTrack !== undefined) {
    if (b.examTrack !== null && !EXAM_TRACKS.includes(b.examTrack)) return { error: "invalid_exam_track" };
    out.examTrack = b.examTrack;
  }
  return Object.keys(out).length ? { data: out } : { error: "nothing_to_update" };
}

function shapeAcademic(p) {
  return { facultyCode: p.facultyCode, track: p.track, language: p.studyLang, semester: p.semester, groupCode: p.tdGroup, examTrack: p.examTrack };
}
const academicMissing = (p) => !p.facultyCode || !p.track || !p.studyLang;

function parseDraft(p) {
  try { return p.onboardingDraft ? JSON.parse(p.onboardingDraft) : { step: 1, data: {} }; } catch { return { step: 1, data: {} }; }
}

const LawOnboarding = {
  FACULTIES, ensureSeed,

  faculties: async function () {
    await ensureSeed();
    return rawDb().lawFaculty.findMany({ orderBy: [{ isLive: "desc" }, { nameFr: "asc" }] });
  },

  getAcademic: async function (userId) {
    const p = await rawDb().lawUserProfile.findUnique({ where: { userId } });
    return p ? shapeAcademic(p) : null;
  },

  updateAcademic: async function (userId, body = {}) {
    const v = await validateAcademic(body);
    if (v.error) return { error: v.error };
    await rawDb().lawUserProfile.update({ where: { userId }, data: v.data });
    return { academic: await this.getAcademic(userId), error: null };
  },

  state: async function (userId) {
    const p = await rawDb().lawUserProfile.findUnique({ where: { userId } });
    if (!p) return null;
    const d = parseDraft(p);
    return { completed: !!p.onboardingCompletedAt, step: d.step, data: d.data, academicMissing: academicMissing(p) };
  },

  saveStep: async function (userId, step, data) {
    if (!STEPS.includes(step) || !data || typeof data !== "object" || Array.isArray(data)) return { error: "invalid_step" };
    const clean = {};
    if (step === 2) {
      if (data.avatarConfig !== undefined) {
        const a = await LawPreferences.validateAvatar(data.avatarConfig);
        if (a.error) return { error: a.error };
        clean.avatarConfig = a.value;
      }
    } else if (step === 3 || step === 4) {
      const v = await validateAcademic(data);
      if (v.error) return { error: v.error };
      for (const k of ["facultyCode", "track", "language", "semester", "groupCode", "examTrack"]) if (data[k] !== undefined) clean[k] = data[k];
    } else if (step === 5) {
      if (!LawPreferences.GOALS.includes(data.dailyGoalMin)) return { error: "invalid_goal" };
      clean.dailyGoalMin = data.dailyGoalMin;
    }
    const p = await rawDb().lawUserProfile.findUnique({ where: { userId } });
    if (!p) return { error: "not_found" };
    const d = parseDraft(p);
    const next = { step, data: { ...d.data, ...clean } };
    await rawDb().lawUserProfile.update({ where: { userId }, data: { onboardingDraft: JSON.stringify(next) } });
    return { state: await this.state(userId), error: null };
  },

  complete: async function (userId) {
    const p = await rawDb().lawUserProfile.findUnique({ where: { userId } });
    if (!p) return { error: "not_found" };
    const d = parseDraft(p).data;
    const have = { facultyCode: d.facultyCode ?? p.facultyCode, track: d.track ?? p.track, language: d.language ?? p.studyLang, semester: d.semester ?? p.semester, groupCode: d.groupCode ?? p.tdGroup };
    // semester/groupCode have column defaults (S3 / G01): they only count when the student chose them in the wizard
    // or already completed the academic profile before.
    const chosen = (k) => d[k] !== undefined || !!p.facultyCode;
    const realMissing = REQUIRED.filter((k) => !have[k] || (["semester", "groupCode"].includes(k) && !chosen(k)));
    if (realMissing.length) return { error: "incomplete", missing: realMissing };
    const v = await validateAcademic({ ...have, examTrack: d.examTrack });
    if (v.error) return { error: v.error };
    const data = { ...v.data, onboardingCompletedAt: new Date(), onboardingDraft: null };
    if (d.avatarConfig !== undefined) data.avatarConfig = d.avatarConfig === null ? null : JSON.stringify(d.avatarConfig);
    await rawDb().lawUserProfile.update({ where: { userId }, data });
    if (d.dailyGoalMin) await LawPreferences.update(userId, { dailyGoalMin: d.dailyGoalMin });
    return { completed: true, error: null };
  },
};

module.exports = { LawOnboarding };
