import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Cards, Tray } from "@phosphor-icons/react";
import Law from "@/models/law";
import { loadWeek } from "@/components/LawOS/lib/timetableSync";
import { mondayOf, todayCasablanca } from "@/components/LawOS/Timetable/dates";
import { PageTitle } from "@/components/LawOS/EmptyState";
import { Notice } from "@/components/LawOS/ui";
import WeeklyRecapCard from "@/components/LawOS/Today/WeeklyRecapCard";
import TodoHub from "@/components/LawOS/Today/TodoHub";
import { autoItems } from "@/components/LawOS/Today/todoModel";
import { NextSessionCard, TomorrowCard, UnreadDiscussionsCard, ExamCard, ModuleProgressCard } from "@/components/LawOS/Today/cards";
import { TimetableBanner, ResumeCard, MySubjects } from "@/components/LawOS/Today/LearnHome";
import SubjectSetup from "@/components/LawOS/Today/SubjectSetup";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Plus } from "@phosphor-icons/react";
import { loadModules } from "@/components/LawOS/lib/pathSync";
import { localQueue, onPackChange } from "@/components/LawOS/lib/reviewSync";
import * as idb from "@/components/LawOS/lib/idb";
import { intlLocale, tr } from "@/components/LawOS/lib/i18n";

const nowHm = () =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Casablanca" }).format(new Date());

export default function Today() {
  const [data, setData] = useState(null);
  const [stale, setStale] = useState(false);
  const [localDue, setLocalDue] = useState(null);
  const [official, setOfficial] = useState(null); // today's official sessions (null = no subscription)
  const [examDates, setExamDates] = useState([]); // confirmed exam-center dates (a photo import only counts once confirmed)
  useEffect(() => { Law.examCountdown().then((r) => r.ok && setExamDates(r.data.exams)); }, []);
  const today = todayCasablanca();
  const [modules, setModules] = useState([]);
  const [modulesLoaded, setModulesLoaded] = useState(false);
  const [semester, setSemester] = useState("S3");
  const [setup, setSetup] = useState(null); // null | "new" | a module being edited
  const reload = (sem) => {
    const s = typeof sem === "string" ? sem : semester;
    setSemester(s);
    return loadModules(s).then((r) => r?.data?.modules && setModules(r.data.modules)).catch(() => {}); // refreshes the offline copy too
  };
  useEffect(() => {
    Law.myAcademic().then((a) => { const s = (a.ok && a.data.academic?.semester) || "S3"; setSemester(s); return loadModules(s); }).then((r) => setModules(r?.data?.modules || [])).catch(() => {}).finally(() => setModulesLoaded(true));
  }, []);
  // Auto items the student dismissed stay hidden for the rest of today only.
  const DISMISS_KEY = `talib.todayDismissed.${today}`;
  const [dismissed, setDismissed] = useState(() => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"); } catch { return []; } });
  const dismiss = (id) => setDismissed((d) => { const n = [...new Set([...d, id])]; try { localStorage.setItem(DISMISS_KEY, JSON.stringify(n)); } catch {} return n; });

  useEffect(() => {
    loadWeek(mondayOf(today)).then(({ week }) => {
      if (!week?.subscription) return setOfficial(null);
      setOfficial(week.items.filter((i) => i.date === today && !i.cancelled).map((i) => ({ ...i, subject: { name: i.subject } })));
    });
  }, [today]);

  useEffect(() => {
    Law.today().then(async (res) => {
      if (res.ok) {
        setData(res.data);
        setStale(false);
        idb.setMeta("today", res.data).catch(() => {});
      } else {
        setData(await idb.getMeta("today"));
        setStale(true);
      }
    });
    const countLocal = () => localQueue().then((q) => setLocalDue(q.due.length + q.fresh.length));
    countLocal();
    return onPackChange(countLocal);
  }, []);

  const date = new Intl.DateTimeFormat(intlLocale(), { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Casablanca" }).format(new Date());
  // Offline the local pack is the truth for what can be reviewed now.
  const dueTotal = localDue ?? (data ? data.due.reviewCount + data.due.newCount : 0);
  const slots = official ?? data?.slots;
  const auto = useMemo(
    () =>
      autoItems({
        date: today,
        slots: slots || [],
        dueCards: dueTotal,
        exams: examDates.length ? examDates : data?.exams || [],
        dismissed,
        labels: {
          exam: (e, d) => (d === 0 ? tr("{0}: اليوم", [e.title || e.name || ""]) : tr("{0}: بعد {1} يوم", [e.title || e.name || "", d])),
          lecture: (s) => tr("حصة {0} · {1}", [s.startTime, s.subject?.name || (s.kind === "TD" ? tr("أعمال موجهة") : tr("محاضرة"))]),
          review: (n) => tr("راجع {0} بطاقة", [n]),
        },
      }),
    [today, slots, dueTotal, examDates, data, dismissed]
  );

  return (
    <>
      <PageTitle sub={tr("موادك من استعمال الزمن ديالك، وكل مادة كتحفظ طريقة التعلم ديالها.")}>{tr("تعلم")}</PageTitle>
      <div className="mb-3"><Button3D onClick={() => setSetup("new")}><Plus size={16} weight="bold" />{tr("مادة جديدة")}</Button3D> <span className="ms-2 text-xs" style={{ color: "var(--law-muted)" }}>{date}</span></div>
      {stale && <Notice tone="warn">{tr("بدون اتصال: تُعرض آخر بيانات محفوظة.")}</Notice>}
      <div className="mb-4 grid gap-4">
        {setup && <SubjectSetup module={setup === "new" ? null : setup} semester={semester} onCancel={() => setSetup(null)} onDone={(s) => { setSetup(null); reload(s); }} />}
        {!setup && modulesLoaded && data && official === null && !modules.length && <TimetableBanner semester={semester} onChanged={reload} />}
        {!setup && <ResumeCard modules={modules} />}
        {!setup && <MySubjects modules={modules} onNew={() => setSetup("new")} onEdit={setSetup} onToggleVisibility={async (m) => { const r = await Law.moduleProfileSave(m.id, { isPublic: !m.isPublic }); if (r.ok) reload(m.semester || semester); }} />}
      </div>
      <div className="law-today-grid">
        <div className="law-span-all"><TodoHub auto={auto} today={today} onDismiss={dismiss} /></div>

        <Link to="/law/exam/cards" className="flex flex-col gap-2 rounded-2xl p-4" style={{ background: "var(--law-primary)", color: "var(--law-on-primary)" }}>
          <Cards size={26} />
          <span className="text-2xl font-bold tabular-nums"><bdi dir="ltr">{dueTotal}</bdi></span>
          <span className="text-sm font-semibold">{tr("ابدأ المراجعة")}</span>
        </Link>
        <Link to="/law/capture?tab=inbox" className="law-card flex flex-col gap-2 p-4">
          <Tray size={26} style={{ color: "var(--law-accent)" }} />
          <span className="text-2xl font-bold tabular-nums"><bdi dir="ltr">{data?.inboxCount ?? 0}</bdi></span>
          <span className="text-sm font-semibold">{tr("صندوق الوارد")}</span>
        </Link>

        <NextSessionCard slots={slots} now={nowHm()} />
        <TomorrowCard />
        <UnreadDiscussionsCard />
        <ExamCard exams={examDates.length ? examDates : data?.exams} />
        <ModuleProgressCard modules={modules} />
        <div className="law-span-all"><WeeklyRecapCard /></div>
      </div>
    </>
  );
}
