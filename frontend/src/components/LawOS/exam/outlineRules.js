// Client mirror of the server's dissertation skeleton rules (server/utils/law/drills/validate.js validateOutline): the same
// codes, so the builder can show what is missing before submitting. The server stays the authority.
import { tr } from "@/components/LawOS/lib/i18n";

export function checkOutline(o) {
  const errors = [];
  const warnings = [];
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const intro = str(o?.intro, 4000);
  const problem = str(o?.problem, 2000);
  if (intro.length < 10) errors.push("intro_missing");
  if (problem.length < 10) errors.push("problem_missing");
  else if (!/[?؟]/.test(problem)) errors.push("problem_not_a_question");
  const parts = Array.isArray(o?.parts) ? o.parts : [];
  if (parts.length !== 2) errors.push("two_parts_required");
  const clean = parts.slice(0, 2).map((p) => ({ title: str(p?.title, 200), subs: (Array.isArray(p?.subs) ? p.subs : []).map((x) => str(x, 200)) }));
  clean.forEach((p, i) => {
    if (p.title.length < 3) errors.push(`part${i + 1}_title_missing`);
    if (p.subs.length < 2 || p.subs.length > 3 || p.subs.some((x) => x.length < 3)) errors.push(`part${i + 1}_needs_2_or_3_subsections`);
  });
  const titles = [...clean.map((p) => p.title), ...clean.flatMap((p) => p.subs)].filter(Boolean);
  if (new Set(titles).size !== titles.length) errors.push("duplicate_titles");
  if (clean.length === 2 && clean[0].subs.length !== clean[1].subs.length) warnings.push("unbalanced_parts");
  return { valid: errors.length === 0, errors, warnings };
}

export const outlineMessage = (code) => ({
  intro_missing: tr("اكتب مقدمة من جملة كاملة على الأقل."),
  problem_missing: tr("اكتب الإشكالية."),
  problem_not_a_question: tr("الإشكالية سؤال: أنهِها بعلامة استفهام."),
  two_parts_required: tr("التصميم يتألف من مبحثين."),
  part1_title_missing: tr("أعطِ المبحث الأول عنواناً."),
  part2_title_missing: tr("أعطِ المبحث الثاني عنواناً."),
  part1_needs_2_or_3_subsections: tr("المبحث الأول يحتاج مطلبين أو ثلاثة بعناوين."),
  part2_needs_2_or_3_subsections: tr("المبحث الثاني يحتاج مطلبين أو ثلاثة بعناوين."),
  duplicate_titles: tr("لا تكرر العنوان نفسه."),
  unbalanced_parts: tr("نصيحة: اجعل عدد المطالب متساوياً في المبحثين."),
  invalid_outline: tr("التصميم غير مكتمل."),
}[code] || code);

export const EMPTY_OUTLINE = () => ({ intro: "", problem: "", parts: [{ title: "", subs: ["", ""] }, { title: "", subs: ["", ""] }] });
