import { useEffect, useState } from "react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Field, Input, Select, Textarea, Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

const OPT = (pairs) => [["", tr("غير محدد")], ...pairs];
const FIELDS = () => [
  ["teachingStyle", tr("أسلوب التدريس"), OPT([["reads_polycopie", tr("يقرأ من المطبوع")], ["verbal_detail", tr("يشرح شفهياً بتفصيل")], ["mixed", tr("مزيج")]])],
  ["attendanceFocus", tr("الحضور"), OPT([["strict", tr("صارم")], ["flexible", tr("مرن")], ["unknown", tr("لا أعرف")]])],
  ["examTendency", tr("ميله في الامتحان"), OPT([["definitions", tr("تعريفات")], ["cases", tr("حالات تطبيقية")], ["mixed", tr("مزيج")], ["unknown", tr("لا أعرف")]])],
  ["examFormat", tr("شكل الامتحان"), OPT([["qcm", tr("أسئلة متعددة الخيارات")], ["case", tr("نازلة")], ["direct", tr("أسئلة مباشرة")], ["dissertation", tr("موضوع مقالي")], ["mixed", tr("مزيج")]])],
];

/** What the student has noticed about the professor. Private: nobody else sees it; the mentor uses the exam tendency only to tailor depth. */
export default function ProfessorCard({ moduleId }) {
  const [card, setCard] = useState(null);
  const [msg, setMsg] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { Law.moduleProfessor(moduleId).then((r) => (r.ok ? setCard(r.data.card) : setFailed(true))); }, [moduleId]);
  if (failed) return <Notice tone="warn">{tr("يحتاج اتصالا بالخادم.")}</Notice>;
  if (!card) return null;
  const set = (k, v) => setCard((c) => ({ ...c, [k]: v === "" ? null : v }));
  async function save() {
    const r = await Law.moduleProfessorSave(moduleId, card);
    setMsg(r.ok ? { tone: "ok", text: tr("تم الحفظ.") } : { tone: "warn", text: tr("تعذر الحفظ. يلزم الاتصال.") });
  }
  return (
    <section className="grid gap-3" aria-label={tr("بطاقة الأستاذ")}>
      <Notice tone="muted">{tr("هذه البطاقة خاصة بك ولا يراها أحد.")}</Notice>
      <Field label={tr("اسم الأستاذ")}><Input value={card.name || ""} maxLength={120} onChange={(e) => set("name", e.target.value)} dir="auto" /></Field>
      {FIELDS().map(([k, label, options]) => (
        <Field key={k} label={label}><Select value={card[k] || ""} onChange={(e) => set(k, e.target.value)} options={options} /></Field>
      ))}
      <Field label={tr("ملاحظات")}><Textarea rows={4} maxLength={2000} value={card.notes || ""} onChange={(e) => set("notes", e.target.value)} dir="auto" /></Field>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div><Button3D onClick={save}>{tr("حفظ")}</Button3D></div>
    </section>
  );
}
