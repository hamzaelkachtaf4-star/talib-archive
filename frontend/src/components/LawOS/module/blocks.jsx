import { useState } from "react";
import { CaretDown, Lightning, PencilSimple, Scales, TreeStructure } from "@phosphor-icons/react";
import Button3D from "@/components/LawOS/kit/Button3D";
import { tr } from "@/components/LawOS/lib/i18n";
import { exampleOf, qaOf } from "./angles";

const line = { background: "var(--law-border)" };

/** The unit as the trunk of a tree with its hierarchical branches and connectors. */
export function TreeBlock({ unit, branches, onOpen, onViewFullTree }) {
  return (
    <div className="flex flex-col items-center py-2" role="group" aria-label={tr("شجرة الحصة")}>
      {/* Root Node (Session / Trunk) */}
      <div className="flex max-w-full flex-col items-center">
        <button
          type="button"
          onClick={() => onOpen(unit)}
          className="law-btn3d max-w-full text-base font-bold shadow-md"
          aria-label={tr("تعديل: {0}", [unit.title])}
        >
          <span className="truncate text-center"><bdi>{unit.title}</bdi></span>
          <PencilSimple size={16} aria-hidden="true" />
        </button>
      </div>

      {branches.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--law-muted)" }}>
          {tr("لا فروع في هذه الوحدة بعد.")}
        </p>
      ) : (
        <>
          <span aria-hidden="true" className="h-6 w-0.5" style={line} />
          {/* Hierarchical branches tree */}
          <div className="grid w-full max-w-2xl gap-3">
            {branches.map((b, idx) => (
              <div
                key={b.id}
                className="relative flex items-start gap-3 rounded-2xl border-2 p-3.5 transition-shadow hover:shadow-sm"
                style={{
                  background: "var(--law-surface-2)",
                  borderColor: "var(--law-border)",
                }}
              >
                {/* Branch index stem */}
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                  style={{
                    background: "var(--law-surface)",
                    color: "var(--law-accent)",
                    border: "1px solid var(--law-border)",
                  }}
                >
                  <bdi dir="ltr">{idx + 1}</bdi>
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpen(b.node)}
                      className="text-start text-sm font-bold leading-6 hover:underline"
                    >
                      <bdi>{b.title}</bdi>
                    </button>
                    {b.refs && b.refs[0] && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: "var(--law-surface)",
                          color: "var(--law-gold-ink)",
                        }}
                      >
                        <Scales size={12} aria-hidden="true" />
                        <bdi dir="auto">{b.refs[0]}</bdi>
                      </span>
                    )}
                  </div>
                  {b.summary && (
                    <p
                      className="mt-1 text-xs leading-6"
                      style={{ color: "var(--law-muted)" }}
                    >
                      <bdi>{b.summary}</bdi>
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onOpen(b.node)}
                  aria-label={tr("تعديل: {0}", [b.title])}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ color: "var(--law-muted)" }}
                >
                  <PencilSimple size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Button to view the full curriculum tree A to Z */}
      {onViewFullTree && (
        <div className="mt-4 pt-2">
          <Button3D variant="neutral" onClick={onViewFullTree}>
            <span className="flex items-center gap-1.5">
              <TreeStructure size={16} aria-hidden="true" />
              <span>{tr("عرض الشجرة الكاملة للمادة من أ حتى لـ ز")}</span>
            </span>
          </Button3D>
        </div>
      )}
    </div>
  );
}

/** Element, content and legal reference, one row per branch. */
export function TableBlock({ branches, onOpen }) {
  if (!branches.length) return <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا فروع في هذه الوحدة بعد.")}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--law-border)" }}>
      <table className="w-full min-w-[34rem] border-collapse text-start text-sm leading-7">
        <thead>
          <tr style={{ background: "var(--law-surface-2)" }}>
            <th scope="col" className="w-1/4 p-3 text-start font-bold">{tr("العنصر")}</th>
            <th scope="col" className="p-3 text-start font-bold">{tr("المضمون")}</th>
            <th scope="col" className="w-1/5 p-3 text-start font-bold">{tr("السند")}</th>
          </tr>
        </thead>
        <tbody>
          {branches.map((r) => (
            <tr key={r.id} style={{ borderBlockStart: "1px solid var(--law-border)" }}>
              <th scope="row" className="p-3 text-start align-top font-bold"><button type="button" onClick={() => onOpen(r.node)} className="text-start font-bold"><bdi>{r.title}</bdi></button></th>
              <td className="p-3 align-top" style={{ color: "var(--law-muted)" }}><bdi>{r.body || "—"}</bdi></td>
              <td className="p-3 align-top font-semibold" style={{ color: "var(--law-gold-ink)" }}>{r.refs.length ? r.refs.map((x) => <span key={x} className="block"><bdi dir="auto">{x}</bdi></span>) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Flip cards: the heading on the front, the student's own text on the back. */
export function FlipCards({ branches }) {
  const [flipped, setFlipped] = useState({});
  const list = branches.filter((b) => b.body);
  if (!list.length) return <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا نص كافٍ في هذه الوحدة لبناء بطاقات.")}</p>;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(11.5rem, 1fr))" }}>
      {list.map((b) => {
        const on = !!flipped[b.id];
        return (
          <button key={b.id} type="button" aria-pressed={on} onClick={() => setFlipped((f) => ({ ...f, [b.id]: !f[b.id] }))} className="relative h-40 p-0" style={{ perspective: "900px", background: "transparent", border: 0 }}>
            <span className="absolute inset-0 block" style={{ transformStyle: "preserve-3d", transform: on ? "rotateY(180deg)" : "none", transition: "transform 0.5s" }}>
              <span aria-hidden={on || undefined} className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center" style={{ backfaceVisibility: "hidden", background: "var(--law-surface-2)", borderColor: "var(--law-border)" }}>
                <span className="text-sm font-bold leading-6"><bdi>{b.title}</bdi></span>
                <span className="text-[11px]" style={{ color: "var(--law-muted)" }}>{tr("اضغط لقلب البطاقة")}</span>
              </span>
              <span aria-hidden={!on || undefined} className="absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl p-3 text-center" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "var(--law-accent)", color: "var(--law-on-accent)" }}>
                <span className="text-xs font-semibold leading-6"><bdi>{b.body.length > 150 ? `${b.body.slice(0, 150)}…` : b.body}</bdi></span>
                {b.refs[0] && <span className="text-[11px] font-bold opacity-90"><bdi dir="auto">{b.refs[0]}</bdi></span>}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Questions built from the headings; the answer is the student's own text. */
export function QaList({ branches }) {
  const [open, setOpen] = useState({});
  const qa = qaOf(branches, (t) => tr("ما المقصود بـ«{0}»؟", [t]));
  if (!qa.length) return <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا نص كافٍ في هذه الوحدة لبناء بطاقات.")}</p>;
  return (
    <>
      <p className="mb-2 text-xs" style={{ color: "var(--law-muted)" }}>{tr("الأسئلة مبنية من عناوين دروسك، والجواب هو نصك أنت.")}</p>
      <ul className="grid gap-2">
        {qa.map((x) => {
          const on = !!open[x.id];
          return (
            <li key={x.id} className="overflow-hidden rounded-2xl border-2" style={{ borderColor: "var(--law-border)" }}>
              <button type="button" aria-expanded={on} onClick={() => setOpen((o) => ({ ...o, [x.id]: !o[x.id] }))} className="flex w-full items-center gap-3 p-3 text-start" style={{ background: "var(--law-surface)" }}>
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold" style={{ background: "var(--law-surface-2)", color: "var(--law-gold-ink)" }}>{tr("س")}</span>
                <span className="min-w-0 flex-1 text-sm font-bold"><bdi>{x.q}</bdi></span>
                <CaretDown size={16} style={{ transform: on ? "rotate(180deg)" : "none", transition: "transform 0.3s" }} aria-hidden="true" />
              </button>
              {on && (
                <div className="flex gap-3 p-3 pt-0">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold" style={{ background: "var(--law-accent)", color: "var(--law-on-accent)" }}>{tr("ج")}</span>
                  <p className="text-sm leading-7" style={{ color: "var(--law-muted)" }}><bdi>{x.a}</bdi>{x.refs[0] && <span className="ms-1 font-semibold" style={{ color: "var(--law-gold-ink)" }}>(<bdi dir="auto">{x.refs[0]}</bdi>)</span>}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The whole text as one connected passage. */
export function FullBlock({ unit, branches }) {
  return (
    <div className="grid gap-3 text-[1.0625rem] leading-[2.05]" style={{ fontFamily: '"Noto Naskh Arabic", serif' }}>
      {unit.body && !branches[0]?.fromBody && <p><bdi>{unit.body}</bdi></p>}
      {branches.map((b) => (
        <p key={b.id}><strong className="text-[0.95rem]" style={{ fontFamily: "inherit" }}><bdi>{b.title}</bdi>: </strong><bdi>{b.body}</bdi>{b.refs[0] && <span className="ms-1 text-sm" style={{ color: "var(--law-gold-ink)" }}>(<bdi dir="auto">{b.refs[0]}</bdi>)</span>}</p>
      ))}
    </div>
  );
}

/** The key ideas, one line each. */
export function BriefBlock({ branches }) {
  return (
    <ul className="grid gap-2">
      {branches.map((b) => (
        <li key={b.id} className="flex items-baseline gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm leading-7" style={{ background: "var(--law-surface-2)" }}>
          <Lightning size={16} weight="fill" style={{ color: "var(--law-gold)" }} aria-hidden="true" />
          <span><strong><bdi>{b.title}</bdi></strong>{b.summary && <> — <bdi>{b.summary}</bdi></>}</span>
        </li>
      ))}
    </ul>
  );
}

/** Each idea with its article and, when the student wrote one, a worked example in its own box. */
export function DetailedBlock({ unit, branches }) {
  return (
    <div className="grid gap-3">
      {unit.body && !branches[0]?.fromBody && <p className="text-[0.95rem] leading-8" style={{ color: "var(--law-muted)" }}><bdi>{unit.body}</bdi></p>}
      {branches.map((b) => {
        const ex = exampleOf(b.raw || b.body);
        return (
          <article key={b.id} className="rounded-2xl border-2 p-4" style={{ borderColor: "var(--law-border)" }}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-base font-bold"><bdi>{b.title}</bdi></h4>
              {b.refs[0] && <span className="whitespace-nowrap text-xs font-semibold" style={{ color: "var(--law-gold-ink)" }}><bdi dir="auto">{b.refs[0]}</bdi></span>}
            </div>
            {b.body && <p className="mt-1.5 text-sm leading-8" style={{ color: "var(--law-muted)" }}><bdi>{b.body}</bdi></p>}
            {ex && <div className="mt-2.5 rounded-xl p-3 text-sm leading-7" style={{ background: "var(--law-surface-2)" }}><strong style={{ color: "var(--law-accent)" }}>{tr("مثال:")} </strong><bdi>{ex}</bdi></div>}
          </article>
        );
      })}
    </div>
  );
}
