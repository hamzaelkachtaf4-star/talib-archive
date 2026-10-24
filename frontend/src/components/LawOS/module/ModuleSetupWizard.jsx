import { useEffect, useState } from "react";
import Sheet from "@/components/LawOS/kit/Sheet";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice } from "@/components/LawOS/ui";
import Law from "@/models/law";
import { tr } from "@/components/LawOS/lib/i18n";

const STEPS = () => [
  { key: "hasPolycopie", title: tr("هل يوجد مطبوع رسمي؟"), options: [[true, tr("نعم")], [false, tr("لا")]] },
  { key: "strategy", title: tr("استراتيجية الدراسة"), options: [["full_course", tr("بناء الدرس كاملاً")], ["per_lecture", tr("متابعة محاضرة بمحاضرة")]] },
  { key: "viewStyle", title: tr("طريقة العرض"), options: [["trail", tr("مسار المراحل")], ["reader", tr("قارئ أكاديمي")], ["tree", tr("شجرة قابلة للطي")], ["axes", tr("محاور المطبوع")]] },
  { key: "depth", title: tr("العمق"), options: [["concise", tr("مختصر ولاصق")], ["detailed", tr("مفصل وشامل")], ["verbatim", tr("غير ملخص")]] },
];

/** Four questions about how the student works on this module; the answers shape the default view and the mentor's depth. */
export default function ModuleSetupWizard({ moduleId, initial, open, onClose, onSaved }) {
  const fromInitial = () => ({ hasPolycopie: initial?.hasPolycopie ?? null, strategy: initial?.strategy ?? null, viewStyle: initial?.viewStyle ?? "reader", depth: initial?.depth ?? "concise" });
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState(fromInitial);
  const [err, setErr] = useState(null);
  // Every time the wizard opens it starts on the first question with the student's CURRENT answers, never stale defaults.
  useEffect(() => { if (open) { setI(0); setAnswers(fromInitial()); setErr(null); } }, [open, initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const steps = STEPS();
  const step = steps[i];
  const last = i === steps.length - 1;
  async function save() {
    const r = await Law.moduleProfileSave(moduleId, { ...answers, setupDone: true });
    if (!r.ok) return setErr(tr("تعذر الحفظ. يلزم الاتصال."));
    onSaved(r.data.profile);
  }
  return (
    <Sheet open={open} onClose={onClose} title={tr("إعداد المادة")}>
      <div className="grid gap-4">
        <p className="text-sm" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{i + 1}/{steps.length}</bdi></p>
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-bold">{step.title}</legend>
          {step.options.map(([value, label]) => {
            const on = answers[step.key] === value;
            return (
              <label key={String(value)} className="flex cursor-pointer items-center gap-3 rounded-xl p-3" style={{ border: `1px solid ${on ? "var(--law-primary)" : "var(--law-border)"}`, background: on ? "var(--law-surface-2)" : "transparent" }}>
                <input type="radio" name={step.key} checked={on} onChange={() => setAnswers((a) => ({ ...a, [step.key]: value }))} />
                <span>{label}</span>
              </label>
            );
          })}
        </fieldset>
        {err && <Notice tone="warn">{err}</Notice>}
        <div className="flex justify-between gap-2">
          <Button3D variant="neutral" onClick={() => (i ? setI(i - 1) : onClose())}>{i ? tr("السابق") : tr("لاحقاً")}</Button3D>
          {last ? <Button3D onClick={save}>{tr("حفظ")}</Button3D> : <Button3D onClick={() => setI(i + 1)} disabled={answers[step.key] === null}>{tr("التالي")}</Button3D>}
        </div>
      </div>
    </Sheet>
  );
}
