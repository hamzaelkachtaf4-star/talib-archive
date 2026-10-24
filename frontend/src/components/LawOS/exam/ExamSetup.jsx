import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Sparkle, TrendUp } from "@phosphor-icons/react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { CASE_SOURCES, DEFAULT_CONFIG, DIFFICULTIES, EXAM_TYPES, MODES, stageDone, stagesOf } from "./examPlan";

const Chip = ({ on, onClick, children, sub }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className="rounded-2xl border-2 px-4 py-2.5 text-start" style={{ borderColor: on ? "var(--law-accent)" : "var(--law-border)", background: on ? "var(--law-surface-2)" : "var(--law-surface)", boxShadow: `0 3px 0 ${on ? "color-mix(in srgb, var(--law-accent) 55%, black)" : "var(--law-border)"}` }}>
    <span className="flex items-center gap-1.5 text-sm font-bold">{children}</span>
    {sub && <span className="mt-0.5 block text-xs" style={{ color: "var(--law-muted)" }}>{sub}</span>}
  </button>
);

/**
 * «كيف تحب أن تتدرب على هذه المادة؟»: the student chooses once (types, level, count, source of cases) and gets an exam path in
 * stages. The choice is stored per subject; a stage is done when a drill of its type was submitted after the path was built.
 */
export default function ExamSetup({ moduleId, drills, onStart, onOpenDrill, starting }) {
  const [saved, setSaved] = useState(undefined); // undefined = loading, null = never set
  const [draft, setDraft] = useState({ ...DEFAULT_CONFIG });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    setSaved(undefined);
    Law.moduleProfile(moduleId).then((r) => {
      if (!live) return;
      const c = r.ok ? r.data.profile.examConfig : null;
      setSaved(c || null);
      setDraft(c ? { ...c } : { ...DEFAULT_CONFIG });
      setEditing(!c?.builtAt);
    });
    return () => { live = false; };
  }, [moduleId]);

  const toggle = (key) => setDraft((d) => ({ ...d, types: d.types.includes(key) ? d.types.filter((k) => k !== key) : [...d.types, key] }));
  async function build() {
    setBusy(true);
    setErr(null);
    const config = { ...draft, mode: draft.mode || "quiz", builtAt: new Date().toISOString() };
    const r = await Law.moduleProfileSave(moduleId, { examConfig: config });
    setBusy(false);
    if (!r.ok) return setErr(r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذر حفظ الإعدادات."));
    setSaved(r.data.profile.examConfig);
    setEditing(false);
  }

  if (saved === undefined) return null;
  const types = EXAM_TYPES();
  const hasCase = draft.types.includes("case");

  if (!editing && saved?.builtAt) {
    const stages = stagesOf(saved);
    const levelLabel = Object.fromEntries(DIFFICULTIES());
    return (
      <section className="law-card mb-4 grid gap-3 p-4" aria-label={tr("مسار الامتحان")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{tr("مسار الامتحان")}</h2>
          <Button3D variant="neutral" onClick={() => setEditing(true)}>{tr("تغيير الإعدادات")}</Button3D>
        </div>
        {err && <Notice tone="warn">{err}</Notice>}
        <ol className="grid gap-2">
          {stages.map((s, i) => {
            const t = types.find((x) => x.key === s.key);
            const done = stageDone(s, drills, saved.builtAt);
            const open = s.drill && (drills || []).find((d) => d.type === s.drill && d.status !== "submitted");
            return (
              <li key={s.key} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 p-3" style={{ borderColor: done ? "var(--law-accent)" : "var(--law-border)" }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold" style={{ background: done ? "var(--law-accent)" : "var(--law-surface-2)", color: done ? "var(--law-on-accent)" : "var(--law-muted)" }}>{done ? <Check size={20} weight="bold" aria-hidden="true" /> : <bdi dir="ltr">{i + 1}</bdi>}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-bold"><t.Icon size={18} aria-hidden="true" />{t.label}</span>
                  <span className="block text-xs" style={{ color: "var(--law-muted)" }}>
                    {t.hint} · {levelLabel[s.difficulty]}{s.count ? <> · <bdi dir="ltr">{s.count}</bdi> {tr("أسئلة")}</> : null}{s.mode ? <> · {MODES().find((m) => m[0] === s.mode)?.[1]}</> : null}
                  </span>
                </span>
                {!s.supported && <span className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "var(--law-surface-2)", color: "var(--law-muted)" }}>{tr("قريباً")}</span>}
                {s.supported && s.key === "cards" && <Button3D to="/law/exam/cards" variant="neutral">{tr("ابدأ المراجعة")}</Button3D>}
                {s.supported && s.drill && open && <Button3D onClick={() => onOpenDrill(open.id)} variant="neutral">{tr("متابعة")}</Button3D>}
                {s.supported && s.drill && !open && <Button3D onClick={() => onStart(s)} disabled={!!starting}>{starting === s.drill ? tr("جارٍ الإعداد…") : done ? tr("عاود") : tr("ابدأ")}</Button3D>}
              </li>
            );
          })}
        </ol>
        {saved.types.includes("case") && saved.caseSource !== "ai" && <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("بنك النوازل الحقيقية فارغ حالياً: تُولَّد النوازل من مضمون دروسك.")}</p>}
      </section>
    );
  }

  return (
    <section className="law-card mb-4 grid gap-5 p-5" aria-label={tr("كيف تحب أن تتدرب على هذه المادة؟")}>
      <header>
        <h2 className="text-lg font-bold">{tr("كيف تحب أن تتدرب على هذه المادة؟")}</h2>
        <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("تختار مرة واحدة، وأبني لك مسار امتحان بمراحل. يمكنك تغيير الإعدادات متى شئت.")}</p>
      </header>

      <div>
        <h3 className="mb-2 text-sm font-bold">{tr("أنواع التمارين")}</h3>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={tr("أنواع التمارين")}>
          {types.map((t) => {
            const on = draft.types.includes(t.key);
            return (
              <button key={t.key} type="button" aria-pressed={on} disabled={!t.supported} onClick={() => toggle(t.key)} className="flex items-center gap-3 rounded-2xl border-2 p-3 text-start disabled:opacity-60"
                style={{ borderColor: on ? "var(--law-accent)" : "var(--law-border)", background: on ? "var(--law-surface-2)" : "var(--law-surface)", boxShadow: `0 3px 0 ${on ? "color-mix(in srgb, var(--law-accent) 55%, black)" : "var(--law-border)"}` }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--law-surface-2)", color: "var(--law-accent)" }}><t.Icon size={22} weight={on ? "fill" : "duotone"} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold"><bdi>{t.label}</bdi></span><span className="block text-xs" style={{ color: "var(--law-muted)" }}>{t.supported ? t.hint : tr("قريباً")}</span></span>
                {on && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--law-accent)", color: "var(--law-on-accent)" }}><Check size={14} weight="bold" aria-label={tr("محدد")} /></span>}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">{tr("مستوى الصعوبة")}</h3>
        <div className="flex flex-wrap gap-2" role="group" aria-label={tr("مستوى الصعوبة")}>
          {DIFFICULTIES().map(([k, label]) => <Chip key={k} on={draft.difficulty === k} onClick={() => setDraft((d) => ({ ...d, difficulty: k }))}>{k === "progressive" && <TrendUp size={16} aria-hidden="true" />}{label}</Chip>)}
        </div>
        {draft.difficulty === "progressive" && <p className="mt-1.5 text-xs" style={{ color: "var(--law-muted)" }}>{tr("تبدأ المراحل الأولى سهلة وتصعب تدريجياً حتى مستوى الامتحان.")}</p>}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">{tr("كيف تريد أن تُختبر؟")}</h3>
        <div className="grid gap-2.5 sm:grid-cols-3" role="group" aria-label={tr("كيف تريد أن تُختبر؟")}>
          {MODES().map(([k, label, sub]) => <Chip key={k} on={draft.mode === k} onClick={() => setDraft((d) => ({ ...d, mode: k }))} sub={sub}>{label}</Chip>)}
        </div>
      </div>

      <div>
        <label className="mb-2 flex items-center justify-between gap-3 text-sm font-bold" htmlFor="exam-count">
          <span>{tr("عدد الأسئلة في كل مرحلة")}</span>
          <output htmlFor="exam-count" className="rounded-full px-3 py-0.5 text-sm" style={{ background: "var(--law-surface-2)" }}><bdi dir="ltr">{draft.count}</bdi></output>
        </label>
        <input id="exam-count" type="range" min={5} max={20} step={1} value={draft.count} onChange={(e) => setDraft((d) => ({ ...d, count: Number(e.target.value) }))} className="w-full" style={{ accentColor: "var(--law-accent)" }} aria-valuetext={String(draft.count)} />
        <div className="flex justify-between text-xs" style={{ color: "var(--law-muted)" }} aria-hidden="true"><bdi dir="ltr">5</bdi><bdi dir="ltr">20</bdi></div>
      </div>

      <div style={{ opacity: hasCase ? 1 : 0.55 }}>
        <h3 className="mb-2 text-sm font-bold">{tr("مصدر النوازل")}</h3>
        <div className="flex flex-wrap gap-2" role="group" aria-label={tr("مصدر النوازل")}>
          {CASE_SOURCES().map(([k, label, sub]) => <Chip key={k} on={draft.caseSource === k} onClick={() => setDraft((d) => ({ ...d, caseSource: k }))} sub={sub}>{label}</Chip>)}
        </div>
      </div>

      {err && <Notice tone="warn">{err}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button3D onClick={build} disabled={busy || draft.types.length === 0}><Sparkle size={18} weight="fill" aria-hidden="true" />{busy ? tr("جارٍ البناء…") : tr("ابنِ مسار الامتحان")}</Button3D>
        {saved?.builtAt && <Button3D variant="neutral" onClick={() => { setDraft({ ...saved }); setEditing(false); }}>{tr("إلغاء")}</Button3D>}
        {draft.types.length === 0 && <span className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("اختر نوعاً واحداً على الأقل.")}</span>}
      </div>
    </section>
  );
}
