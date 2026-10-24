import { useEffect, useState } from "react";
import MascotSlot from "@/components/LawOS/kit/MascotSlot";
import { Plus } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Notice, WEEKDAYS } from "@/components/LawOS/ui";
import SlotForm from "@/components/LawOS/Schedule/SlotForm";
import WeekGrid, { SlotCard } from "@/components/LawOS/Schedule/WeekGrid";
import Sheet from "@/components/LawOS/kit/Sheet";
import AiImport from "@/components/LawOS/Schedule/AiImport";
import FileImport from "@/components/LawOS/Schedule/FileImport";
import { useMinWidth } from "@/hooks/useDeviceClass";
import {
  KIND_LABELS,
  SCHOOL_DAYS,
  blankSlot,
  byTime,
  timetableError,
  toPayload,
} from "@/components/LawOS/Schedule/shared";
import { weekdayOfDate } from "@/components/LawOS/lib/dates";
import { tr } from "@/components/LawOS/lib/i18n";

const addMinutes = (hm, n) => { const [h, m] = hm.split(":").map(Number); const t = Math.min(h * 60 + m + n, 23 * 60 + 59); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date());
const normalize = (slots) =>
  slots.map((x) => ({ ...x, subjectId: x.subjectId || "", moduleId: x.moduleId || "", room: x.room || "" })).sort(byTime);

/** Emploi du temps: the weekly timetable, edited by hand or imported from a photo with AI. */
export default function Schedule() {
  const [mode, setMode] = useState("manual");
  const [slots, setSlots] = useState(null);
  const [modules, setModules] = useState([]); // this semester's modules: a session is linked to one of them
  const [semester, setSemester] = useState("S3");
  const [day, setDay] = useState(() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date());
    const wd = weekdayOfDate(today);
    return SCHOOL_DAYS.includes(wd) ? wd : 1;
  });
  const [editing, setEditing] = useState(null); // { index | null, slot }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    Law.timetable().then((t) => { if (t.ok) setSlots(normalize(t.data.slots)); else setOffline(true); });
    Law.myAcademic().then(async (a) => {
      const sem = (a.ok && a.data.academic?.semester) || "S3";
      setSemester(sem);
      const r = await Law.moduleList(sem);
      if (r.ok) setModules(r.data.modules);
    });
  }, []);

  async function save(next) {
    setBusy(true);
    setMsg(null);
    const r = await Law.saveTimetable(toPayload(next));
    setBusy(false);
    if (!r.ok) {
      setMsg({ tone: "warn", text: r.offline ? tr("لا يوجد اتصال بالخادم.") : timetableError(r.data?.error) });
      return false;
    }
    setSlots(normalize(r.data.slots));
    return true;
  }

  async function saveSlot(slot) {
    const next = [...slots];
    if (editing.index === null) next.push(slot);
    else next[editing.index] = { ...next[editing.index], ...slot, placeholder: false };
    if (await save(next)) {
      setEditing(null);
      setDay(slot.weekday);
    }
  }

  async function remove(index) {
    if (!window.confirm(tr("حذف هذه الحصة؟"))) return;
    await save(slots.filter((_, i) => i !== index));
  }

  const wide = useMinWidth(1024); // desktop: the whole week as a grid; phone: one day at a time
  const titleOf = (slot) => modules.find((m) => m.id === slot.moduleId)?.title || "";
  const daySlots = (d) => (slots || []).map((s, index) => ({ s, index })).filter(({ s }) => s.weekday === d);
  const shownDays = (slots || []).some((s) => s.weekday === 7) ? [...SCHOOL_DAYS, 7] : SCHOOL_DAYS; // a Sunday session from an import must not disappear
  const countFor = (d) => (slots || []).filter((s) => s.weekday === d).length;

  /** The cards of one day with the add button (phone: one day at a time). */
  const dayList = (d) => {
    const list = daySlots(d);
    return (
      <div className="flex flex-col gap-3">
        {list.length === 0 && <MascotSlot compact={wide} message={tr("لا حصص في هذا اليوم.")} />}
        {list.map(({ s, index }) => <SlotCard key={s.id || index} slot={s} title={titleOf(s)} onEdit={() => setEditing({ index, slot: s })} onDelete={() => remove(index)} />)}
        <Button type="button" variant="secondary" onClick={() => setEditing({ index: null, slot: blankSlot(d) })} className="flex items-center justify-center gap-2">
          <Plus size={18} /> {tr("إضافة حصة")}
        </Button>
      </div>
    );
  };

  return (
    <>
      {offline && <Notice tone="warn">{tr("بدون اتصال: يظهر الجدول عند عودة الاتصال.")}</Notice>}

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl p-1" style={{ background: "var(--law-surface-2)" }} role="tablist">
        {[
          ["manual", tr("باليد")],
          ["file", tr("ملف")],
          ["ai", tr("صورة أو نص")],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className="rounded-xl py-2 text-sm font-bold"
            style={mode === key ? { background: "var(--law-surface)", color: "var(--law-primary)" } : { color: "var(--law-muted)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        slots && (
          <FileImport
            modules={modules} semester={semester}
            current={slots}
            onSaved={(saved) => {
              setSlots(normalize(saved));
              Law.moduleList(semester).then((r) => r.ok && setModules(r.data.modules));
              setMode("manual");
              setMsg({ tone: "ok", text: tr("تم حفظ الجدول.") });
            }}
          />
        )
      ) : mode === "ai" ? (
        slots && (
          <AiImport
            modules={modules} semester={semester}
            current={slots}
            onSaved={(saved) => {
              setSlots(normalize(saved));
              Law.moduleList(semester).then((r) => r.ok && setModules(r.data.modules));
              setMode("manual");
              setMsg({ tone: "ok", text: tr("تم حفظ الجدول.") });
            }}
          />
        )
      ) : (
        <>
          {!wide && (
            <div className="mb-4 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label={tr("اليوم")}>
              {shownDays.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={day === d}
                  onClick={() => setDay(d)}
                  className="flex min-w-[3.5rem] flex-1 flex-col items-center rounded-xl px-2 py-2 text-xs font-bold"
                  style={day === d ? { background: "var(--law-primary)", color: "var(--law-on-primary)" } : { background: "var(--law-surface)", color: "var(--law-text)" }}
                >
                  {WEEKDAYS[d]}
                  <span className="mt-0.5 text-[10px] opacity-80 tabular-nums">{countFor(d) || "·"}</span>
                </button>
              ))}
            </div>
          )}

          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

          {!slots ? (
            <p className="law-muted">…</p>
          ) : wide ? (
            <>
              <WeekGrid slots={slots} days={shownDays} titleOf={titleOf} today={weekdayOfDate(todayStr())}
                onAdd={(d, t) => setEditing({ index: null, slot: { ...blankSlot(d), startTime: t, endTime: addMinutes(t, 90) } })}
                onEdit={(index) => setEditing({ index, slot: slots[index] })} onDelete={remove} />
              <div className="mt-3"><Button type="button" variant="secondary" onClick={() => setEditing({ index: null, slot: blankSlot(1) })} className="flex items-center gap-2"><Plus size={18} /> {tr("إضافة حصة")}</Button></div>
            </>
          ) : (
            dayList(day)
          )}
        </>
      )}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.index === null ? tr("إضافة حصة") : tr("تعديل الحصة")} variant="modal">
        {editing && <SlotForm key={editing.index ?? "new"} initial={editing.slot} modules={modules} busy={busy} onSave={saveSlot} onCancel={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}
