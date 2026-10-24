import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarBlank, ChatsCircle, Target, GraduationCap, BellRinging, MapTrifold, UsersThree } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Forward } from "@/components/LawOS/kit/DirArrow";
import { describe } from "@/components/LawOS/notifications/describe";
import { tr } from "@/components/LawOS/lib/i18n";

const cardCls = "law-card grid content-start gap-2 p-4";
const head = (Icon, title) => (
  <h2 className="flex items-center gap-2 text-sm font-bold"><Icon size={20} style={{ color: "var(--law-primary)" }} aria-hidden="true" />{title}</h2>
);

/** The class in progress or the next one today. Collapses when the student has no session today. */
export function NextSessionCard({ slots, now }) {
  const list = slots || [];
  if (!list.length) return null;
  const next = list.find((s) => s.endTime > now);
  return (
    <Link to="/law/timetable" className={cardCls}>
      {head(CalendarBlank, next ? (next.startTime <= now ? tr("الحصة الجارية") : tr("الحصة القادمة")) : tr("استعمال الزمن"))}
      <p className="truncate text-sm font-semibold">
        {next ? (
          <>
            <bdi dir="ltr">{next.startTime}</bdi> · <bdi>{next.subject?.name || (next.kind === "TD" ? tr("أعمال موجهة") : tr("محاضرة"))}</bdi>
            {next.room && <span style={{ color: "var(--law-muted)" }}> · <bdi dir="auto">{next.room}</bdi></span>}
          </>
        ) : tr("انتهت حصص اليوم.")}
      </p>
      <span className="text-xs" style={{ color: "var(--law-muted)" }}><Forward /></span>
    </Link>
  );
}

const casablancaHour = (d) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Africa/Casablanca" }).format(d));

/**
 * "Tomorrow": from 17:00 (Casablanca) the Today dashboard says which classes the student has tomorrow, if they asked for evening
 * reminders. Collapses when there are none or the student switched reminders off.
 */
export function TomorrowCard({ now = new Date() }) {
  const [t, setT] = useState(null);
  useEffect(() => { if (casablancaHour(now) >= 17) Law.timetableTomorrow().then((r) => r.ok && setT(r.data)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t || !t.prefs.enabled || !t.prefs.eveningBefore || !t.sessions.length) return null;
  const first = t.sessions[0];
  return (
    <Link to="/law/timetable" className={cardCls}>
      {head(BellRinging, tr("غداً"))}
      <p className="text-sm font-semibold">
        {t.sessions.length === 1
          ? <>{tr("لديك حصة غداً:")} <bdi>{first.subject}</bdi>{first.room ? <> — <bdi dir="auto">{first.room}</bdi></> : null}</>
          : <>{tr("لديك {0} حصص غداً، أولها {1}", [t.sessions.length, first.startTime])}</>}
      </p>
      <span className="text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{first.startTime}</bdi> · <bdi>{first.subject}</bdi></span>
    </Link>
  );
}

/** Unread squad activity: the count and the latest three. Collapses when there is none. */
export function UnreadDiscussionsCard() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    Law.notifications().then((r) => {
      if (!r.ok) return;
      setItems(r.data.items.filter((n) => !n.readAt && describe(n).group === "squads"));
    });
  }, []);
  if (!items.length) return null;
  return (
    <section className={cardCls} aria-label={tr("نقاشات غير مقروءة")}>
      {head(ChatsCircle, tr("نقاشات غير مقروءة"))}
      <p className="text-2xl font-bold"><bdi dir="ltr">{items.length}</bdi></p>
      <ul className="grid gap-1 text-sm">
        {items.slice(0, 3).map((n) => <li key={n.id}><Link to={describe(n).to} className="truncate" style={{ color: "var(--law-primary)" }}><bdi>{describe(n).text}</bdi></Link></li>)}
      </ul>
    </section>
  );
}

/** The student's most active weak topics (from their memory) with the day's 2-minute drill. Collapses with memory off or empty. */
export function GapRadarCard() {
  const [topics, setTopics] = useState([]);
  const [d, setD] = useState(null);
  const [res, setRes] = useState(null);
  useEffect(() => {
    Law.brainMe().then((r) => {
      if (!r.ok || !r.data.enabled) return;
      setTopics(r.data.memories.filter((m) => m.status === "ACTIVE").sort((a, b) => b.strength - a.strength).slice(0, 3));
    });
    Law.brainToday().then((r) => r.ok && setD(r.data));
  }, []);
  if (!topics.length) return null;
  const drill = d?.enabled && d.drill ? d.drill : null;
  const answer = async (idx) => { const r = await Law.brainAnswer(drill.id, idx); if (r.ok) setRes({ ...r.data, chosen: idx }); };
  return (
    <section className={cardCls} aria-label={tr("رادار الفجوات")}>
      {head(Target, tr("رادار الفجوات"))}
      <ul className="grid gap-1 text-sm">{topics.map((m) => <li key={m.id}><bdi>{m.summaryAr}</bdi></li>)}</ul>
      {drill && (
        <div className="grid gap-2" style={{ borderTop: "1px solid var(--law-border)", paddingBlockStart: 8 }}>
          <p className="text-sm font-semibold" style={{ unicodeBidi: "plaintext" }}>{drill.prompt}</p>
          {drill.options.map((o, i) => (
            <button key={i} type="button" disabled={!!res} onClick={() => answer(i)} className="law-btn3d" data-variant="neutral" style={res && (i === res.correctIndex ? { borderColor: "var(--law-ok)" } : i === res.chosen ? { borderColor: "var(--law-danger)" } : undefined)}>{o.text}</button>
          ))}
          {res && <p role="status" className="text-sm font-bold" style={{ color: res.correct ? "var(--law-ok)" : "var(--law-danger)" }}>{res.correct ? tr("أحسنت!") : tr("ليس تماما، تراجع التفسير.")}</p>}
        </div>
      )}
      <Link to="/law/exam/weak-spots" className="text-sm font-bold" style={{ color: "var(--law-primary)" }}>{tr("تمارين نقاط ضعفي")}</Link>
    </section>
  );
}

/** The next confirmed exams (exam center dates first, then the subjects' own exam dates). Collapses when there are none. */
export function ExamCard({ exams }) {
  if (!exams?.length)
    return (
      <Link to="/law/exam" className={cardCls}>
        {head(GraduationCap, tr("الامتحان القادم"))}
        <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا امتحان مسجل. أضف تاريخاً ليبدأ العد التنازلي.")}</p>
        <span className="text-xs" style={{ color: "var(--law-muted)" }}><Forward /></span>
      </Link>
    );
  return (
    <section className={cardCls} aria-label={tr("الامتحان القادم")}>
      {head(GraduationCap, tr("الامتحان القادم"))}
      {exams.slice(0, 3).map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">{e.color && <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: e.color }} />}<span className="truncate"><bdi>{e.title || e.name}</bdi></span></span>
          <span className="shrink-0 font-semibold" style={{ color: e.lockdown ? "var(--law-warn)" : undefined }}>
            {(e.daysTo ?? e.daysToExam) === 0 ? tr("اليوم") : <bdi>{(e.daysTo ?? e.daysToExam) === 1 ? tr("بعد يوم واحد") : tr("بعد {0} يوم", [e.daysTo ?? e.daysToExam])}</bdi>}
          </span>
        </div>
      ))}
      <Link to="/law/exam" className="text-sm font-bold" style={{ color: "var(--law-primary)" }}>{tr("مركز الامتحانات")}</Link>
    </section>
  );
}

/** Where the student stands in this semester's modules: the least advanced ones first. Links into the module workspace. */
export function ModuleProgressCard({ modules }) {
  if (!modules?.length) return null;
  const rows = [...modules].sort((a, b) => (a.completed / (a.total || 1)) - (b.completed / (b.total || 1))).slice(0, 3);
  return (
    <section className={cardCls} aria-label={tr("تقدم المواد")}>
      {head(MapTrifold, tr("تقدم المواد"))}
      {rows.map((m) => (
        <Link key={m.id} to={`/law/path/m/${m.id}`} className="grid gap-1 no-underline">
          <span className="flex items-center justify-between gap-2 text-sm"><span className="truncate"><bdi>{m.title}</bdi></span><bdi dir="ltr" className="shrink-0 text-xs" style={{ color: "var(--law-muted)" }}>{m.completed}/{m.total}</bdi></span>
          <span className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--law-surface-2)" }}><span className="block h-full rounded-full" style={{ inlineSize: `${m.total ? Math.round((100 * m.completed) / m.total) : 0}%`, background: "var(--law-primary)" }} /></span>
        </Link>
      ))}
      <Link to="/law/path" className="text-sm font-bold" style={{ color: "var(--law-primary)" }}>{tr("المسار الدراسي")}</Link>
    </section>
  );
}

/** The latest documents of the student's work groups. Collapses when they are in no group or nothing was shared yet. */
export function SquadActivityCard() {
  const [docs, setDocs] = useState(null);
  useEffect(() => {
    Law.mySquad().then((m) => (m.ok && m.data.squad ? Law.squadDocs() : { ok: false })).then((r) => setDocs(r.ok ? (r.data.docs || []) : [])).catch(() => setDocs([]));
  }, []);
  if (!docs?.length) return null;
  const rows = [...docs].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 3);
  return (
    <section className={cardCls} aria-label={tr("نشاط مجموعات العمل")}>
      {head(UsersThree, tr("نشاط مجموعات العمل"))}
      {rows.map((d) => (
        <Link key={d.id} to={`/law/squad/docs/${d.id}`} className="flex items-center justify-between gap-2 text-sm no-underline"><span className="truncate"><bdi>{d.title}</bdi></span><bdi dir="ltr" className="shrink-0 text-xs" style={{ color: "var(--law-muted)" }}>{String(d.updatedAt || "").slice(0, 10)}</bdi></Link>
      ))}
      <Link to="/law/community/squads" className="text-sm font-bold" style={{ color: "var(--law-primary)" }}>{tr("مجموعات العمل")}</Link>
    </section>
  );
}
