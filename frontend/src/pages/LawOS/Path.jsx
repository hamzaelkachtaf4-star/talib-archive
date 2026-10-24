import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "@phosphor-icons/react";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Chip from "@/components/LawOS/kit/Chip";
import Button3D from "@/components/LawOS/kit/Button3D";
import MascotSlot from "@/components/LawOS/kit/MascotSlot";
import EmptyState from "@/components/LawOS/kit/EmptyState";
import ProgressRing from "@/components/LawOS/kit/ProgressRing";
import { Input, Notice } from "@/components/LawOS/ui";
import { loadModules } from "@/components/LawOS/lib/pathSync";
import { tr } from "@/components/LawOS/lib/i18n";

const SEMESTERS = ["S1", "S2", "S3", "S4", "S5", "S6"];

/** "+ إضافة مادة": a module of the student's own, for any semester. */
function AddModule({ semester, onAdded }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [professor, setProfessor] = useState("");
  const [err, setErr] = useState(null);
  async function submit(e) {
    e.preventDefault();
    const r = await Law.moduleAdd({ semester, title });
    if (!r.ok) {
      const code = r.data?.error?.code;
      return setErr(code === "duplicate_title" ? tr("هذه المادة موجودة.") : code === "invalid_title" ? tr("اكتب اسماً من حرفين إلى 80 حرفاً.") : code === "too_many_modules" ? tr("بلغت الحد الأقصى من المواد.") : r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذرت الإضافة."));
    }
    if (professor.trim() && r.data?.module?.id) await Law.moduleProfessorSave(r.data.module.id, { name: professor.trim() }); // the professor card starts with the name
    setTitle(""); setProfessor(""); setErr(null); setOpen(false);
    onAdded();
  }
  if (!open) return <Button3D variant="neutral" onClick={() => setOpen(true)}><Plus size={16} /> {tr("إضافة مادة")}</Button3D>;
  return (
    <form onSubmit={submit} className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={tr("اسم المادة")} aria-label={tr("اسم المادة")} dir="auto" autoFocus />
        <Input value={professor} maxLength={120} onChange={(e) => setProfessor(e.target.value)} placeholder={tr("اسم الأستاذ (اختياري)")} aria-label={tr("اسم الأستاذ (اختياري)")} dir="auto" />
      </div>
      <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("تُضاف المادة إلى الفصل المحدد أعلاه: {0}", [semester])}</p>
      <div className="flex gap-2">
        <Button3D type="submit" disabled={title.trim().length < 2}>{tr("إضافة")}</Button3D>
        <Button3D variant="neutral" onClick={() => { setOpen(false); setErr(null); }}>{tr("إلغاء")}</Button3D>
      </div>
      {err && <Notice tone="warn">{err}</Notice>}
    </form>
  );
}

/** Path hub: opens on the student's semester and lists its modules (shared ones from the timetable, and their own). */
export default function Path() {
  const [sem, setSem] = useState(null);
  const [acad, setAcad] = useState({ track: null, language: null });
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | profile | offline
  const [tick, setTick] = useState(0);

  useEffect(() => {
    Law.myAcademic().then((r) => { setSem((r.ok && r.data.academic?.semester) || "S3"); if (r.ok) setAcad({ track: r.data.academic?.track || null, language: r.data.academic?.language || null }); });
  }, []);
  // Track and language decide which module list applies, so they are saved on the academic profile.
  const pick = async (patch) => {
    const r = await Law.updateAcademic(patch);
    if (r.ok) { setAcad((a) => ({ ...a, ...patch })); setTick((t) => t + 1); }
  };
  useEffect(() => {
    if (!sem) return;
    setState("loading");
    loadModules(sem).then((r) => {
      if (r.data?.modules) { setData(r.data); setState("ok"); }
      else setState(r.error === "academic_profile_required" ? "profile" : "offline");
    });
  }, [sem, tick]);

  return (
    <>
      <PageTitle sub={tr("مواد فصلك خطوة بخطوة")}>{tr("المسار الدراسي")}</PageTitle>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={tr("الفصل")}>
        {SEMESTERS.map((s) => <Chip key={s} active={sem === s} onClick={() => setSem(s)}>{s}</Chip>)}
      </div>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex gap-2" role="group" aria-label={tr("الشعبة")}>
          <Chip active={acad.track === "PRIVE"} onClick={() => pick({ track: "PRIVE" })}>{tr("قانون خاص")}</Chip>
          <Chip active={acad.track === "PUBLIC"} onClick={() => pick({ track: "PUBLIC" })}>{tr("قانون عام")}</Chip>
        </div>
        <div className="flex gap-2" role="group" aria-label={tr("لغة الدراسة")}>
          <Chip active={acad.language === "AR"} onClick={() => pick({ language: "AR" })}>{tr("عربية")}</Chip>
          <Chip active={acad.language === "FR"} onClick={() => pick({ language: "FR" })}>Français</Chip>
        </div>
      </div>
      {state === "profile" && <EmptyState title={tr("أكمل ملفك الدراسي")} hint={tr("نحتاج الكلية والشعبة واللغة لعرض مواد فصلك.")} action={<Link to="/law/welcome?condensed=1" className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("إكمال")}</Link>} />}
      {state === "offline" && <Notice tone="warn">{tr("يحتاج اتصالا بالخادم.")}</Notice>}
      {state === "ok" && !data.modules.length && (
        <MascotSlot moment="empty" message={tr("لا مواد في هذا الفصل بعد")}>
          <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("أضف موادك بنفسك لتبدأ.")}</p>
        </MascotSlot>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {state === "ok" && data.modules.map((m) => (
          <Link key={m.id} to={`/law/path/m/${m.id}`} className="no-underline">
            <div className="law-card3d flex items-center gap-3" style={{ cursor: "pointer" }}>
              <ProgressRing value={m.completed} max={m.total || 1} size={64} stroke={8} label={m.title}><span className="text-xs font-bold"><bdi dir="ltr">{m.completed}/{m.total}</bdi></span></ProgressRing>
              <div className="min-w-0 text-start">
                <p className="font-bold"><bdi>{m.title}</bdi></p>
                {m.parcours && <p className="text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{m.parcours}</bdi></p>}
                {m.owned && !m.verified && <p className="mt-1 text-xs font-semibold" style={{ color: "var(--law-warn)" }}>{tr("قائمة افتراضية — تحقق منها")}</p>}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {state === "ok" && sem && <div className="mt-4"><AddModule semester={sem} onAdded={() => setTick((t) => t + 1)} /></div>}
      <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link to="/law/path/courses" className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("دوراتي: دفاتر الملاحظات والفجوات")}</Link>
      </p>
    </>
  );
}
