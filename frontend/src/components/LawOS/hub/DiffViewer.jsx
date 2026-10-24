import { useMemo, useState } from "react";
import { pairBlocks, wordDiff } from "./wordDiff";
import { tr } from "@/components/LawOS/lib/i18n";

// Never color alone: every change carries a +/− marker and an aria label. Each block isolates its own direction
// (unicode-bidi: plaintext) so mixed Arabic / French paragraphs read correctly in RTL and LTR pages.
const BLOCK = { unicodeBidi: "plaintext", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.9 };
const ADD = { background: "color-mix(in srgb, var(--law-ok) 18%, transparent)", textDecoration: "underline", textDecorationColor: "var(--law-ok)" };
const DEL = { background: "color-mix(in srgb, var(--law-danger) 15%, transparent)", textDecoration: "line-through", textDecorationColor: "var(--law-danger)" };

function Words({ before, after, side }) {
  const parts = useMemo(() => wordDiff(before, after), [before, after]);
  return (
    <p style={BLOCK}>
      {parts.map((p, i) => p.type === "same" ? <span key={i}>{p.text}</span>
        : p.type === "add" ? (side === "before" ? null : <ins key={i} style={ADD} aria-label={tr("مضاف")}>{p.text}</ins>)
        : (side === "after" ? null : <del key={i} style={DEL} aria-label={tr("محذوف")}>{p.text}</del>))}
    </p>
  );
}

function Row({ marker, label, children }) {
  return (
    <div className="flex gap-2 py-1" role="group" aria-label={label}>
      <span aria-hidden="true" className="w-4 shrink-0 text-center font-bold" style={{ fontFamily: "monospace" }}>{marker}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** blocks: [{type: same|add|del, text}] from the server. Unified (default on phones) or split (desktop). */
export default function DiffViewer({ blocks, mode: initial }) {
  const [mode, setMode] = useState(initial || (typeof window !== "undefined" && window.innerWidth >= 1024 ? "split" : "unified"));
  const items = useMemo(() => pairBlocks(blocks || []), [blocks]);
  return (
    <div>
      <div className="mb-2 flex gap-2" role="group" aria-label={tr("طريقة العرض")}>
        {["unified", "split"].map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className="law-chip" data-active={mode === m || undefined}>{m === "unified" ? tr("موحّد") : tr("جنبًا إلى جنب")}</button>
        ))}
      </div>
      <div className="law-card3d" dir="auto">
        {mode === "unified" ? items.map((it, i) => it.type === "same" ? (
          <Row key={i} marker=" " label={tr("دون تغيير")}><p style={{ ...BLOCK, color: "var(--law-muted)" }}>{it.text}</p></Row>
        ) : it.type === "change" ? (
          <Row key={i} marker="±" label={tr("فقرة معدّلة")}><Words before={it.before} after={it.after} /></Row>
        ) : it.type === "add" ? (
          <Row key={i} marker="+" label={tr("فقرة مضافة")}><p style={{ ...BLOCK, ...ADD }}>{it.text}</p></Row>
        ) : (
          <Row key={i} marker="−" label={tr("فقرة محذوفة")}><p style={{ ...BLOCK, ...DEL }}>{it.text}</p></Row>
        )) : (
          <div className="grid gap-x-4 sm:grid-cols-2">
            {items.map((it, i) => (
              <div key={i} className="contents">
                <div className="py-1">{it.type === "same" ? <p style={{ ...BLOCK, color: "var(--law-muted)" }}>{it.text}</p> : it.type === "change" ? <Row marker="−" label={tr("قبل")}><Words before={it.before} after={it.after} side="before" /></Row> : it.type === "del" ? <Row marker="−" label={tr("محذوف")}><p style={{ ...BLOCK, ...DEL }}>{it.text}</p></Row> : <span />}</div>
                <div className="py-1">{it.type === "same" ? <p style={{ ...BLOCK, color: "var(--law-muted)" }}>{it.text}</p> : it.type === "change" ? <Row marker="+" label={tr("بعد")}><Words before={it.before} after={it.after} side="after" /></Row> : it.type === "add" ? <Row marker="+" label={tr("مضاف")}><p style={{ ...BLOCK, ...ADD }}>{it.text}</p></Row> : <span />}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
