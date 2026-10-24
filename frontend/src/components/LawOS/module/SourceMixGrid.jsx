import { useEffect, useState } from "react";
import { BookOpen, Check, FilePdf, Minus, Plus, Scales, Sparkle } from "@phosphor-icons/react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { equalSplit, MIX_KEYS, mixTotal, shiftShare, toggleKind } from "./mixOps";

const KINDS = () => ({
  lectures: { label: tr("المحاضرات"), hint: tr("ما سجّلته وكتبته في الحصص"), Icon: BookOpen, ready: true },
  printed: { label: tr("المطبوع"), hint: tr("ملفات PDF وما أعطاه الأستاذ"), Icon: FilePdf, ready: true },
  research: { label: tr("البحث مع الذكاء الاصطناعي"), hint: tr("قريباً: بحث موجَّه خارج ملاحظاتك"), Icon: Sparkle, ready: false },
  legal: { label: tr("النصوص القانونية"), hint: tr("الفصول التي ربطتها بالمادة"), Icon: Scales, ready: true },
});

/**
 * «مصادر المادة»: how much of each kind of source the mentor and the exercises should lean on. A kind at 0% is not read at
 * all; the shares always add up to 100. Stored per subject.
 */
export default function SourceMixGrid({ moduleId, initial, onSaved }) {
  const [mix, setMix] = useState(initial || equalSplit(["lectures", "printed", "legal"]));
  const [saved, setSaved] = useState(initial || null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { setMix(initial || equalSplit(["lectures", "printed", "legal"])); setSaved(initial || null); }, [moduleId]); // eslint-disable-line react-hooks/exhaustive-deps
  const kinds = KINDS();
  const dirty = JSON.stringify(mix) !== JSON.stringify(saved);
  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await Law.moduleProfileSave(moduleId, { sourceMix: mix });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "warn", text: r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذر الحفظ.") });
    setSaved(r.data.profile.sourceMix);
    onSaved?.(r.data.profile.sourceMix);
    setMsg({ tone: "muted", text: tr("تم الحفظ.") });
  }
  return (
    <section className="grid gap-3" aria-label={tr("مصادر المادة")}>
      <div>
        <h3 className="text-base font-bold">{tr("مصادر المادة")}</h3>
        <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("اختر ما يعتمد عليه المساعد والتمارين، وكم تعطي لكل مصدر. ما كان 0٪ لا يُقرأ.")}</p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2" role="group" aria-label={tr("مصادر المادة")}>
        {MIX_KEYS.map((k) => {
          const d = kinds[k];
          const on = mix[k] > 0;
          return (
            <div key={k} className="flex items-center gap-3 rounded-2xl border-2 p-3" style={{ borderColor: on ? "var(--law-accent)" : "var(--law-border)", background: on ? "var(--law-surface-2)" : "var(--law-surface)", opacity: d.ready ? 1 : 0.6 }}>
              <button type="button" aria-pressed={on} disabled={!d.ready} aria-label={d.label} onClick={() => setMix((m) => toggleKind(m, k))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: on ? "var(--law-accent)" : "var(--law-surface-2)", color: on ? "var(--law-on-accent)" : "var(--law-muted)" }}>
                {on ? <Check size={20} weight="bold" aria-hidden="true" /> : <d.Icon size={20} aria-hidden="true" />}
              </button>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold"><bdi>{d.label}</bdi></span><span className="block text-xs" style={{ color: "var(--law-muted)" }}>{d.hint}</span></span>
              {on && (
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" aria-label={tr("أنقص")} onClick={() => setMix((m) => shiftShare(m, k, -5))} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--law-surface)", border: "1px solid var(--law-border)" }}><Minus size={14} aria-hidden="true" /></button>
                  <output className="w-12 text-center text-sm font-bold" aria-label={`${d.label} %`}><bdi dir="ltr">{mix[k]}%</bdi></output>
                  <button type="button" aria-label={tr("زد")} onClick={() => setMix((m) => shiftShare(m, k, 5))} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--law-surface)", border: "1px solid var(--law-border)" }}><Plus size={14} aria-hidden="true" /></button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <Button3D onClick={save} disabled={busy || !dirty || mixTotal(mix) !== 100}>{busy ? tr("جارٍ الحفظ…") : tr("حفظ")}</Button3D>
        <Button3D variant="neutral" onClick={() => setMix(equalSplit(MIX_KEYS.filter((k) => mix[k] > 0)))}>{tr("وزّع بالتساوي")}</Button3D>
        <span className="text-xs" style={{ color: "var(--law-muted)" }}>{saved ? tr("مضبوط على اختيارك") : tr("غير مضبوط: كل المصادر بالتساوي")}</span>
      </div>
    </section>
  );
}
