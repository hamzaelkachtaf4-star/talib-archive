import { useState } from "react";
import { Check } from "@phosphor-icons/react";
import Button3D from "@/components/LawOS/kit/Button3D";
import { tr } from "@/components/LawOS/lib/i18n";
import { Cite } from "./drillParts";

/** Cards mode: the question on the front, the right answer and why on the back. No typing, no score; finishing just closes the set. */
export default function DrillCards({ drill, onSubmit, busy }) {
  const items = drill.study || drill.key?.items || [];
  const done = drill.status === "submitted";
  const [flipped, setFlipped] = useState({});
  const seen = Object.values(flipped).filter(Boolean).length;
  return (
    <div className="grid gap-4">
      <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("اقلب كل بطاقة لترى الجواب الصحيح وسببه. لا كتابة ولا نقطة هنا.")}</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}>
        {items.map((it, i) => {
          const on = !!flipped[i];
          return (
            <button key={i} type="button" aria-pressed={on} onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))} className="relative p-0" style={{ perspective: "900px", minBlockSize: "13rem", background: "transparent", border: 0 }}>
              <span className="absolute inset-0 block" style={{ transformStyle: "preserve-3d", transform: on ? "rotateY(180deg)" : "none", transition: "transform 0.5s" }}>
                <span aria-hidden={on || undefined} className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-4 text-center" style={{ backfaceVisibility: "hidden", background: "var(--law-surface-2)", borderColor: "var(--law-border)" }}>
                  <span className="text-sm font-bold leading-7" dir="auto">{it.question}</span>
                  <span className="text-[11px]" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{i + 1}/{items.length}</bdi> · {tr("اضغط لقلب البطاقة")}</span>
                </span>
                <span aria-hidden={!on || undefined} className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-auto rounded-2xl p-4 text-center" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "var(--law-accent)", color: "var(--law-on-accent)" }}>
                  <span className="text-sm font-bold leading-7" dir="auto">{it.options?.[it.correctIndex]}</span>
                  {it.explanation && <span className="text-xs leading-6 opacity-90" dir="auto">{it.explanation}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {items.some((it) => it.cite?.title) && <p className="flex flex-wrap gap-2 text-xs">{items.map((it, i) => flipped[i] && <Cite key={i} cite={it.cite} />)}</p>}
      {!done && <div className="flex flex-wrap items-center gap-3"><Button3D onClick={() => onSubmit({})} disabled={busy}><Check size={18} weight="bold" aria-hidden="true" />{tr("أنهيت المراجعة")}</Button3D><span className="text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{seen}/{items.length}</bdi> {tr("بطاقات قلبتها")}</span></div>}
    </div>
  );
}
