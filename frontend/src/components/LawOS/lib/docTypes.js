import { tr } from "@/components/LawOS/lib/i18n";

/** Document types of a public note (server enum NOTE_DOC_TYPES): the forum tabs. */
export const DOC_TYPES = () => [
  ["full_course", tr("مواد كاملة")],
  ["session", tr("حصص وتفريغات")],
  ["summary", tr("تلخيصات ومذكرات")],
  ["reference", tr("مراجع ومطبوعات")],
  ["case", tr("نوازل وتطبيقات")],
];
export const docTypeLabel = (k) => DOC_TYPES().find(([x]) => x === k)?.[1] || null;
