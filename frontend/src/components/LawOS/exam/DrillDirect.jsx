import { useState } from "react";
import Button3D from "@/components/LawOS/kit/Button3D";
import Chip from "@/components/LawOS/kit/Chip";
import { Notice, Textarea } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { AiLabel, Cite, ScoreLine, Verdict } from "./drillParts";

/** Direct theory questions (definitions, distinctions). The reference answer appears only after submission. */
export default function DrillDirect({ drill, onSubmit, busy, error }) {
  const items = drill.prompt.items;
  const [answers, setAnswers] = useState(() => items.map((_, i) => drill.draft?.answers?.[i] || "")); // a saved draft comes back
  const done = drill.status === "submitted";
  const ready = answers.every((a) => a.trim().length >= 3);
  return (
    <div className="grid gap-4">
      {done && <><ScoreLine score={drill.score} /><AiLabel /></>}
      <ol className="grid gap-4">
        {items.map((it, i) => {
          const row = done ? drill.feedback.rows[i] : null;
          const key = done ? drill.key.items[i] : null;
          return (
            <li key={i} className="law-card grid gap-2 p-4">
              <p className="flex flex-wrap items-center gap-2 font-bold" dir="auto"><bdi dir="ltr">{i + 1}.</bdi> {it.question} <Chip>{it.kind === "distinction" ? tr("تمييز") : tr("تعريف")}</Chip></p>
              {done ? <p dir="auto" className="whitespace-pre-wrap">{drill.answer.answers[i]}</p> : (
                <Textarea rows={3} maxLength={3000} value={answers[i]} onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.value : x)))} dir="auto" aria-label={it.question} />
              )}
              {row && (
                <div className="grid gap-1" style={{ borderTop: "1px solid var(--law-border)", paddingBlockStart: 8 }}>
                  <Verdict verdict={row.verdict} />
                  {row.comment && <p dir="auto" className="text-sm">{row.comment}</p>}
                  <p className="text-sm"><span className="font-semibold">{tr("الجواب المرجعي:")}</span> <span dir="auto">{key.referenceAnswer}</span></p>
                  <Cite cite={key.cite} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {error && <Notice tone="warn">{error}</Notice>}
      {!done && <div><Button3D onClick={() => onSubmit({ answers })} disabled={!ready || busy}>{busy ? tr("جارٍ التصحيح…") : tr("تسليم للتصحيح")}</Button3D></div>}
    </div>
  );
}
