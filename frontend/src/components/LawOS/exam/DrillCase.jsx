import { useState } from "react";
import { Check } from "@phosphor-icons/react";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice, Textarea } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { AiLabel, Cite, ScoreLine, SECTION_LABEL, Verdict } from "./drillParts";

const MIN = 15;

/** The five steps of the Moroccan practical-case method: read the case, then the four sections, one per step. */
function Stepper({ steps, current, reached, onGo }) {
  return (
    <ol className="flex items-start gap-1" aria-label={tr("خطوات النازلة")}>
      {steps.map((st, i) => {
        const finished = i < current;
        return (
          <li key={st.key} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
            <button type="button" onClick={() => onGo(i)} disabled={i > reached} aria-current={i === current ? "step" : undefined} aria-label={`${i + 1}. ${st.label}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold disabled:opacity-40"
              style={i === current ? { background: "var(--law-accent)", color: "var(--law-on-accent)", boxShadow: "0 3px 0 var(--law-primary)" } : finished ? { background: "var(--law-surface-2)", color: "var(--law-accent)", border: "2px solid var(--law-accent)" } : { background: "var(--law-surface-2)", color: "var(--law-muted)", border: "2px solid var(--law-border)" }}>
              {finished ? <Check size={16} weight="bold" aria-hidden="true" /> : <bdi dir="ltr">{i + 1}</bdi>}
            </button>
            <span className="line-clamp-2 text-[11px] font-semibold leading-4" style={{ color: i === current ? "var(--law-text)" : "var(--law-muted)" }}>{st.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Practical case: read it, then write the four required sections in order, one step each. The student writes before any model answer exists. */
export default function DrillCase({ drill, onSubmit, busy, error }) {
  const sections = drill.prompt.sections;
  const labels = SECTION_LABEL();
  const [text, setText] = useState(() => Object.fromEntries(sections.map((s) => [s, drill.draft?.[s] || ""]))); // a saved draft comes back
  const done = drill.status === "submitted";
  const ready = sections.every((s) => text[s].trim().length >= MIN);
  const steps = [{ key: "read", label: tr("قراءة النازلة") }, ...sections.map((s) => ({ key: s, label: labels[s] }))];
  const [step, setStep] = useState(0);
  // Reading and the first section are open; each later section opens once the one before it is long enough. Going back is always allowed.
  const valid = (i) => i <= 1 || text[sections[i - 2]].trim().length >= MIN;
  let reached = 0;
  while (reached < steps.length - 1 && valid(reached + 1)) reached++;
  if (!done) {
    const key = steps[step].key;
    const last = step === steps.length - 1;
    return (
      <div className="grid gap-4">
        <Stepper steps={steps} current={step} reached={reached} onGo={setStep} />
        <section className="law-card grid gap-2 p-4" aria-label={steps[step].label}>
          {step === 0 ? (
            <>
              <h3 className="font-bold">{tr("وقائع النازلة")}</h3>
              <p dir="auto" className="whitespace-pre-wrap leading-8">{drill.prompt.facts}</p>
              <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("اقرأ النازلة جيداً، ثم اكتب بنفسك كل قسم قبل أن يظهر أي حل.")}</p>
            </>
          ) : (
            <>
              <h3 className="font-bold"><bdi dir="ltr">{step}.</bdi> {labels[key]}</h3>
              <Textarea rows={6} value={text[key]} maxLength={6000} onChange={(e) => setText((t) => ({ ...t, [key]: e.target.value }))} dir="auto" aria-label={labels[key]} autoFocus />
              {text[key].trim().length < MIN && text[key].length > 0 && <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("اكتب {0} أحرف على الأقل.", [MIN])}</p>}
            </>
          )}
        </section>
        {error && <Notice tone="warn">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          {step > 0 && <Button3D variant="neutral" onClick={() => setStep(step - 1)}>{tr("السابق")}</Button3D>}
          {!last && <Button3D onClick={() => setStep(step + 1)} disabled={step > 0 && text[key].trim().length < MIN}>{tr("التالي")}</Button3D>}
          {last && <Button3D variant="gold" onClick={() => onSubmit({ answer: text })} disabled={!ready || busy}>{busy ? tr("جارٍ التصحيح…") : tr("تسليم للتصحيح")}</Button3D>}
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <section className="law-card grid gap-2 p-4" aria-label={labels.facts}>
        <h3 className="font-bold">{tr("وقائع النازلة")}</h3>
        <p dir="auto" className="whitespace-pre-wrap leading-8">{drill.prompt.facts}</p>
      </section>
      {done && <><ScoreLine score={drill.score} /><AiLabel /></>}
      {sections.map((s, i) => {
        const row = done ? drill.feedback.rows.find((r) => r.key === s) : null;
        const points = done ? drill.key.keyPoints.filter((k) => k.section === s) : [];
        return (
          <section key={s} className="law-card grid gap-2 p-4" aria-label={labels[s]}>
            <h3 className="font-bold"><bdi dir="ltr">{i + 1}.</bdi> {labels[s]}</h3>
            {done ? <p dir="auto" className="whitespace-pre-wrap">{drill.answer[s]}</p> : (
              <Textarea rows={4} value={text[s]} maxLength={6000} onChange={(e) => setText((t) => ({ ...t, [s]: e.target.value }))} dir="auto" aria-label={labels[s]} />
            )}
            {!done && text[s].trim().length < MIN && text[s].length > 0 && <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("اكتب {0} أحرف على الأقل.", [MIN])}</p>}
            {row && (
              <div className="grid gap-1" style={{ borderTop: "1px solid var(--law-border)", paddingBlockStart: 8 }}>
                <Verdict verdict={row.verdict} />
                {row.comment && <p dir="auto" className="text-sm">{row.comment}</p>}
                {points.length > 0 && (
                  <div className="text-sm"><p className="font-semibold">{tr("نقاط الحل المرجعية")}</p>
                    <ul className="list-disc ps-5">{points.map((k, j) => <li key={j} dir="auto">{k.point} <Cite cite={k.cite} /></li>)}</ul></div>
                )}
              </div>
            )}
          </section>
        );
      })}
      {done && (drill.feedback.strengths?.length > 0 || drill.feedback.improvements?.length > 0) && (
        <section className="law-card grid gap-2 p-4">
          {drill.feedback.strengths?.length > 0 && <><h3 className="font-bold">{tr("ما أحسنته")}</h3><ul className="list-disc ps-5 text-sm">{drill.feedback.strengths.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul></>}
          {drill.feedback.improvements?.length > 0 && <><h3 className="font-bold">{tr("ما يمكن تحسينه")}</h3><ul className="list-disc ps-5 text-sm">{drill.feedback.improvements.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul></>}
        </section>
      )}
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}
