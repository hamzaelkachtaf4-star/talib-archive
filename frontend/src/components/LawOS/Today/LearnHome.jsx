import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Globe, LockSimple, UploadSimple, PencilSimple, CalendarBlank, ArrowLeft, Sliders } from "@phosphor-icons/react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import ProgressRing from "@/components/LawOS/kit/ProgressRing";
import { Notice, Textarea } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { formatInfo, ordered, SAMPLE_MODULES, COLORS } from "./formats";

const pct = (m) => (m.total ? Math.round((100 * m.completed) / m.total) : 0);

/** «ابدأ من استعمال الزمن»: shown until the student has subjects. Upload goes to the real timetable import. */
export function TimetableBanner({ semester, onChanged }) {
  const [manual, setManual] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function addAll(titles) {
    setBusy(true);
    let added = 0;
    let offline = false;
    for (const title of titles) {
      const r = await Law.moduleAdd({ semester, title });
      if (r.ok) added++; // an existing subject (duplicate_title) is simply skipped
      if (r.offline) { offline = true; break; }
    }
    setBusy(false);
    setMsg(offline ? tr("يحتاج اتصالا بالخادم.") : added ? tr("أُضيفت {0} مواد.", [added]) : tr("لم تُضف مواد جديدة."));
    setManual(false);
    setText("");
    onChanged();
  }
  const lines = text.split("\n").map((s) => s.trim()).filter((s) => s.length >= 2).slice(0, 20);
  return (
    <section className="law-card grid gap-3 p-5" aria-label={tr("استعمال الزمن")}>
      <div className="flex items-center gap-3">
        <CalendarBlank size={28} weight="duotone" style={{ color: "var(--law-accent)" }} />
        <h2 className="text-lg font-bold">{tr("ابدأ من استعمال الزمن ديالك")}</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button3D to="/law/timetable"><UploadSimple size={18} />{tr("ارفع استعمال الزمن")}</Button3D>
        <Button3D variant="neutral" onClick={() => setManual((m) => !m)} aria-expanded={manual}><PencilSimple size={18} />{tr("اكتب المواد بيدك")}</Button3D>
        <button type="button" disabled={busy} onClick={() => addAll(SAMPLE_MODULES())} className="inline-flex items-center gap-1 px-2 text-sm font-bold" style={{ color: "var(--law-accent)" }}>
          {tr("جرّب باستعمال زمن نموذجي")} <ArrowLeft size={16} className="rtl:rotate-0 ltr:rotate-180" />
        </button>
      </div>
      {manual && (
        <div className="grid gap-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} dir="auto" placeholder={tr("اكتب اسم كل مادة في سطر")} aria-label={tr("المواد")} />
          <div><Button3D disabled={!lines.length || busy} onClick={() => addAll(lines)}>{tr("إضافة المواد")} (<bdi dir="ltr">{lines.length}</bdi>)</Button3D></div>
        </div>
      )}
      <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("الزمن النموذجي يضيف مواد S3 قانون خاص كمواد عادية يمكنك حذفها أو تعديلها. ليس قراءة حقيقية لصورة.")}</p>
      {msg && <Notice>{msg}</Notice>}
    </section>
  );
}

/** «تابع من حيث توقفت»: the started module that is furthest along. */
export function ResumeCard({ modules }) {
  const m = [...modules].filter((x) => x.total > 0 && x.completed > 0 && x.completed < x.total).sort((a, b) => pct(b) - pct(a))[0];
  if (!m) return null;
  return (
    <section className="law-card flex flex-wrap items-center gap-4 p-5" aria-label={tr("تابع من حيث توقفت")}>
      <ProgressRing value={m.completed} max={m.total} size={72} stroke={7} color="var(--law-gold)" label={tr("التقدم")}>
        <bdi dir="ltr" className="text-sm font-bold">{pct(m)}%</bdi>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold" style={{ color: "var(--law-muted)" }}>{tr("تابع من حيث توقفت")}</p>
        <h2 className="truncate text-lg font-bold"><bdi>{m.title}</bdi></h2>
        <p className="text-sm" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{m.completed}/{m.total}</bdi> {tr("حصص")}</p>
      </div>
      <Button3D to={`/law/path/m/${m.id}`} variant="gold">{tr("تابع")} <ArrowLeft size={16} className="rtl:rotate-0 ltr:rotate-180" /></Button3D>
    </section>
  );
}

/** «موادي»: one card per subject with the formats the student chose for it. */
export function MySubjects({ modules, onNew, onEdit, onToggleVisibility }) {
  return (
    <section aria-label={tr("موادي")}>
      <h2 className="mb-3 text-lg font-bold">{tr("موادي")} (<bdi dir="ltr">{modules.length}</bdi>)</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <article key={m.id} className="law-card flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[m.color] || COLORS.slate }} />
              <h3 className="min-w-0 flex-1 truncate text-base font-bold"><bdi>{m.title}</bdi></h3>
              <button type="button" aria-pressed={!!m.isPublic} onClick={() => onToggleVisibility(m)} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={m.isPublic ? { background: "var(--law-accent)", color: "var(--law-on-accent)" } : { background: "var(--law-surface-2)", border: "1px solid var(--law-border)" }}>
                {m.isPublic ? <Globe size={14} /> : <LockSimple size={14} />}{m.isPublic ? tr("عمومي") : tr("خاص")}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ordered(m.formats || []).map((k) => <span key={k} className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "var(--law-surface-2)", border: "1px solid var(--law-border)", color: "var(--law-accent)" }}>{formatInfo(k)[3]}</span>)}
              {!m.formats?.length && <button type="button" onClick={() => onEdit(m)} className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: "var(--law-accent)" }}><Sliders size={14} />{tr("اختر طريقة التعلم")}</button>}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs" style={{ color: "var(--law-muted)" }}>
                <span><bdi dir="ltr">{m.completed} / {m.total}</bdi> {tr("حصص")}</span>
                <bdi dir="ltr">{pct(m)}%</bdi>
              </div>
              <span className="block h-2 overflow-hidden rounded-full" style={{ background: "var(--law-surface-2)" }}>
                <span className="block h-full rounded-full" style={{ inlineSize: `${pct(m)}%`, background: "var(--law-accent)" }} />
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button3D to={`/law/path/m/${m.id}`}>{tr("فتح")} <ArrowLeft size={16} className="rtl:rotate-0 ltr:rotate-180" /></Button3D>
              {m.formats?.length > 0 && <Button3D variant="neutral" onClick={() => onEdit(m)} aria-label={tr("تعديل طريقة التعلم")}><Sliders size={16} /></Button3D>}
            </div>
          </article>
        ))}
        <button type="button" onClick={onNew} className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center" style={{ borderColor: "var(--law-border)", color: "var(--law-muted)" }}>
          <Plus size={26} weight="bold" style={{ color: "var(--law-accent)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--law-text)" }}>{tr("مادة جديدة")}</span>
          <span className="text-xs">{tr("اختر طريقتك مرة واحدة، والمساعد يلتزم بها")}</span>
        </button>
      </div>
    </section>
  );
}
