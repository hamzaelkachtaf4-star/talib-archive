import { useEffect, useState } from "react";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Button3D from "@/components/LawOS/kit/Button3D";
import MascotSlot from "@/components/LawOS/kit/MascotSlot";
import { Notice } from "@/components/LawOS/ui";
import { useIsAdmin } from "@/components/LawOS/lib/useLawUser";
import { tr } from "@/components/LawOS/lib/i18n";

const CAUSES = () => [["MODEL_ERROR", tr("خطأ النموذج (تصحيح عام)")], ["CORPUS_PARSE", tr("خطأ في النص المستورد")], ["RETRIEVAL_MISS", tr("فشل الاسترجاع")], ["PROMPT_GAP", tr("نقص في التعليمات")]];

/** Admin: verify an AI-mistake report against the corpus, pick the root cause, get the generated eval case. */
export default function AdminCorrections() {
  const isAdmin = useIsAdmin();
  const [list, setList] = useState(null);
  const [cause, setCause] = useState({});
  const [out, setOut] = useState(null);
  const load = () => Law.adminCorrections("PENDING").then((r) => setList(r.ok ? r.data.corrections : []));
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);
  if (!isAdmin) return null;
  const [edit, setEdit] = useState({});
  const decide = async (c, decision) => {
    const id = c.id;
    const r = await Law.adminDecide(id, decision === "verify" ? { decision, rootCause: cause[id], correction: edit[id]?.correction ?? c.correction, evalQuestion: edit[id]?.question || undefined } : { decision });
    if (r.ok && r.data.evalCase) setOut(r.data.evalCase);
    load();
  };
  return (
    <>
      <PageTitle sub={tr("تحقق من البلاغ في النصوص قبل أن يؤثر على الطلبة")}>{tr("أخطاء المساعد")}</PageTitle>
      {out && <Notice tone="muted"><pre dir="ltr" className="whitespace-pre-wrap text-xs">{JSON.stringify(out, null, 2)}</pre>{tr("حالة تقييم جديدة: أضفها إلى server/__tests__/ai-evals/cases إن لم تُكتب تلقائيا.")}</Notice>}
      {list && !list.length && <MascotSlot moment="empty" message={tr("لا بلاغات معلّقة")} />}
      <ul className="grid gap-3">
        {(list || []).map((c) => (
          <li key={c.id} className="law-card3d grid gap-2 text-sm">
            <p><b>{tr("الادعاء")}:</b> <bdi>{c.claim}</bdi></p>
            <p><b>{tr("التصحيح المقترح")}:</b> <bdi>{c.correction}</bdi></p>
            {c.articles.map((a) => <p key={a.canonicalId} className="text-xs"><span className="law-chip"><bdi dir="ltr">{a.canonicalId}</bdi></span> <bdi>{a.text || tr("غير موجود")}</bdi></p>)}
            <label className="text-xs font-bold" htmlFor={`fix-${c.id}`}>{tr("الصياغة النهائية للتصحيح (عدّلها إن لزم)")}</label>
            <textarea id={`fix-${c.id}`} className="law-input" rows={3} dir="auto" value={edit[c.id]?.correction ?? c.correction} onChange={(e) => setEdit({ ...edit, [c.id]: { ...edit[c.id], correction: e.target.value } })} />
            <input className="law-input" dir="auto" placeholder={tr("سؤال محايد لحالة التقييم (اختياري)")} value={edit[c.id]?.question || ""} onChange={(e) => setEdit({ ...edit, [c.id]: { ...edit[c.id], question: e.target.value } })} aria-label={tr("سؤال محايد لحالة التقييم (اختياري)")} />
            <select className="law-input" value={cause[c.id] || ""} onChange={(e) => setCause({ ...cause, [c.id]: e.target.value })} aria-label={tr("السبب الجذري")}><option value="">{tr("اختر السبب الجذري")}</option>{CAUSES().map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <div className="flex gap-2"><Button3D onClick={() => decide(c, "verify")} disabled={!cause[c.id]}>{tr("تحقق")}</Button3D><Button3D variant="neutral" onClick={() => decide(c, "reject")}>{tr("رفض")}</Button3D></div>
          </li>
        ))}
      </ul>
    </>
  );
}
