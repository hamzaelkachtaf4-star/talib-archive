// Deterministic dissertation checks (spec §8.3), run locally before any AI call. They report; they never
// rewrite. Heading wording is only *flagged* for the student to confirm.
const { normalize } = require("./arabic");
const { LawSubject } = require("../../models/lawSubject");

const INTERROGATIVE =
  /[؟?]|(^|\s)(هل|كيف|ما|ماذا|لماذا|متى|اين|أين|الى اي|إلى أي|الى أي|الي اي|مدى)(\s|$)/;
// Heading prefixes that are structure, not wording: "المبحث الأول:", "المطلب الثاني -", "أولا:".
const STRUCTURE_PREFIX =
  /^\s*(?:(?:ال)?(?:مبحث|مطلب|فقرة|فرع|قسم)\s+[^\s:،\-–]+|أولا|ثانيا|ثالثا|رابعا)\s*[:\-–،.]?\s*/;
// Frequent past-tense verbs that open badly-worded headings.
const PAST_VERBS = new Set(
  [
    "كان",
    "اصبح",
    "جاء",
    "نص",
    "اعتبر",
    "قرر",
    "ذهب",
    "اتجه",
    "تبني",
    "تبنى",
    "ظهر",
    "عرف",
    "نظم",
    "اشترط",
    "منح",
  ].map(normalize)
);

/** Likely conjugated verb at the start of a heading (imperfect prefix or a known past verb). */
function startsWithVerb(title) {
  const words = normalize(String(title || "").replace(STRUCTURE_PREFIX, ""))
    .split(" ")
    .filter(Boolean);
  const first = words[0];
  if (!first || first.startsWith("ال")) return false;
  if (PAST_VERBS.has(first)) return true;
  return (
    /^(ي|ت|ن)[ء-ي]{3,}$/.test(first) &&
    !/^(تعريف|تطور|تمييز|تقسيم|تنفيذ|تكييف|تعدد|تحديد|نطاق|نظام|نظريه|نفاذ|نتائج|يمين)/.test(
      first
    )
  );
}

function len(s) {
  return String(s || "").trim().length;
}

/**
 * @param {{intro:{steps:string[]}, plan:{sections:{title:string, subsections:{title:string, body?:string}[]}[]}}} d
 * @param {object} rules subject.dissertationRules (defaults in LawSubject)
 * @returns {{id:string, ok:boolean, message:string, needsConfirmation?:boolean, details?:any}[]}
 */
function runChecks(d, rules = LawSubject.DEFAULT_DISSERTATION_RULES) {
  const steps =
    rules.introSteps || LawSubject.DEFAULT_DISSERTATION_RULES.introSteps;
  const introVals = d.intro?.steps || [];
  const sections = d.plan?.sections || [];
  const out = [];

  const missing = steps.filter((_, i) => len(introVals[i]) < 10);
  out.push({
    id: "intro_steps",
    ok: !missing.length,
    message: missing.length
      ? `خطوات ناقصة في المقدمة: ${missing.join("، ")}`
      : "المقدمة تتضمن كل الخطوات",
    details: missing,
  });

  const pIdx = steps.findIndex((s) =>
    normalize(s).includes(normalize("الإشكالية"))
  );
  const prob = pIdx >= 0 ? introVals[pIdx] : "";
  const probOk =
    len(prob) >= 10 &&
    INTERROGATIVE.test(
      normalize(prob) + (String(prob).includes("؟") ? "؟" : "")
    );
  out.push({
    id: "problematique",
    ok: probOk,
    message: probOk
      ? "الإشكالية مصاغة في صيغة سؤال"
      : "الإشكالية غائبة أو غير مصاغة في صيغة سؤال",
  });

  if ((rules.planType || "bipartite") === "bipartite") {
    const shape = sections.map((s) => (s.subsections || []).length);
    const ok = sections.length === 2 && shape.every((n) => n === 2);
    out.push({
      id: "bipartite",
      ok,
      message: ok
        ? "التصميم ثنائي (مبحثان × مطلبان)"
        : `التصميم غير ثنائي: ${sections.length} مبحث، المطالب: ${shape.join(" / ") || "0"}`,
    });
  }

  if (rules.symmetricDepth !== false && sections.length === 2) {
    const counts = sections.map((s) => (s.subsections || []).length);
    const weights = sections.map((s) =>
      (s.subsections || []).reduce((a, x) => a + len(x.body), 0)
    );
    const lop =
      Math.min(...weights) > 0
        ? Math.max(...weights) / Math.min(...weights)
        : weights.some((w) => w > 0)
          ? Infinity
          : 1;
    const ok = counts[0] === counts[1] && lop <= 2;
    out.push({
      id: "symmetry",
      ok,
      message: ok
        ? "توازن بين المبحثين"
        : counts[0] !== counts[1]
          ? "عدد المطالب غير متوازن بين المبحثين"
          : "حجم المبحثين غير متوازن (أكثر من الضعف)",
    });
  }

  if (rules.headingsAsNounPhrases !== false) {
    const titles = sections
      .flatMap((s) => [s.title, ...(s.subsections || []).map((x) => x.title)])
      .filter(Boolean);
    const flagged = titles.filter(startsWithVerb);
    out.push({
      id: "noun_headings",
      ok: !flagged.length,
      needsConfirmation: flagged.length > 0,
      message: flagged.length
        ? "عناوين قد تبدأ بفعل (تحقق منها، لن تُعدّل تلقائيا)"
        : "العناوين جمل اسمية",
      details: flagged,
    });
  }

  const emptyTitles = sections
    .flatMap((s) => [s.title, ...(s.subsections || []).map((x) => x.title)])
    .filter((t) => !len(t)).length;
  if (emptyTitles)
    out.push({
      id: "titles",
      ok: false,
      message: `عناوين فارغة: ${emptyTitles}`,
    });
  return out;
}

/** Spec §9.7: an AI critique only after a draft exists. */
function hasDraft(d) {
  const filled = (d.intro?.steps || []).filter((s) => len(s) >= 10).length;
  const titles = (d.plan?.sections || []).filter((s) => len(s.title)).length;
  return filled >= 3 && titles >= 2;
}

module.exports = { runChecks, hasDraft, startsWithVerb };
