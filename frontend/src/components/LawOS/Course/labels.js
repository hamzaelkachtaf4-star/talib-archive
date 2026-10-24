import { tr } from "@/components/LawOS/lib/i18n";

// Labels for the course screens. Arabic text is the i18n key (see lib/i18n.js); functions, so they are read after the
// dictionary has loaded.

export const GAP_KIND = () => ({
  PRESCRIPTION: tr("أجل أو تقادم"),
  SANCTION: tr("جزاء"),
  CONDITIONS: tr("شروط والتزامات"),
  EXCEPTION: tr("استثناء"),
  DEFINITION: tr("تعريف"),
  OTHER: tr("حكم"),
  MISSING_SECTION: tr("موضوع لم تتناوله"),
});

export const GAP_STATUS = () => ({
  OPEN: tr("مقترحة"),
  CONFIRMED: tr("مؤكدة"),
  DISMISSED: tr("مستبعدة"),
  DRILLED: tr("جرى اختبارها"),
  RESOLVED: tr("تم تجاوزها"),
  COVERED: tr("غطّتها ملاحظاتك"),
});

/** high / medium / low, in words as well as colour. */
export function severityBand(severity) {
  if (severity >= 6) return { key: "high", label: tr("أهمية عالية"), color: "var(--law-danger)" };
  if (severity >= 3) return { key: "mid", label: tr("أهمية متوسطة"), color: "var(--law-warn)" };
  return { key: "low", label: tr("أهمية منخفضة"), color: "var(--law-muted)" };
}

export const IMPORT_ERRORS = () => ({
  offline: tr("لا اتصال بالخادم."),
  not_found: tr("لم يُعثر على الملف المرفوع."),
  not_a_notebook: tr("هذا الملف ليس دفتر ملاحظات بصيغة CherryTree."),
  not_sqlite: tr("هذا الملف ليس دفتر ملاحظات بصيغة CherryTree (.ctb)."),
  bad_schema: tr("بنية الدفتر غير مدعومة."),
  too_large: tr("الدفتر كبير جدا."),
  too_many_nodes: tr("عدد العقد في الدفتر يتجاوز الحد المسموح."),
  timeout: tr("استغرقت قراءة الدفتر وقتا طويلا."),
  unreadable: tr("تعذرت قراءة الدفتر."),
  rate_limited: tr("بلغت الحد اليومي. حاول غدا."),
  import_failed: tr("تعذر الاستيراد. لم يُحفظ شيء."),
  no_such_course: tr("لم تُختر أي مادة."),
  invalid_rootNodeIds: tr("اختيار غير صالح."),
});

export const ANALYSIS_ERRORS = () => ({
  not_found: tr("لم يُعثر على المادة."),
  rate_limited: tr("بلغت الحد اليومي للتحليل. حاول غدا."),
  invalid_codes: tr("اختيار النصوص غير صالح."),
  analysis_timeout: tr("استغرق التحليل وقتا طويلا."),
  course_too_large: tr("المادة كبيرة جدا للتحليل."),
  analysis_failed: tr("تعذر التحليل."),
});

/** "Code" names shown for the corpus codes the radar compares with. */
export const CODE_NAME = (slug) => ({ DOC: tr("قانون الالتزامات والعقود"), CCOM: tr("مدونة التجارة") }[slug] || slug);
