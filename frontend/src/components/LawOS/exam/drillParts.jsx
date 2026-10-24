import { CheckCircle, WarningCircle, XCircle } from "@phosphor-icons/react";
import Chip from "@/components/LawOS/kit/Chip";
import { tr } from "@/components/LawOS/lib/i18n";

// Never colour alone: every verdict has an icon and a word.
const V = () => ({ good: [CheckCircle, tr("وافٍ"), "var(--law-ok)"], partial: [WarningCircle, tr("ناقص"), "var(--law-warn)"], missing: [XCircle, tr("غائب أو خاطئ"), "var(--law-danger)"] });

export function Verdict({ verdict }) {
  const [Icon, label, color] = V()[verdict] || V().missing;
  return <span className="inline-flex items-center gap-1 text-sm font-bold" style={{ color }}><Icon size={18} aria-hidden="true" />{label}</span>;
}

export const SECTION_LABEL = () => ({ facts: tr("الوقائع"), issue: tr("الإشكال القانوني"), rule: tr("القاعدة القانونية"), solution: tr("الحل وتطبيق القانون") });

export function ScoreLine({ score }) {
  return <p className="text-lg font-bold">{tr("النتيجة:")} <bdi dir="ltr">{score}/100</bdi></p>;
}

export const AiLabel = () => <Chip>{tr("تصحيح بالذكاء الاصطناعي من مصادرك")}</Chip>;

/** On every drill from the moment it exists: the questions were written by AI from the student's own material. */
export const GeneratedLabel = () => <Chip>{tr("تمرين أعدّه الذكاء الاصطناعي من مصادرك")}</Chip>;

/** Where a reference point came from, as the student's own source/note title. */
export function Cite({ cite }) {
  return cite?.title ? <span className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("المصدر:")} <bdi>{cite.title}</bdi></span> : null;
}
