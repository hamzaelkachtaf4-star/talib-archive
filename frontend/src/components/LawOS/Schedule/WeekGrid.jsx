import { MapPin, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { WEEKDAYS } from "@/components/LawOS/ui";
import { KIND_LABELS } from "./shared";
import { tr } from "@/components/LawOS/lib/i18n";

/** One session in the grid or in a day list: module, CM/TD, room, professor. */
export function SlotCard({ slot, title, onEdit, onDelete }) {
  return (
    <div className="law-card grid gap-1 p-3" style={{ borderInlineStart: `4px solid ${slot.kind === "TD" ? "var(--law-accent)" : "var(--law-primary)"}` }}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold">
          {title ? <bdi>{title}</bdi> : <span style={{ color: "var(--law-warn)" }}>{tr("حصة بدون مادة: أكملها")}</span>}
        </p>
        <span className="flex shrink-0">
          <button type="button" onClick={onEdit} aria-label={tr("تعديل")} className="p-1.5" style={{ color: "var(--law-muted)" }}><PencilSimple size={16} /></button>
          <button type="button" onClick={onDelete} aria-label={tr("حذف")} className="p-1.5" style={{ color: "var(--law-warn)" }}><Trash size={16} /></button>
        </span>
      </div>
      <p className="text-xs tabular-nums" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{slot.startTime}–{slot.endTime}</bdi></p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: slot.kind === "TD" ? "var(--law-accent)" : "var(--law-primary)", color: "var(--law-on-primary)" }}>{slot.kind === "TD" ? "TD" : slot.kind === "TP" ? "TP" : "CM"}</span>
        {slot.room && <span className="flex items-center gap-1" style={{ color: "var(--law-muted)" }}><MapPin size={12} /> <bdi dir="auto">{slot.room}</bdi></span>}
        {slot.professor && <span style={{ color: "var(--law-muted)" }}><bdi dir="auto">{slot.professor}</bdi></span>}
      </div>
    </div>
  );
}

/**
 * The week as a grid: one column per day (Monday to Saturday, Sunday only when a session exists), one row per start time.
 * The time column stays in place when the grid scrolls sideways.
 */
export default function WeekGrid({ slots, days, titleOf, onAdd, onEdit, onDelete, today }) {
  const times = [...new Set(slots.map((s) => s.startTime))].sort();
  const rows = times.length ? times : ["08:30"];
  const cols = `5.5rem repeat(${days.length}, minmax(9rem, 1fr))`;
  return (
    <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--law-border)", background: "var(--law-surface)" }} role="region" aria-label={tr("الأسبوع")} tabIndex={0}>
      <div className="grid min-w-max" style={{ gridTemplateColumns: cols }} role="table">
        <div className="sticky start-0 z-10 p-3" style={{ background: "var(--law-surface)", borderBottom: "1px solid var(--law-border)" }} role="columnheader" />
        {days.map((d) => (
          <div key={d} role="columnheader" className="p-3 text-sm font-bold" style={{ borderBottom: "1px solid var(--law-border)", color: d === today ? "var(--law-primary)" : undefined }}>{WEEKDAYS[d]}</div>
        ))}
        {rows.map((t) => (
          <div key={t} className="contents" role="row">
            <div className="sticky start-0 z-10 p-3 text-sm font-bold tabular-nums" style={{ background: "var(--law-surface)", borderBottom: "1px solid var(--law-border)", borderInlineEnd: "1px solid var(--law-border)" }} role="rowheader"><bdi dir="ltr">{t}</bdi></div>
            {days.map((d) => {
              const here = slots.map((s, index) => ({ s, index })).filter(({ s }) => s.weekday === d && s.startTime === t);
              return (
                <div key={d} role="cell" className="grid content-start gap-2 p-2" style={{ borderBottom: "1px solid var(--law-border)" }}>
                  {here.map(({ s, index }) => <SlotCard key={s.id || index} slot={s} title={titleOf(s)} onEdit={() => onEdit(index)} onDelete={() => onDelete(index)} />)}
                  {!here.length && (
                    <button type="button" onClick={() => onAdd(d, t)} aria-label={`${tr("إضافة حصة")} · ${WEEKDAYS[d]} ${t}`} className="flex min-h-[3.5rem] items-center justify-center rounded-xl opacity-40 transition-opacity hover:opacity-100 focus-visible:opacity-100" style={{ border: "1px dashed var(--law-border)", color: "var(--law-muted)" }}><Plus size={16} /></button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
