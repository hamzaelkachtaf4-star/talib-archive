import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Law from "@/models/law";
import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Toggle from "@/components/LawOS/kit/Toggle";
import Button3D from "@/components/LawOS/kit/Button3D";
import EmptyState from "@/components/LawOS/kit/EmptyState";
import { Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

const STATUS = () => ({ SUSPECTED: tr("مشتبه"), ACTIVE: tr("نشط"), IMPROVING: tr("يتحسن"), RESOLVED: tr("تم تجاوزه"), DISMISSED: tr("ليس نقطة ضعف") });
const SOURCE = () => ({ QUIZ_DISTRACTOR: tr("خطأ في تمرين"), FSRS_LAPSE: tr("نسيان في المراجعة"), CHAT: tr("من محادثة"), DRILL_CORRECT: tr("إجابة صحيحة في تمرين"), EXERCISE: tr("تمرين") });

/** "ذاكرتي": everything the app remembers about the student's academic confusions: visible, dismissible, deletable, exportable. */
export default function Memory() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => Law.brainMe().then((r) => r.ok && setData(r.data));
  useEffect(() => { load(); }, []);
  const setEnabled = async (on) => { await Law.updatePreferences({ memoryEnabled: on }); load(); };
  const act = async (fn, text) => { await fn(); setMsg(text); load(); };
  async function download() {
    const res = await fetch(`${API_BASE}/law/brain/me/export`, { headers: baseHeaders() });
    if (!res.ok) return setMsg(tr("تعذر التصدير."));
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement("a"), { href: url, download: "my-memory.json" }).click();
    URL.revokeObjectURL(url);
  }
  if (!data) return null;
  return (
    <>
      <PageTitle sub={tr("ما يتذكره التطبيق عن مواضع الخلط الأكاديمي لديك، لتخصيص الشرح فقط")}>{tr("ذاكرتي")}</PageTitle>
      <div className="law-card3d mb-4 flex items-center justify-between gap-3">
        <span className="text-start"><span className="block font-bold">{tr("تفعيل الذاكرة")}</span><span className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("عند الإيقاف لا يُجمع شيء ولا يُستعمل شيء في الشرح.")}</span></span>
        <Toggle label={tr("تفعيل الذاكرة")} checked={data.enabled} onChange={setEnabled} />
      </div>
      {msg && <Notice tone="muted">{msg}</Notice>}
      <p className="mb-3 text-xs" style={{ color: "var(--law-muted)" }}>{tr("لا نحتفظ بأي تحليل لشخصيتك أو دوافعك: مواضيع قانونية فقط. لا يراها أصدقاؤك ولا المشرفون.")}</p>
      {data.memories.length === 0 && <EmptyState title={tr("لا شيء محفوظ بعد")} hint={tr("تظهر هنا مواضع الخلط حين تتكرر في تمارينك أو مراجعتك.")} />}
      <ul className="grid gap-3">
        {data.memories.map((m) => (
          <li key={m.id} className="law-card3d grid gap-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold"><bdi>{m.summaryAr}</bdi></p>
              <span className="law-chip" data-active={m.status === "ACTIVE" || undefined}>{STATUS()[m.status]}</span>
            </div>
            <div role="progressbar" aria-label={tr("القوة")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(m.strength * 100)} className="h-2 overflow-hidden rounded-full" style={{ background: "var(--law-surface-2)" }}>
              <div className="h-full" style={{ inlineSize: `${m.strength * 100}%`, background: "var(--law-accent)" }} />
            </div>
            <ul className="text-xs" style={{ color: "var(--law-muted)" }}>
              {m.evidence.slice(0, 5).map((e, i) => <li key={i}>{SOURCE()[e.source] || e.source}{e.excerpt ? <> — «<bdi>{e.excerpt}</bdi>»</> : null} · <bdi dir="ltr">{String(e.createdAt).slice(0, 10)}</bdi></li>)}
            </ul>
            <div className="flex flex-wrap gap-3 text-sm font-bold">
              {m.status !== "DISMISSED" && <button type="button" onClick={() => act(() => Law.brainDismiss(m.id), tr("لن نقترح هذه النقطة من المحادثات لمدة 60 يوما."))} style={{ color: "var(--law-primary)" }}>{tr("ليست نقطة ضعف")}</button>}
              <button type="button" onClick={() => act(() => Law.brainDelete(m.id), tr("حُذفت."))} style={{ color: "var(--law-danger)" }}>{tr("حذف")}</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button3D to="/law/exam/weak-spots">{tr("تمارين نقاط ضعفي")}</Button3D>
        <Button3D variant="neutral" onClick={download}>{tr("تصدير بياناتي (JSON)")}</Button3D>
        <Button3D variant="danger" onClick={() => window.confirm(tr("حذف كل الذاكرة نهائيا؟")) && act(() => Law.brainReset(), tr("حُذفت كل الذاكرة."))}>{tr("حذف كل شيء")}</Button3D>
      </div>
      <p className="mt-4 text-xs"><Link to="/law/legal" style={{ color: "var(--law-primary)" }}>{tr("الإشعار القانوني")}</Link></p>
    </>
  );
}
