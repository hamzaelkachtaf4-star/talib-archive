import { TreeStructure, Table, FileText, ListBullets, BookOpen, Cards, Question } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";

/** The seven learning formats of Talib v3 (server enum MODULE_FORMATS): [key, long label, description, badge, icon]. */
export const FORMATS = () => [
  ["tree", tr("خطاطات شجرية"), tr("كل مفهوم يتفرع إلى عناصره"), tr("خطاطات"), TreeStructure],
  ["table", tr("جداول"), tr("العنصر، المضمون، السند"), tr("جداول"), Table],
  ["full", tr("ملخص شامل"), tr("الدرس في نص واحد مترابط"), tr("شامل"), FileText],
  ["brief", tr("ملخص موجز"), tr("الأفكار الأساسية في سطور"), tr("موجز"), ListBullets],
  ["detailed", tr("شرح مفصل مع أمثلة"), tr("كل فكرة مع مثال تطبيقي"), tr("مفصل"), BookOpen],
  ["cards", tr("بطاقات مراجعة"), tr("مفهوم في الوجه، وتعريفه في الظهر"), tr("بطاقات"), Cards],
  ["qa", tr("سؤال وجواب"), tr("أسئلة امتحانية مع أجوبتها"), tr("س/ج"), Question],
];
export const formatInfo = (key) => FORMATS().find((f) => f[0] === key);

/** Cards and Q&A always come last in a session, so the student tests themselves after reading. */
export const ordered = (keys) => [...keys.filter((k) => k !== "cards" && k !== "qa"), ...keys.filter((k) => k === "cards" || k === "qa")];

/** Subject colour dots (server enum MODULE_COLORS). */
export const COLORS = { emerald: "rgb(16 185 129)", violet: "rgb(168 85 247)", orange: "rgb(249 115 22)", cyan: "rgb(6 182 212)", blue: "rgb(59 130 246)", rose: "rgb(244 63 94)", amber: "rgb(245 158 11)", slate: "rgb(100 116 139)" };
export const colorLabel = (k) => ({ emerald: tr("أخضر"), violet: tr("بنفسجي"), orange: tr("برتقالي"), cyan: tr("سماوي"), blue: tr("أزرق"), rose: tr("وردي"), amber: tr("كهرماني"), slate: tr("رمادي") }[k]);

export const SEMESTERS = ["S1", "S2", "S3", "S4", "S5", "S6"];

/** Sample S3 private-law subjects for «جرّب باستعمال زمن نموذجي». They are ordinary subjects the student can delete. */
// Titles are data, not interface text: they stay Arabic so the server's duplicate check matches the seeded curriculum.
export const SAMPLE_MODULES = () => ["المسؤولية المدنية", "قانون الشركات", "قانون الشغل"];
