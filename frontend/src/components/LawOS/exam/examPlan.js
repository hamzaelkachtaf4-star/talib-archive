import { Brain, Cards, CheckCircle, FileText, ListChecks, PencilSimple, Scales } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";

/** The seven exercise types of the exam set-up. `drill` is the server drill type behind it; two have no generator yet. */
export const EXAM_TYPES = () => [
  { key: "cards", label: tr("بطاقات التعلم"), hint: tr("مفهوم في الوجه وتعريفه في الظهر"), Icon: Cards, drill: null, supported: true },
  { key: "qcu", label: "QCU", hint: tr("سؤال بجواب صحيح واحد"), Icon: CheckCircle, drill: "qcm", supported: true },
  { key: "qcm", label: "QCM", hint: tr("قد يكون أكثر من جواب صحيح"), Icon: ListChecks, drill: null, supported: false },
  { key: "direct", label: tr("أسئلة مباشرة"), hint: tr("تعريف وتمييز بين المفاهيم"), Icon: PencilSimple, drill: "direct", supported: true },
  { key: "analytic", label: tr("أسئلة تحليلية"), hint: tr("حلّل وناقش بحجج قانونية"), Icon: Brain, drill: null, supported: false },
  { key: "case", label: tr("النوازل"), hint: tr("حل نازلة خطوة بخطوة بالمنهجية"), Icon: Scales, drill: "case", supported: true },
  { key: "dissertation", label: tr("موضوع إنشائي"), hint: tr("إشكالية وتصميم ثنائي"), Icon: FileText, drill: "dissertation", supported: true },
];

export const DIFFICULTIES = () => [["easy", tr("سهل")], ["medium", tr("متوسط")], ["hard", tr("صعب")], ["progressive", tr("متدرج")]];
export const CASE_SOURCES = () => [
  ["real", tr("نوازل حقيقية"), tr("من امتحانات سابقة وبنك نوازل الفوج")],
  ["ai", tr("مولدة بالذكاء الاصطناعي"), tr("نوازل جديدة من مضمون دروسك")],
  ["both", tr("الاثنان معاً"), tr("الحقيقية أولاً ثم المولدة")],
];

export const DEFAULT_CONFIG = Object.freeze({ types: ["qcu", "case"], difficulty: "progressive", count: 10, caseSource: "both", mode: "quiz", builtAt: null });

/** How the student wants to be tested: study the cards with no typing, a quiz with an immediate explanation, or a final exam with a mark. */
export const MODES = () => [
  ["cards", tr("بطاقات للمراجعة"), tr("أسئلة وأجوبتها على بطاقات، بلا كتابة ولا تقييم")],
  ["quiz", tr("اختبار مع التبرير"), tr("بعد كل سؤال تظهر الإجابة الصحيحة وسببها فوراً")],
  ["final", tr("امتحان نهائي بنقطة"), tr("تجيب عن كل الأسئلة أولاً، ثم تظهر النقطة والتصحيح")],
];

const LEVELS = ["easy", "medium", "hard"];

/**
 * The stages of the exam path: the chosen types in the set-up's own order, each with a level. «Progressive» starts easy and ends
 * at exam level (the last stage is always hard); a fixed level applies to every stage.
 */
export function stagesOf(config) {
  const order = EXAM_TYPES().map((t) => t.key);
  const keys = order.filter((k) => config.types.includes(k));
  const info = Object.fromEntries(EXAM_TYPES().map((t) => [t.key, t]));
  return keys.map((key, i) => ({
    key,
    drill: info[key].drill,
    supported: info[key].supported,
    difficulty: config.difficulty === "progressive" ? (keys.length === 1 ? "hard" : LEVELS[Math.round((2 * i) / (keys.length - 1))]) : config.difficulty,
    count: key === "qcu" ? config.count : null,
    mode: key === "qcu" ? config.mode || "quiz" : null,
  }));
}

/** Whether the student already finished a stage since the path was built: a submitted drill of that type created after it. */
export function stageDone(stage, drills, builtAt) {
  if (!stage.drill) return false;
  const since = builtAt ? Date.parse(builtAt) : 0;
  return (drills || []).some((d) => d.type === stage.drill && d.status === "submitted" && Date.parse(d.createdAt || 0) >= since);
}
