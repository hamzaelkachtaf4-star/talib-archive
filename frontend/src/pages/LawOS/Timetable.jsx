import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Plus } from "@phosphor-icons/react";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Card3D from "@/components/LawOS/kit/Card3D";
import Button3D from "@/components/LawOS/kit/Button3D";
import Chip from "@/components/LawOS/kit/Chip";
import { Notice } from "@/components/LawOS/ui";
import ReminderSettings from "@/components/LawOS/Timetable/ReminderSettings";
import { useMinWidth } from "@/hooks/useDeviceClass";
import SetupSheet from "@/components/LawOS/Timetable/SetupSheet";
import OverrideSheet from "@/components/LawOS/Timetable/OverrideSheet";
import { addDays, mondayOf, todayCasablanca, weekdayOf } from "@/components/LawOS/Timetable/dates";
import { flushTtQueue, loadWeek, overlayQueued, onTtQueueChange, pendingTt, startTtAutoSync } from "@/components/LawOS/lib/timetableSync";
import { langInfo, intlLocale, tr } from "@/components/LawOS/lib/i18n";
import useOnline from "@/components/LawOS/lib/useOnline";

const Mine = lazy(() => import("./Schedule"));

function ItemCard({ item, onClick }) {
  const badge = item.source === "custom" ? tr("مضافة") : item.source === "override" ? tr("معدّل") : null;
  return (
    <button type="button" onClick={onClick} className="law-card3d w-full text-start" style={item.cancelled ? { opacity: 0.55 } : undefined}>
      <div className="flex items-start gap-3">
        <div className="w-16 shrink-0 text-sm font-bold tabular-nums"><bdi dir="ltr">{item.startTime}</bdi><br /><span className="text-xs font-normal" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{item.endTime}</bdi></span></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold" style={item.cancelled ? { textDecoration: "line-through" } : undefined}><bdi>{item.subject}</bdi></p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--law-muted)" }}>
            {item.professor && <bdi dir="auto">{item.professor}</bdi>}{item.professor && item.room && " · "}{item.room && <bdi dir="auto">{item.room}</bdi>}
          </p>
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            {item.cancelled && <span className="law-chip">{item.movedTo ? tr("نُقلت") : tr("ملغاة")}</span>}
            {badge && <span className="law-chip" data-active="true">{badge}</span>}
            {item.movedFrom && <span className="law-chip">{tr("منقولة")}</span>}
            {item.note && <span className="law-chip"><bdi>{item.note}</bdi></span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function Official() {
  const [ws, setWs] = useState(() => mondayOf(todayCasablanca()));
  const [week, setWeek] = useState(null);
  const [stale, setStale] = useState(false);
  const [setup, setSetup] = useState(false);
  const [sel, setSel] = useState(null);
  const [addDate, setAddDate] = useState(null);
  const [pending, setPending] = useState(0);
  const wide = useMinWidth(1024); // desktop: every day of the week at once; phone: one day behind day tabs
  const [pick, setPick] = useState(null);
  const online = useOnline();
  const isRtl = langInfo().dir === "rtl";
  const Prev = isRtl ? ArrowRight : ArrowLeft;
  const Next = isRtl ? ArrowLeft : ArrowRight;

  const refresh = useCallback(async () => {
    const r = await loadWeek(ws);
    setWeek(await overlayQueued(r.week));
    setStale(r.stale);
  }, [ws]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    startTtAutoSync();
    pendingTt().then(setPending);
    return onTtQueueChange(setPending);
  }, []);
  useEffect(() => { if (online) flushTtQueue().then((n) => n && refresh()); }, [online, refresh]);

  const fmt = new Intl.DateTimeFormat(intlLocale(), { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const today = todayCasablanca();
  const dayShown = pick && days.includes(pick) ? pick : days.includes(today) ? today : days[0];
  const visibleDays = wide ? days : [dayShown];
  const tabDays = days.filter((d) => weekdayOf(d) <= 6 || (week?.items || []).some((i) => i.date === d));
  const onTabKey = (e) => {
    const step = { ArrowRight: isRtl ? -1 : 1, ArrowLeft: isRtl ? 1 : -1 }[e.key];
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = tabDays.indexOf(dayShown);
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabDays.length - 1 : (i + step + tabDays.length) % tabDays.length;
    setPick(tabDays[next]);
    document.getElementById(`tt-tab-${tabDays[next]}`)?.focus();
  };
  const byDay = (d) => (week?.items || []).filter((i) => i.date === d);
  const done = (queued) => { setSel(null); setAddDate(null); if (!queued) refresh(); else { pendingTt().then(setPending); refresh(); } };

  if (week && !week.subscription)
    return (
      <>
        <Card3D className="grid gap-3"><p className="font-bold">{tr("لم تُعدّ جدولك الرسمي بعد.")}</p>
          <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("اختر فصلك وفوجك وسيظهر برنامجك الأسبوعي.")}</p>
          <Button3D onClick={() => setSetup(true)}>{tr("إعداد الجدول")}</Button3D></Card3D>
        <SetupSheet open={setup} onClose={() => setSetup(false)} onDone={() => { setSetup(false); refresh(); }} />
      </>
    );

  return (
    <>
      {stale && <Notice tone="warn">{tr("بدون اتصال: يظهر آخر جدول محفوظ.")}</Notice>}
      {pending > 0 && <Notice tone="muted">{tr("{0} تعديل بانتظار المزامنة", [pending])}</Notice>}
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button3D variant="neutral" onClick={() => setWs(addDays(ws, -7))} aria-label={tr("الأسبوع السابق")}><Prev size={18} /></Button3D>
        <Chip onClick={() => setWs(mondayOf(todayCasablanca()))}><bdi dir="ltr">{ws}</bdi></Chip>
        <Button3D variant="neutral" onClick={() => setWs(addDays(ws, 7))} aria-label={tr("الأسبوع القادم")}><Next size={18} /></Button3D>
      </div>
      {!week && <p className="law-muted py-6 text-center text-sm">…</p>}
      {!wide && (
        <div className="mb-3 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label={tr("اليوم")} onKeyDown={onTabKey}>
          {tabDays.map((d) => (
            <button key={d} id={`tt-tab-${d}`} type="button" role="tab" aria-selected={dayShown === d} aria-controls="tt-panel" tabIndex={dayShown === d ? 0 : -1} onClick={() => setPick(d)} className="flex min-w-[3.5rem] flex-1 flex-col items-center rounded-xl px-2 py-2 text-xs font-bold"
              style={dayShown === d ? { background: "var(--law-primary)", color: "var(--law-on-primary)" } : { background: "var(--law-surface)", color: "var(--law-text)" }}>
              {new Intl.DateTimeFormat(intlLocale(), { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))}
              <span className="mt-0.5 text-[10px] opacity-80 tabular-nums">{byDay(d).length || "·"}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-3 lg:grid-cols-2" id="tt-panel" {...(wide ? {} : { role: "tabpanel", "aria-labelledby": `tt-tab-${dayShown}` })}>
        {visibleDays.map((d) => {
          const list = byDay(d);
          if (wide && !list.length && weekdayOf(d) > 5) return null; // phone: the chosen day always shows, even an empty Saturday
          return (
            <section key={d} aria-label={d}>
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-sm font-bold" style={d === todayCasablanca() ? { color: "var(--law-primary)" } : undefined}>{fmt.format(new Date(`${d}T12:00:00Z`))}</h2>
                <button type="button" onClick={() => setAddDate(d)} aria-label={tr("إضافة حصة تدارك")} className="p-1" style={{ color: "var(--law-muted)" }}><Plus size={18} /></button>
              </div>
              <div className="grid gap-2">{list.length ? list.map((i) => <ItemCard key={i.id} item={i} onClick={() => setSel(i)} />) : <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("لا حصص")}</p>}</div>
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-xs" style={{ color: "var(--law-muted)" }}>
        {tr("الجدول الرسمي منشور من الكلية بعد مراجعته. تعديلاتك تخصك وحدك.")}{" "}
        <button type="button" className="font-bold underline" onClick={() => setSetup(true)}>{tr("تغيير الفوج")}</button>
      </p>
      <SetupSheet open={setup} onClose={() => setSetup(false)} onDone={() => { setSetup(false); refresh(); }} />
      <OverrideSheet item={sel} addDate={addDate} onClose={() => { setSel(null); setAddDate(null); }} onDone={done} />
    </>
  );
}

export default function Timetable() {
  const [tab, setTab] = useState("mine");
  return (
    <>
      <PageTitle sub={tr("البرنامج الأسبوعي لفوجك")}>{tr("استعمال الزمن")}</PageTitle>
      <div className="mb-4 flex gap-2" role="tablist">
        <Chip active={tab === "mine"} onClick={() => setTab("mine")} role="tab" aria-selected={tab === "mine"}>{tr("جدولي")}</Chip>
        <Chip active={tab === "official"} onClick={() => setTab("official")} role="tab" aria-selected={tab === "official"}>{tr("الجدول الرسمي للكلية")}</Chip>
      </div>
      {tab === "official" ? <Official /> : <Suspense fallback={null}><Mine /></Suspense>}
      <ReminderSettings />
    </>
  );
}
