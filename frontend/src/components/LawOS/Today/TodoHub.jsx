import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaretUp, CaretDown, Trash, PencilSimple, Plus, DotsSixVertical, X } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";
import MascotSlot from "@/components/LawOS/kit/MascotSlot";
import Chip from "@/components/LawOS/kit/Chip";
import { addTodo, editTodo, loadTodos, moveTodo, onTodosChange, putTodo, removeTodo, syncTodos, toggleTodo } from "@/components/LawOS/lib/todoStore";
import { allDoneToday, filterTodos, lateCount, nextPriority, withAuto } from "./todoModel";

const PRIORITY_LABEL = () => ({ high: tr("عالية"), medium: tr("متوسطة"), normal: tr("عادية") });
const PRIORITY_COLOR = { high: "var(--law-danger)", medium: "var(--law-warn)", normal: "var(--law-muted)" };

const FILTER_LABEL = () => ({ today: tr("اليوم"), late: tr("المتأخر"), all: tr("الكل") });

/** One row. Computed items (auto) are shown like any other; acting on them stores them. */
function Row({ t, index, count, onMove, dragProps, canUp, canDown, onDismiss }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(t.title);
  const input = useRef(null);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  // A title changed by sync (another device) must not be overwritten by a stale buffer.
  useEffect(() => { if (!editing) setText(t.title); }, [t.title, editing]);
  const startEdit = () => { setText(t.title); setEditing(true); };
  const commit = async () => {
    setEditing(false);
    if (text.trim() && text.trim() !== t.title) await editTodo(t, text);
    else setText(t.title);
  };
  const btn = "flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30";
  const prio = t.priority || "normal";
  const priorityChip = (
    <button type="button" disabled={t.auto} onClick={() => putTodo(t, { priority: nextPriority(prio) })} aria-label={tr("الأولوية: {0}", [PRIORITY_LABEL()[prio]])}
      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: PRIORITY_COLOR[prio], border: `1px solid ${PRIORITY_COLOR[prio]}` }}>{PRIORITY_LABEL()[prio]}</button>
  );
  if (t.auto)
    return (
      <li className="my-1 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--law-surface-2)", borderInlineStart: "3px solid var(--law-primary)" }}>
        <input type="checkbox" checked={t.done} onChange={() => toggleTodo(t)} aria-label={tr("إنجاز: {0}", [t.title])} className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate" style={t.done ? { textDecoration: "line-through", color: "var(--law-muted)" } : undefined}><bdi>{t.title}</bdi></span>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--law-bg)", color: "var(--law-muted)" }}>{tr("تلقائي")}</span>
        {t.priority === "high" && priorityChip}
        <button type="button" className={btn} onClick={() => onDismiss?.(t.clientId)} aria-label={tr("إخفاء لهذا اليوم")} title={tr("إخفاء لهذا اليوم")}><X size={16} /></button>
      </li>
    );
  return (
    <li className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--law-border)" }} {...dragProps}>
      <span className="hidden cursor-grab sm:block" style={{ color: "var(--law-muted)" }} aria-hidden="true"><DotsSixVertical size={18} /></span>
      <input type="checkbox" checked={t.done} onChange={() => toggleTodo(t)} aria-label={tr("إنجاز: {0}", [t.title])} className="h-5 w-5 shrink-0" />
      {editing ? (
        <input ref={input} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setText(t.title); setEditing(false); } }}
          className="law-input min-w-0 flex-1" aria-label={tr("تعديل المهمة")} />
      ) : (
        <button type="button" onClick={startEdit} className="min-w-0 flex-1 truncate text-start" style={t.done ? { textDecoration: "line-through", color: "var(--law-muted)" } : undefined}>
          <bdi>{t.title}</bdi>
          {t.dueDate && <span className="ms-2 text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{t.dueDate}</bdi></span>}
        </button>
      )}
      {priorityChip}
      <button type="button" className={btn} onClick={startEdit} aria-label={tr("تعديل المهمة")}><PencilSimple size={16} /></button>
      <button type="button" className={btn} disabled={!canUp} onClick={() => onMove(index, index - 1)} aria-label={tr("نقل للأعلى")}><CaretUp size={16} /></button>
      <button type="button" className={btn} disabled={!canDown} onClick={() => onMove(index, index + 1)} aria-label={tr("نقل للأسفل")}><CaretDown size={16} /></button>
      <button type="button" className={btn} onClick={() => removeTodo(t)} aria-label={tr("حذف المهمة")} style={{ color: "var(--law-danger)" }}><Trash size={16} /></button>
    </li>
  );
}

/**
 * The daily to-do hub (full width at the top of Today). `auto` are computed items (today's lectures, due cards);
 * `today` is the Casablanca date. Reports "everything done" through onAllDone for the celebration.
 */
export default function TodoHub({ auto, today, onAllDone, onDismiss }) {
  const [stored, setStored] = useState([]);
  const [filter, setFilter] = useState("today");
  const [draft, setDraft] = useState("");
  const [priority, setPriority] = useState("normal");
  const dragFrom = useRef(null);

  const refresh = useCallback(() => loadTodos().then(setStored).catch(() => {}), []);
  useEffect(() => {
    refresh();
    syncTodos();
    const off = onTodosChange(refresh);
    const online = () => syncTodos();
    window.addEventListener("online", online);
    return () => { off(); window.removeEventListener("online", online); };
  }, [refresh]);

  const all = useMemo(() => withAuto(stored, auto), [stored, auto]);
  const visible = useMemo(() => filterTodos(all, filter, today), [all, filter, today]);
  const late = lateCount(all, today);
  const celebrate = allDoneToday(all, today);
  useEffect(() => { onAllDone?.(celebrate); }, [celebrate, onAllDone]);

  const add = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    await addTodo(draft, { dueDate: today, sortOrder: all.length, priority });
    setDraft("");
    setPriority("normal");
  };
  // Computed items stay pinned on top; only stored todos are renumbered, so a reorder never stores a computed item.
  const storedSorted = useMemo(() => filterTodos(all.filter((x) => !x.auto), "all", today), [all, today]);
  const move = (from, to) => {
    const a = visible[from], b = visible[to];
    if (!a || !b || a.auto || b.auto) return;
    moveTodo(storedSorted, storedSorted.findIndex((x) => x.clientId === a.clientId), storedSorted.findIndex((x) => x.clientId === b.clientId));
  };
  const dragProps = (i) => ({
    draggable: !visible[i]?.auto,
    onDragStart: () => { dragFrom.current = i; },
    onDragOver: (e) => e.preventDefault(),
    onDrop: () => { if (dragFrom.current != null) move(dragFrom.current, i); dragFrom.current = null; },
  });

  const labels = FILTER_LABEL();
  return (
    <section className="law-card p-4" aria-label={tr("مهام اليوم")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{tr("مهام اليوم")}</h2>
        <div role="group" aria-label={tr("تصفية المهام")} className="flex gap-2">
          {Object.keys(labels).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {labels[f]}{f === "late" && late > 0 ? <> <bdi dir="ltr">({late})</bdi></> : null}
            </Chip>
          ))}
        </div>
      </div>
      <form onSubmit={add} className="mb-2 flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} className="law-input min-w-0 flex-1" placeholder={tr("أضف مهمة ثم Enter")} aria-label={tr("أضف مهمة ثم Enter")} />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="law-input shrink-0" style={{ inlineSize: "auto" }} aria-label={tr("الأولوية")}>
          {Object.entries(PRIORITY_LABEL()).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit" className="law-btn law-btn-primary flex items-center gap-1 px-4" aria-label={tr("إضافة")}><Plus size={18} /><span className="hidden sm:inline">{tr("إضافة")}</span></button>
      </form>
      {visible.length === 0 ? (
        <p className="py-4 text-sm" style={{ color: "var(--law-muted)" }}>{filter === "late" ? tr("لا مهام متأخرة.") : tr("لا مهام الآن. أضف أول مهمة لك.")}</p>
      ) : (
        <ul>{visible.map((t, i) => <Row key={t.clientId} t={t} onDismiss={onDismiss} index={i} count={visible.length} onMove={move} dragProps={dragProps(i)} canUp={!t.auto && i > 0 && !visible[i - 1].auto} canDown={!t.auto && i < visible.length - 1 && !visible[i + 1].auto} />)}</ul>
      )}
      {celebrate && <MascotSlot moment="celebrate" message={tr("أنجزت كل مهام اليوم.")} />}
    </section>
  );
}
