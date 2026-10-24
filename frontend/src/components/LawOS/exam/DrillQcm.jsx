import { useState } from "react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";
import { Cite, ScoreLine } from "./drillParts";

/**
 * Multiple choice with instant feedback: choosing an option checks it at once and shows that question's explanation and source.
 * A checked answer is locked (the server keeps the first choice). The key of an unanswered question never leaves the server.
 */
export default function DrillQcm({ drill, onSubmit, busy }) {
  const items = drill.prompt.items;
  const done = drill.status === "submitted";
  const [answers, setAnswers] = useState(() => items.map((_, i) => drill.revealed?.[i]?.chosen ?? null));
  const [revealed, setRevealed] = useState(() => drill.revealed || {});
  const [err, setErr] = useState(null);
  const complete = answers.every((a) => a !== null);

  const final = drill.mode === "final"; // a final exam: change your mind freely, nothing is revealed until the end
  async function choose(i, j) {
    if (done || revealed[i]) return;
    if (final) return setAnswers((a) => a.map((x, k) => (k === i ? j : x)));
    setAnswers((a) => a.map((x, k) => (k === i ? j : x)));
    const r = await Law.examDrillCheck(drill.id, i, j);
    if (!r.ok) { setErr(r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذر التحقق من الإجابة.")); setAnswers((a) => a.map((x, k) => (k === i ? null : x))); return; }
    setErr(null);
    setAnswers((a) => a.map((x, k) => (k === i ? r.data.chosen : x)));
    setRevealed((cur) => ({ ...cur, [i]: r.data }));
  }

  const [cur, setCur] = useState(() => { const i = items.findIndex((_, k) => drill.revealed?.[k] == null); return i < 0 ? items.length - 1 : i; });

  if (!done) {
    const it = items[cur];
    const key = revealed[cur];
    const last = cur === items.length - 1;
    const answeredNow = final ? answers[cur] !== null : !!key;
    const progress = final ? answers.filter((a) => a !== null).length : Object.keys(revealed).length;
    return (
      <div className="grid gap-4">
        <div>
          {final && <p className="mb-1 text-xs font-bold" style={{ color: "var(--law-gold-ink)" }}>{tr("امتحان نهائي: لا جواب يظهر قبل التسليم")}</p>}
          <div className="mb-1 flex items-center justify-between text-xs font-bold" style={{ color: "var(--law-muted)" }}>
            <span>{tr("سؤال {0} من {1}", [cur + 1, items.length])}</span>
            <span><bdi dir="ltr">{progress}/{items.length}</bdi></span>
          </div>
          <span className="block h-2 overflow-hidden rounded-full" style={{ background: "var(--law-surface-2)" }} role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={progress}>
            <span className="block h-full rounded-full" style={{ inlineSize: `${(100 * progress) / items.length}%`, background: "var(--law-accent)", transition: "inline-size 0.3s" }} />
          </span>
        </div>
        <section className="law-card grid gap-3 p-4" aria-label={tr("سؤال {0} من {1}", [cur + 1, items.length])}>
          <p className="text-base font-bold leading-8" dir="auto">{it.question}</p>
          <div className="grid gap-2.5" role="group" aria-label={tr("الخيارات")}>
            {it.options.map((o, j) => {
              const isKey = !!key && key.correctIndex === j;
              const picked = answers[cur] === j;
              const wrong = !!key && picked && !isKey;
              return (
                <button key={j} type="button" aria-pressed={picked} disabled={!!key} onClick={() => choose(cur, j)} className="law-btn3d !justify-start !whitespace-normal text-start" data-variant={final ? (picked ? undefined : "neutral") : isKey ? undefined : wrong ? "danger" : "neutral"} style={{ minBlockSize: "3.25rem", paddingBlock: "0.5rem", opacity: key && !isKey && !wrong ? 0.6 : 1 }}>
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "rgb(0 0 0 / 0.12)" }}><bdi dir="ltr">{String.fromCharCode(65 + j)}</bdi></span>
                  <span className="min-w-0 flex-1" dir="auto">{o}</span>
                  {isKey && <CheckCircle size={20} weight="fill" aria-label={tr("الصحيح")} />}
                  {wrong && <XCircle size={20} weight="fill" aria-label={tr("اختيارك")} />}
                </button>
              );
            })}
          </div>
          {key && (
            <div className="grid gap-1 text-sm" role="status">
              <p className="font-bold" style={{ color: key.correct ? "var(--law-ok)" : "var(--law-danger)" }}>{key.correct ? tr("إجابة صحيحة") : tr("إجابة خاطئة")}</p>
              {key.explanation && <p dir="auto">{key.explanation}</p>}
              <Cite cite={key.cite} />
            </div>
          )}
        </section>
        {err && <p role="alert" className="text-sm" style={{ color: "var(--law-danger)" }}>{err}</p>}
        <div className="flex flex-wrap gap-2">
          {cur > 0 && <Button3D variant="neutral" onClick={() => setCur(cur - 1)}>{tr("السابق")}</Button3D>}
          {!last && <Button3D onClick={() => setCur(cur + 1)} disabled={!answeredNow}>{tr("التالي")}</Button3D>}
          {last && <Button3D variant="gold" onClick={() => onSubmit({ answers })} disabled={!complete || busy}>{busy ? tr("جارٍ التصحيح…") : final ? tr("تسليم الامتحان") : tr("إنهاء وعرض النتيجة")}</Button3D>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {done && <ScoreLine score={drill.score} />}
      {done && final && <p className="text-lg font-bold" role="status">{tr("النقطة")}: <bdi dir="ltr">{(Math.round((drill.score / 5) * 2) / 2).toString()}/20</bdi></p>}
      <ol className="grid gap-4">
        {items.map((it, i) => {
          const res = done ? drill.feedback.items[i] : revealed[i];
          const key = done ? drill.key.items[i] : revealed[i];
          return (
            <li key={i} className="law-card grid gap-2 p-4">
              <fieldset className="grid gap-2">
                <legend className="mb-1 font-bold" dir="auto"><bdi dir="ltr">{i + 1}.</bdi> {it.question}</legend>
                {it.options.map((o, j) => {
                  const chosen = res ? res.chosen === j : answers[i] === j;
                  const isKey = !!key && key.correctIndex === j;
                  return (
                    <label key={j} className="flex cursor-pointer items-center gap-3 rounded-xl p-3" style={{ border: `1px solid ${isKey ? "var(--law-ok)" : chosen ? "var(--law-primary)" : "var(--law-border)"}`, background: "transparent" }}>
                      <input type="radio" name={`q${i}`} checked={chosen} disabled={done || !!revealed[i]} onChange={() => choose(i, j)} />
                      <span className="min-w-0 flex-1" dir="auto">{o}</span>
                      {isKey && <span className="inline-flex items-center gap-1 text-sm font-bold" style={{ color: "var(--law-ok)" }}><CheckCircle size={18} aria-hidden="true" />{tr("الصحيح")}</span>}
                      {key && chosen && !isKey && <span className="inline-flex items-center gap-1 text-sm font-bold" style={{ color: "var(--law-danger)" }}><XCircle size={18} aria-hidden="true" />{tr("اختيارك")}</span>}
                    </label>
                  );
                })}
              </fieldset>
              {key && (
                <div className="grid gap-1 text-sm" role="status">
                  <p className="font-bold" style={{ color: res.correct ? "var(--law-ok)" : "var(--law-danger)" }}>{res.correct ? tr("إجابة صحيحة") : tr("إجابة خاطئة")}</p>
                  {key.explanation && <p dir="auto">{key.explanation}</p>}
                  <Cite cite={key.cite} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {err && <p role="alert" className="text-sm" style={{ color: "var(--law-danger)" }}>{err}</p>}
      {!done && <div><Button3D onClick={() => onSubmit({ answers })} disabled={!complete || busy}>{busy ? tr("جارٍ التصحيح…") : tr("إنهاء وعرض النتيجة")}</Button3D></div>}
    </div>
  );
}
