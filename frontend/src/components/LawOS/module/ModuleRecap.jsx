import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus } from "@phosphor-icons/react";
import Law from "@/models/law";
import Chip from "@/components/LawOS/kit/Chip";
import { tr } from "@/components/LawOS/lib/i18n";

const LEVELS = () => ({ 1: tr("ضائع"), 2: tr("ضعيف"), 3: tr("متوسط"), 4: tr("جيد"), 5: tr("متمكن") });
/** What the drills say, in words: the average of the submitted exam-center drills for this module. */
const verdict = (avg) => (avg == null ? null : avg >= 75 ? tr("متمكن حسب التمارين") : avg >= 50 ? tr("متوسط حسب التمارين") : tr("يحتاج مراجعة حسب التمارين"));

/**
 * Progress of one module: lectures attended (a +/- counter), completion of the path, and comprehension: the student's own
 * rating next to what the exam-center drills measured. The only way to a quiz is the button at the bottom: no quiz lives here.
 */
export default function ModuleRecap({ moduleId, refreshKey }) {
  const [r, setR] = useState(null);
  useEffect(() => { Law.moduleRecap(moduleId).then((x) => x.ok && setR(x.data.recap)); }, [moduleId, refreshKey]);
  if (!r) return null;
  const attended = r.sessionsAttended ?? 0;
  const pct = r.completionPct ?? (r.nodesTotal ? Math.round((100 * r.nodesCompleted) / r.nodesTotal) : 0);
  const save = async (patch) => {
    setR((c) => ({ ...c, ...patch })); // optimistic: the counter must feel instant
    const res = await Law.moduleProfileSave(moduleId, patch);
    if (!res.ok) Law.moduleRecap(moduleId).then((x) => x.ok && setR(x.data.recap));
  };
  const btn = "flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30";
  const cells = [
    [tr("محاضرات"), r.lectures],
    [tr("مصادر جاهزة"), r.sourcesReady],
    [tr("محطات منجزة"), <bdi dir="ltr" key="p">{r.nodesCompleted}/{r.nodesTotal}</bdi>],
    [tr("ملاحظات صاغها المرشد"), r.notesGenerated],
    [tr("رادار الفجوات"), r.gapRadarScore == null ? "—" : <bdi dir="ltr" key="g">{r.gapRadarScore}%</bdi>],
  ];
  return (
    <section className="law-card mb-4 grid gap-4 p-4" aria-label={tr("ملخص المادة")}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1">
          <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("حصص حضرتها")}</p>
          <div className="flex items-center gap-2">
            <button type="button" className={btn} disabled={attended <= 0} onClick={() => save({ sessionsAttended: attended - 1 })} aria-label={tr("إنقاص عدد الحصص")}><Minus size={16} /></button>
            <output className="min-w-8 text-center text-xl font-bold" aria-live="polite"><bdi dir="ltr">{attended}</bdi></output>
            <button type="button" className={btn} disabled={attended >= 400} onClick={() => save({ sessionsAttended: attended + 1 })} aria-label={tr("زيادة عدد الحصص")}><Plus size={16} /></button>
          </div>
        </div>
        <div className="grid gap-1">
          <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("نسبة الإنجاز")}</p>
          <p className="text-xl font-bold"><bdi dir="ltr">{pct}%</bdi></p>
          <span className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--law-surface-2)" }}><span className="block h-full rounded-full" style={{ inlineSize: `${pct}%`, background: "var(--law-primary)" }} /></span>
        </div>
        <div className="grid gap-1">
          <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("مدى الفهم")}</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label={tr("تقييمك لفهمك")}>
            {[1, 2, 3, 4, 5].map((n) => <Chip key={n} active={r.comprehension === n} onClick={() => save({ comprehension: r.comprehension === n ? null : n })}>{LEVELS()[n]}</Chip>)}
          </div>
          <p className="text-xs" style={{ color: "var(--law-muted)" }}>{verdict(r.drillAverage) || tr("لا تمارين بعد في مركز الامتحانات.")}{r.drillAverage != null && <> <bdi dir="ltr">({r.drillAverage}% · {r.drillCount ?? 0})</bdi></>}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cells.map(([label, value], i) => (
          <div key={i} className="grid gap-1">
            <dt className="text-xs" style={{ color: "var(--law-muted)" }}>{label}</dt>
            <dd className="text-lg font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <Link to={`/law/exam?module=${encodeURIComponent(moduleId)}`} className="law-btn law-btn-primary justify-self-start no-underline">{tr("اختبر نفسك في هذه المادة")}</Link>
    </section>
  );
}
