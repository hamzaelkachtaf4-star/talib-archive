import { useMemo, useState } from "react";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Field, Input, Notice, Textarea } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { AiLabel, Cite, ScoreLine, Verdict } from "./drillParts";
import { checkOutline, EMPTY_OUTLINE, outlineMessage } from "./outlineRules";

const PART_LABEL = () => ({ intro: tr("مقدمة"), problem: tr("إشكالية"), part1: tr("المبحث الأول"), part2: tr("المبحث الثاني") });

/** Outline builder: مقدمة · إشكالية · المبحث الأول · المبحث الثاني, each مبحث with 2-3 مطالب. Checked live, then critiqued by part. */
export default function DrillDissertation({ drill, onSubmit, busy, error, serverErrors }) {
  const [o, setO] = useState(() => (drill.draft?.outline ? { ...EMPTY_OUTLINE(), ...drill.draft.outline } : EMPTY_OUTLINE())); // a saved draft comes back
  const check = useMemo(() => checkOutline(o), [o]);
  const done = drill.status === "submitted";
  const shown = done ? drill.answer.outline : o;
  const labels = PART_LABEL();
  const setPart = (i, patch) => setO((cur) => ({ ...cur, parts: cur.parts.map((p, k) => (k === i ? { ...p, ...patch } : p)) }));
  const setSub = (i, j, v) => setPart(i, { subs: o.parts[i].subs.map((s, k) => (k === j ? v : s)) });
  const addSub = (i) => o.parts[i].subs.length < 3 && setPart(i, { subs: [...o.parts[i].subs, ""] });
  const dropSub = (i, j) => o.parts[i].subs.length > 2 && setPart(i, { subs: o.parts[i].subs.filter((_, k) => k !== j) });
  const pending = [...new Set([...check.errors, ...(serverErrors || [])])];
  const hint = !done && pending.length > 0;
  return (
    <div className="grid gap-4">
      <section className="law-card p-4"><h3 className="mb-1 font-bold">{tr("الموضوع")}</h3><p dir="auto" className="leading-8">{drill.prompt.topic}</p></section>
      {done && <><ScoreLine score={drill.score} /><AiLabel /></>}

      <section className="law-card grid gap-3 p-4" aria-label={labels.intro}>
        <Field label={labels.intro}>{done ? <p dir="auto" className="whitespace-pre-wrap">{shown.intro}</p> : <Textarea rows={3} maxLength={4000} value={o.intro} onChange={(e) => setO({ ...o, intro: e.target.value })} dir="auto" />}</Field>
        <Field label={labels.problem}>{done ? <p dir="auto" className="whitespace-pre-wrap">{shown.problem}</p> : <Textarea rows={2} maxLength={2000} value={o.problem} onChange={(e) => setO({ ...o, problem: e.target.value })} dir="auto" />}</Field>
      </section>

      {shown.parts.map((p, i) => (
        <section key={i} className="law-card grid gap-2 p-4" aria-label={labels[`part${i + 1}`]}>
          <h3 className="font-bold">{labels[`part${i + 1}`]}</h3>
          {done ? <p className="font-semibold" dir="auto">{p.title}</p> : <Input value={p.title} maxLength={200} onChange={(e) => setPart(i, { title: e.target.value })} aria-label={labels[`part${i + 1}`]} dir="auto" />}
          <ol className="grid gap-2">
            {p.subs.map((s, j) => (
              <li key={j} className="flex items-center gap-2">
                <span className="shrink-0 text-sm" style={{ color: "var(--law-muted)" }}>{j === 0 ? tr("المطلب الأول") : j === 1 ? tr("المطلب الثاني") : tr("المطلب الثالث")}</span>
                {done ? <span dir="auto">{s}</span> : <Input value={s} maxLength={200} onChange={(e) => setSub(i, j, e.target.value)} aria-label={`${labels[`part${i + 1}`]} - ${j + 1}`} dir="auto" />}
                {!done && j >= 2 && <button type="button" onClick={() => dropSub(i, j)} aria-label={tr("حذف المطلب")} className="p-1">×</button>}
              </li>
            ))}
          </ol>
          {!done && o.parts[i].subs.length < 3 && <div><Button3D variant="neutral" onClick={() => addSub(i)}>{tr("مطلب ثالث")}</Button3D></div>}
        </section>
      ))}

      {hint && <Notice tone="muted"><ul className="list-disc ps-5">{pending.map((c) => <li key={c}>{outlineMessage(c)}</li>)}</ul></Notice>}
      {!done && check.warnings.length > 0 && <Notice tone="muted">{check.warnings.map(outlineMessage).join(" ")}</Notice>}
      {error && <Notice tone="warn">{error}</Notice>}

      {done && (
        <section className="law-card grid gap-3 p-4" aria-label={tr("التصحيح")}>
          {drill.feedback.rows.map((r) => (
            <div key={r.key} className="grid gap-1">
              <p className="flex flex-wrap items-center gap-2 font-bold">{labels[r.key] || r.key} <Verdict verdict={r.verdict} /></p>
              {r.comment && <p dir="auto" className="text-sm">{r.comment}</p>}
            </div>
          ))}
          {drill.feedback.improvements?.length > 0 && <ul className="list-disc ps-5 text-sm">{drill.feedback.improvements.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul>}
          <div><h3 className="font-bold">{tr("المحاور المتوقعة في مصادرك")}</h3>
            <ul className="list-disc ps-5 text-sm">{drill.key.keyAxes.map((a, i) => <li key={i} dir="auto">{a.axis} <Cite cite={a.cite} /></li>)}</ul></div>
        </section>
      )}
      {!done && <div><Button3D onClick={() => onSubmit({ outline: o })} disabled={!check.valid || busy}>{busy ? tr("جارٍ التصحيح…") : tr("تسليم للتصحيح")}</Button3D></div>}
    </div>
  );
}
