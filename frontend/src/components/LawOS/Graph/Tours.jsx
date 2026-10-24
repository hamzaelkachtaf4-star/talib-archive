import { useState } from "react";
import { Link } from "react-router-dom";
import { Forward, Back } from "@/components/LawOS/kit/DirArrow";
import { tr } from "@/components/LawOS/lib/i18n";
import { NodeName, colorOf, kindLabel } from "./shared";

/** Guided review paths: each step shows its prompt and the statute text from the corpus; a tour only lists steps that resolved. */
export default function Tours({ index, onPick }) {
  const [open, setOpen] = useState(null); // { tour, i }
  if (!index.tours.length)
    return <p className="law-muted text-sm">{tr("لا توجد مسارات جاهزة بعد. تظهر المسارات عندما تتوفر نصوصها في المرجع.")}</p>;
  if (!open)
    return (
      <ul className="flex flex-col gap-2">
        {index.tours.map((t) => (
          <li key={t.id}>
            <button type="button" className="law-card w-full p-4 text-start" style={{ minBlockSize: 44 }} onClick={() => setOpen({ tour: t, i: 0 })}>
              <span className="block font-bold">{t.titleAr}</span>
              <span className="law-muted text-xs">{tr("{0} محطات", [t.steps.length])}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  const { tour, i } = open;
  const step = tour.steps[i];
  const node = index.nodes.get(step.id);
  const last = i === tour.steps.length - 1;
  return (
    <section aria-label={tour.titleAr}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold">{tour.titleAr}</h2>
        <button type="button" className="text-sm underline" onClick={() => setOpen(null)}>{tr("كل المسارات")}</button>
      </div>
      <ol className="mb-3 flex gap-1" aria-label={tr("المحطات")}>
        {tour.steps.map((s, k) => <li key={s.id} aria-current={k === i ? "step" : undefined} className="h-1.5 flex-1 rounded-full" style={{ background: k <= i ? colorOf(index.nodes.get(s.id)) : "var(--law-border)" }} />)}
      </ol>
      <div className="law-card p-4">
        <p className="mb-1 text-xs font-semibold" style={{ color: colorOf(node) }}>{tr("المحطة {0} من {1}", [i + 1, tour.steps.length])} · {kindLabel(node)}</p>
        <p className="mb-2 text-lg font-bold"><NodeName node={node} /></p>
        <p className="mb-3 leading-8">{step.promptAr}</p>
        {step.text && <p className="law-muted whitespace-pre-wrap border-s-2 ps-3 leading-8" style={{ borderColor: "var(--law-border)" }}>{step.text}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="law-btn law-btn-secondary" onClick={() => onPick(step.id)}>{tr("العلاقات والبطاقات")}</button>
          <Link to="/law/exam/cards" className="law-btn law-btn-secondary">{tr("اختبر فهمك")}</Link>
        </div>
      </div>
      <div className="mt-3 flex justify-between gap-2">
        <button type="button" className="law-btn law-btn-secondary" disabled={i === 0} onClick={() => setOpen({ tour, i: i - 1 })}><Back /> {tr("السابق")}</button>
        <button type="button" className="law-btn law-btn-primary" onClick={() => (last ? setOpen(null) : setOpen({ tour, i: i + 1 }))}>{last ? tr("إنهاء المسار") : tr("التالي")} {!last && <Forward />}</button>
      </div>
    </section>
  );
}
