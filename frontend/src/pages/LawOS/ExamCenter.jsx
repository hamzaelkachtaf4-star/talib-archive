import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Cards, Target } from "@phosphor-icons/react";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Chip from "@/components/LawOS/kit/Chip";
import Button3D from "@/components/LawOS/kit/Button3D";
import MascotSlot from "@/components/LawOS/kit/MascotSlot";
import { Notice, Select } from "@/components/LawOS/ui";
import { COLORS } from "@/components/LawOS/Today/formats";
import PeerExams from "@/components/LawOS/exam/PeerExams";
import ExamSetup from "@/components/LawOS/exam/ExamSetup";
import BranchCard from "@/components/LawOS/exam/BranchCard";
import ExamCountdown from "@/components/LawOS/exam/ExamCountdown";
import ExamScheduleImport from "@/components/LawOS/exam/ExamScheduleImport";
import ReadinessRadar from "@/components/LawOS/exam/ReadinessRadar";
import DrillRunner, { TYPE_LABEL } from "@/components/LawOS/exam/DrillRunner";
import { lang, tr } from "@/components/LawOS/lib/i18n";

const TYPES = ["qcm", "case", "direct", "dissertation"];
const HINT = () => ({
  qcm: tr("أربعة خيارات وجواب واحد، من ملاحظاتك"),
  case: tr("وقائع ثم أربعة أقسام تكتبها أنت أولاً"),
  direct: tr("تعريفات وتمييز بين المفاهيم"),
  dissertation: tr("مقدمة وإشكالية ومبحثان"),
});
const REASON = () => ({ professor_format: tr("حسب شكل امتحان أستاذك"), professor_mixed: tr("أستاذك يخلط الأشكال: هذا الأقل تدريباً"), least_practised: tr("الأقل تدريباً عندك") });

const FORMATS = () => [["qcm", tr("أسئلة متعددة الخيارات")], ["case", tr("نازلة تطبيقية")], ["direct", tr("أسئلة نظرية")], ["dissertation", tr("موضوع مقالي")], ["mixed", tr("مختلط")]];

/** "شنو فهمت؟": exam dates, drills built from your own module material, the card review and your readiness. */
export default function ExamCenter() {
  const [modules, setModules] = useState(null);
  const [moduleId, setModuleId] = useState("");
  const [suggest, setSuggest] = useState(null);
  const [count, setCount] = useState(5);
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(null);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(null); // drill id
  const [drills, setDrills] = useState([]);
  const [countdown, setCountdown] = useState(null);
  const [manage, setManage] = useState(false);
  const [tick, setTick] = useState(0);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "peers" ? "peers" : "mine";
  const [shared, setShared] = useState({}); // drill id -> "ok" | "fail"
  const [profFormat, setProfFormat] = useState(null); // the professor's exam format, prefilled from the professor card

  useEffect(() => {
    Law.myAcademic().then(async (a) => {
      const sem = (a.ok && a.data.academic?.semester) || "S3";
      const r = await Law.moduleList(sem);
      setModules(r.ok ? r.data.modules : []);
      const wanted = params.get("module");
      if (r.ok && r.data.modules[0]) setModuleId((cur) => cur || (r.data.modules.some((m) => m.id === wanted) ? wanted : r.data.modules[0].id));
    });
  }, []);
  const loadCountdown = useCallback(() => Law.examCountdown().then((r) => r.ok && setCountdown(r.data.exams)), []);
  useEffect(() => { loadCountdown(); }, [loadCountdown]);
  useEffect(() => {
    if (!moduleId) { setSuggest(null); setDrills([]); setProfFormat(null); return; }
    Law.moduleProfessor(moduleId).then((r) => setProfFormat(r.ok ? r.data.card?.examFormat || "" : null));
    Law.examSuggest(moduleId).then((r) => setSuggest(r.ok ? r.data : null));
    Law.examDrills(moduleId).then((r) => setDrills(r.ok ? r.data.drills : []));
  }, [moduleId, tick]);

  async function saveFormat(fmt) {
    setProfFormat(fmt);
    const r = await Law.moduleProfessorSave(moduleId, { examFormat: fmt });
    if (r.ok) setTick((t) => t + 1);
  }

  async function removeDrill(d) {
    if (d.status !== "submitted" && !window.confirm(tr("حذف هذا التمرين المفتوح؟"))) return;
    const r = await Law.examDrillDelete(d.id);
    if (r.ok) setTick((t) => t + 1);
  }

  async function start(type, extra = {}) {
    setCreating(type);
    setMsg(null);
    const r = await Law.examDrillCreate(moduleId, { type, ...(type === "qcm" ? { count } : {}), ...(topic.trim() ? { topic } : {}), locale: lang(), ...extra });
    setCreating(null);
    if (r.ok) { setOpen(r.data.drill.id); setTick((t) => t + 1); return; }
    const code = r.data?.error?.code;
    setMsg(
      code === "mix_excludes_all" ? tr("اخترت في «مصادر المادة» أنواعاً ليس فيها محتوى بعد. عدّل النسب أو أضف مصادر من هذا النوع.")
      : code === "no_material" ? tr("أضف ملاحظات أو مصادر إلى هذه المادة أولاً، فالتمارين تُبنى منها فقط.")
      : code === "no_grounded_items" ? tr("لم يتمكن المصحح من بناء تمرين موثق بمصادرك. أضف مزيداً من المصادر أو غيّر الموضوع.")
      : code === "AI_QUOTA_EXCEEDED" ? tr("استنفدت حصتك اليومية. تتجدد غداً.")
      : code === "too_many_open" ? tr("لديك تمارين مفتوحة كثيرة. أنهِ بعضها أو احذفه.")
      : code === "ai_unavailable" ? tr("المولّد غير متاح الآن. أعد المحاولة لاحقاً.")
      : r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذر إنشاء التمرين."));
  }

  if (open)
    return <DrillRunner drillId={open} onClose={() => { setOpen(null); setTick((t) => t + 1); }} onSubmitted={() => setTick((t) => t + 1)} />;

  const card = "law-card flex items-center gap-3 p-4 text-start";
  const labels = TYPE_LABEL();
  const hints = HINT();
  return (
    <>
      <PageTitle sub={tr("راجع بطاقاتك وقِس مدى فهمك للمواد.")}>{tr("مركز الامتحانات")}</PageTitle>

      {modules && modules.length > 0 && (
        <div className="mb-4 flex gap-3 overflow-x-auto pb-2" role="group" aria-label={tr("تصفية حسب المادة")}>
          {modules.map((m) => {
            const on = m.id === moduleId;
            return (
              <button key={m.id} type="button" aria-pressed={on} onClick={() => setModuleId(m.id)} className="flex min-w-[12.5rem] shrink-0 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-start"
                style={{ borderColor: on ? "var(--law-accent)" : "var(--law-border)", background: on ? "var(--law-surface-2)" : "var(--law-surface)", boxShadow: `0 4px 0 ${on ? "var(--law-primary)" : "var(--law-border)"}` }}>
                <span aria-hidden="true" className="h-10 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[m.color] || COLORS.slate }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold"><bdi>{m.title}</bdi></span>
                  <span className="block whitespace-nowrap text-xs" style={{ color: "var(--law-muted)" }}>{m.semester && <><bdi dir="ltr">{m.semester}</bdi> · </>}<bdi dir="ltr">{m.completed || 0}/{m.total || 0}</bdi> {tr("مراحل")}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <BranchCard moduleTitle={modules?.find((m) => m.id === moduleId)?.title} />

      {tab === "mine" && moduleId && (
        <ExamSetup key={moduleId} moduleId={moduleId} drills={drills} starting={creating} onOpenDrill={setOpen}
          onStart={(s) => start(s.drill, { topic: undefined, difficulty: s.difficulty, ...(s.count ? { count: s.count, mode: s.mode } : {}), ...(s.drill === "case" ? { caseSource: "ai" } : {}) })} />
      )}
      {msg && tab === "mine" && <Notice tone="warn">{msg}</Notice>}

      <div role="tablist" className="mb-4 flex gap-2">
        {[["mine", tr("موادي")], ["peers", tr("امتحانات الزملاء")]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams(k === "mine" ? {} : { tab: k }, { replace: true })} className="law-btn3d" data-variant={tab === k ? undefined : "neutral"}>{l}</button>
        ))}
      </div>
      {tab === "peers" && <PeerExams modules={modules} onOpenDrill={(id, mid) => { setModuleId(mid); setOpen(id); setParams({}, { replace: true }); }} />}

      {tab === "mine" && (<>
      <section className="mb-6 grid gap-3" aria-label={tr("الامتحانات القادمة")}>
        <ExamCountdown exams={countdown} />
        <div><Button3D variant="neutral" onClick={() => setManage((m) => !m)}>{manage ? tr("إخفاء التواريخ") : tr("إدارة تواريخ الامتحانات")}</Button3D></div>
        {manage && <ExamScheduleImport onChanged={() => { loadCountdown(); setTick((t) => t + 1); }} />}
      </section>

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <Link to="/law/exam/cards" className={card}>
          <Cards size={28} style={{ color: "var(--law-primary)" }} />
          <span className="min-w-0"><span className="block font-bold">{tr("مراجعة البطاقات")}</span><span className="block text-sm" style={{ color: "var(--law-muted)" }}>{tr("البطاقات المستحقة اليوم")}</span></span>
        </Link>
        <Link to="/law/exam/weak-spots" className={card}>
          <Target size={28} style={{ color: "var(--law-primary)" }} />
          <span className="min-w-0"><span className="block font-bold">{tr("نقاط ضعفي")}</span><span className="block text-sm" style={{ color: "var(--law-muted)" }}>{tr("تمارين موجّهة لما تخلط فيه")}</span></span>
        </Link>
      </div>

      <section className="mb-6 grid gap-3" aria-label={tr("شنو فهمت؟")}>
        <h2 className="text-lg font-bold">{tr("شنو فهمت؟")}</h2>
        {modules && modules.length === 0 && <MascotSlot moment="empty" message={tr("لا مواد بعد")}><Link to="/law/path" className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("افتح المسار الدراسي")}</Link></MascotSlot>}
        {modules && modules.length > 0 && (
          <>
            {!moduleId && <Notice>{tr("اختر مادة من الأعلى لبدء تمرين.")}</Notice>}
            {moduleId && profFormat !== null && (
              <div className="grid gap-2" role="radiogroup" aria-label={tr("ما هي طريقة الأستاذ المعتمدة في الامتحانات؟")}>
                <p className="text-sm font-semibold">{tr("ما هي طريقة الأستاذ المعتمدة في الامتحانات؟")}</p>
                <div className="flex flex-wrap gap-2">
                  {FORMATS().map(([k, label]) => <Chip key={k} role="radio" aria-checked={profFormat === k} active={profFormat === k} onClick={() => saveFormat(k)}>{label}</Chip>)}
                </div>
              </div>
            )}
            {suggest && <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("نقترح:")} <strong>{labels[suggest.type]}</strong> · {REASON()[suggest.reason]}</p>}
            <input className="law-input" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} placeholder={tr("موضوع محدد (اختياري)")} aria-label={tr("موضوع محدد (اختياري)")} dir="auto" />
            <div className="grid gap-3 sm:grid-cols-2">
              {TYPES.map((t) => (
                <div key={t} className="law-card grid gap-2 p-4" data-suggested={suggest?.type === t || undefined} style={suggest?.type === t ? { borderColor: "var(--law-primary)" } : undefined}>
                  <p className="font-bold">{labels[t]} {suggest?.type === t && <Chip active>{tr("مقترح")}</Chip>}</p>
                  <p className="text-sm" style={{ color: "var(--law-muted)" }}>{hints[t]}</p>
                  {t === "qcm" && (
                    <label className="flex items-center gap-2 text-sm">{tr("عدد الأسئلة")}
                      <Select value={count} onChange={(e) => setCount(Number(e.target.value))} options={[[3, "3"], [5, "5"], [10, "10"]]} aria-label={tr("عدد الأسئلة")} />
                    </label>
                  )}
                  <div><Button3D onClick={() => start(t)} disabled={!moduleId || !!creating}>{creating === t ? tr("جارٍ الإعداد…") : tr("ابدأ")}</Button3D></div>
                </div>
              ))}
            </div>
            {drills.length > 0 && (
              <div className="grid gap-2">
                <h3 className="font-bold">{tr("تمارين هذه المادة")}</h3>
                <ul className="grid gap-2">
                  {drills.slice(0, 30).map((d) => (
                    <li key={d.id} className="flex items-stretch gap-2">
                      <button type="button" onClick={() => setOpen(d.id)} className="law-card flex min-w-0 flex-1 items-center justify-between gap-2 p-3 text-start">
                        <span>{labels[d.type]}</span>
                        <span className="text-sm" style={{ color: "var(--law-muted)" }}>{d.status === "submitted" ? <bdi dir="ltr">{d.score}/100</bdi> : tr("مفتوح")}</span>
                      </button>
                      {d.type === "qcm" && (
                        <button type="button" disabled={shared[d.id] === "ok" || shared[d.id] === "busy"} onClick={async () => {
                          if (shared[d.id] !== "confirm") return setShared((x) => ({ ...x, [d.id]: "confirm" })); // first tap: say what travels
                          setShared((x) => ({ ...x, [d.id]: "busy" }));
                          const r = await Law.shareExam(d.id);
                          setShared((x) => ({ ...x, [d.id]: r.ok ? "ok" : "fail" }));
                        }} className="px-3 text-xs font-bold whitespace-nowrap" style={{ color: shared[d.id] === "fail" ? "var(--law-danger)" : "var(--law-accent)" }}>
                          {shared[d.id] === "ok" ? tr("نُشر للزملاء") : shared[d.id] === "fail" ? tr("تعذر النشر") : shared[d.id] === "confirm" ? tr("تأكيد: تُشارك الأسئلة والشرح، دون مصادرك") : tr("نشر للزملاء")}
                        </button>
                      )}
                      <button type="button" onClick={() => removeDrill(d)} aria-label={`${tr("حذف التمرين")}: ${labels[d.type]}`} className="px-3" style={{ color: "var(--law-danger)" }}>×</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="mb-6 grid gap-3">
        <h2 className="text-lg font-bold">{tr("جاهزيتي")}</h2>
        <ReadinessRadar refreshKey={tick} />
      </section>
      </>)}
    </>
  );
}
