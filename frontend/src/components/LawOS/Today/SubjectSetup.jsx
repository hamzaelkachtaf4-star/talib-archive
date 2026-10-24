import { useState } from "react";
import { Check, ChatCircleDots } from "@phosphor-icons/react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Input, Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { FORMATS, ordered, SEMESTERS, COLORS, colorLabel } from "./formats";

const ERR = () => ({
  duplicate_title: tr("هذه المادة موجودة."),
  invalid_title: tr("اكتب اسماً من حرفين إلى 80 حرفاً."),
  too_many_modules: tr("بلغت الحد الأقصى من المواد."),
});

/** Setup of one subject: name, semester, the formats in the student's order, and how to split it. `module` edits an existing one. */
export default function SubjectSetup({ module, semester: defaultSemester, onDone, onCancel }) {
  const [name, setName] = useState(module?.title || "");
  const [semester, setSemester] = useState(module?.semester || defaultSemester || "S3");
  const [formats, setFormats] = useState(module?.formats || []);
  const initialStructure = module?.viewStyle === "axes" ? "axes" : "sessions";
  const [structure, setStructure] = useState(initialStructure);
  const [color, setColor] = useState(module?.color || null);
  const [isPublic, setIsPublic] = useState(!!module?.isPublic);
  const [createdId, setCreatedId] = useState(null); // kept if the formats save fails, so a retry does not add the subject twice
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const toggle = (k) => setFormats((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const list = ordered(formats);
  const info = FORMATS();
  const label = (k) => info.find((f) => f[0] === k)[3];
  const plan = [];
  if (!formats.length) plan.push(tr("اختر طريقة واحدة على الأقل. يمكنك الجمع بين عدة طرق، مثلاً خطاطة شجرية ثم شرح مفصل ثم جداول."));
  else {
    plan.push(tr("في كل حصة سأعرض {0}.", [list.map(label).join(" · ")]));
    if (formats.includes("brief") && formats.includes("full")) plan.push(tr("الموجز مع الشامل اختيار جيد: الموجز للمراجعة السريعة قبل الامتحان."));
    if (formats.includes("cards") || formats.includes("qa")) plan.push(tr("البطاقات والأسئلة أضعها دائماً في آخر الحصة لتختبر نفسك."));
    if (formats.length >= 4) plan.push(tr("اخترت طرقاً كثيرة. يمكنك عرض طريقة واحدة فقط متى شئت."));
    plan.push(structure === "axes" ? tr("سأتبع التقسيم الأكاديمي: محاور ومباحث كما في المطبوع.") : tr("سأقسم المادة إلى حصص على شكل مسار."));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    let id = module?.id || createdId;
    if (!id) {
      const r = await Law.moduleAdd({ semester, title: name.trim() });
      if (!r.ok) { setBusy(false); return setErr(r.offline ? tr("يحتاج اتصالا بالخادم.") : ERR()[r.data?.error?.code] || tr("تعذرت الإضافة.")); }
      id = r.data?.module?.id;
      setCreatedId(id);
    }
    const p = await Law.moduleProfileSave(id, { formats: list, ...(color !== (module?.color || null) ? { color } : {}), ...(isPublic !== !!module?.isPublic ? { isPublic } : {}), ...(structure !== initialStructure ? { viewStyle: structure === "axes" ? "axes" : "trail" } : {}) });
    setBusy(false);
    if (!p.ok) return setErr(tr("تعذر حفظ الطريقة. أعد المحاولة."));
    onDone(semester);
  }

  const valid = (module || name.trim().length >= 2) && formats.length > 0;
  return (
    <form onSubmit={save} className="grid gap-4 lg:grid-cols-[1fr_20rem]" aria-label={module ? tr("تعديل طريقة التعلم") : tr("مادة جديدة")}>
      <div className="law-card grid gap-4 p-5">
        <h2 className="text-lg font-bold">{module ? tr("تعديل طريقة التعلم") : tr("مادة جديدة")}</h2>
        {!module && (
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={tr("اسم المادة")} aria-label={tr("اسم المادة")} dir="auto" autoFocus />
            <select value={semester} onChange={(e) => setSemester(e.target.value)} aria-label={tr("السداسي")} className="law-input">
              {SEMESTERS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div>
          <p className="mb-2 text-sm font-bold">{tr("كيف تحب أن تتعلم هذه المادة؟")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {info.map(([k, long, desc, , Icon]) => {
              const idx = list.indexOf(k);
              return (
                <button key={k} type="button" aria-pressed={idx >= 0} onClick={() => toggle(k)} className="flex items-center gap-3 rounded-2xl border-2 p-3 text-start transition-colors"
                  style={idx >= 0 ? { borderColor: "var(--law-accent)", background: "var(--law-surface-2)" } : { borderColor: "var(--law-border)" }}>
                  <Icon size={22} weight={idx >= 0 ? "fill" : "regular"} style={{ color: "var(--law-accent)" }} />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{long}</span><span className="block text-xs" style={{ color: "var(--law-muted)" }}>{desc}</span></span>
                  {idx >= 0 && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--law-accent)", color: "var(--law-on-accent)" }}><bdi dir="ltr">{idx + 1}</bdi></span>}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold">{tr("لون المادة")}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={tr("لون المادة")}>
            {Object.entries(COLORS).map(([k, rgb]) => (
              <button key={k} type="button" aria-pressed={color === k} aria-label={colorLabel(k)} onClick={() => setColor(color === k ? null : k)} className="h-8 w-8 rounded-full border-2" style={{ background: rgb, borderColor: color === k ? "var(--law-text)" : "transparent", boxShadow: color === k ? "0 0 0 2px var(--law-surface)" : undefined }} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold">{tr("من يرى هذه المادة؟")}</p>
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={tr("من يرى هذه المادة؟")}>
            {[[false, tr("خاصة"), tr("تظهر لك وحدك")], [true, tr("عمومية"), tr("تظهر لزملاء كليتك في الملتقى")]].map(([v, l, d]) => (
              <button key={String(v)} type="button" aria-pressed={isPublic === v} onClick={() => setIsPublic(v)} className="rounded-2xl border-2 p-3 text-start" style={isPublic === v ? { borderColor: "var(--law-accent)", background: "var(--law-surface-2)" } : { borderColor: "var(--law-border)" }}>
                <span className="block text-sm font-bold">{l}</span><span className="block text-xs" style={{ color: "var(--law-muted)" }}>{d}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold">{tr("التقسيم")}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={tr("التقسيم")}>
            {[["sessions", tr("حسب الحصص")], ["axes", tr("حسب المحاور والمباحث")]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={structure === k} onClick={() => setStructure(k)} className="law-btn3d" data-variant={structure === k ? undefined : "neutral"}>
                {structure === k && <Check size={16} weight="bold" />}{l}
              </button>
            ))}
          </div>
        </div>
        {err && <Notice tone="warn">{err}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button3D type="submit" disabled={!valid || busy}>{busy ? tr("جارٍ الحفظ…") : tr("حفظ")}</Button3D>
          <Button3D variant="neutral" onClick={onCancel}>{tr("إلغاء")}</Button3D>
        </div>
      </div>
      <aside className="law-card h-fit p-5" aria-label={tr("مساعد طالب")}>
        <h3 className="mb-1 flex items-center gap-2 text-base font-bold"><ChatCircleDots size={20} weight="duotone" style={{ color: "var(--law-accent)" }} />{tr("مساعد طالب")}</h3>
        <p className="mb-3 text-xs" style={{ color: "var(--law-muted)" }}>{tr("يرافقك خطوة بخطوة")}</p>
        <ul className="grid gap-2 text-sm">{plan.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </aside>
    </form>
  );
}
