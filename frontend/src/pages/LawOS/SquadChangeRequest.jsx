import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Back } from "@/components/LawOS/kit/DirArrow";
import { Notice, Textarea } from "@/components/LawOS/ui";
import DiffViewer from "@/components/LawOS/hub/DiffViewer";
import { useLawUser } from "@/components/LawOS/lib/useLawUser";
import { tr } from "@/components/LawOS/lib/i18n";
import { docError } from "./SquadDocs";

const STATUS = () => ({ OPEN: tr("مفتوح"), MERGED: tr("مدموج"), REJECTED: tr("مرفوض"), CONFLICT: tr("تعارض"), WITHDRAWN: tr("مسحوب") });

/** Inline review of a squad change request: the server-computed diff, a stale-base warning, approve / reject, rebase for the author. */
export default function SquadChangeRequest() {
  const { id } = useParams();
  const user = useLawUser();
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  const [rebase, setRebase] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const load = () => Law.squadCR(id).then((r) => { if (r.ok) { setV(r.data); setConflicts(r.data.conflicts || []); } else setErr(tr("طلب التعديل غير موجود.")); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action, body) => {
    setErr(null);
    const r = await Law.squadCRAction(id, action, body);
    if (r.ok) { if (action === "merge") navigate(`/law/squad/docs/${v.changeRequest.docId}`); else load(); return true; }
    if (r.data?.error === "conflict") { setConflicts(r.data.conflicts || []); load(); }
    setErr(docError(r));
    return false;
  };

  if (!v) return err ? <Notice tone="warn">{err}</Notice> : null;
  const cr = v.changeRequest;
  const mine = cr.author.userId === user?.id;
  const open = ["OPEN", "CONFLICT"].includes(cr.status);
  return (
    <>
      <PageTitle sub={<><bdi>{cr.author.name}</bdi> · <span className="law-chip">{STATUS()[cr.status]}</span></>}><bdi>{cr.title}</bdi></PageTitle>
      <Link to={`/law/squad/docs/${cr.docId}`} className="mb-3 inline-block text-sm font-semibold" style={{ color: "var(--law-primary)" }}><Back /> <bdi>{v.docTitle}</bdi></Link>
      {cr.description && <p className="mb-3 text-sm"><bdi>{cr.description}</bdi></p>}
      {err && <Notice tone="warn">{err}</Notice>}
      {v.headChanged && <Notice tone={v.mergeable ? "muted" : "warn"}>{v.mergeable ? tr("تغيّرت الوثيقة منذ هذا الاقتراح، لكن التعديلين لا يتعارضان وسيُدمجان.") : tr("تغيّرت الوثيقة في الفقرات نفسها: لا يمكن الدمج دون مراجعة صاحب الاقتراح.")}</Notice>}
      <DiffViewer blocks={v.diff} />
      {conflicts.length > 0 && (
        <section className="mt-4 grid gap-3" aria-label={tr("التعارضات")}>
          <h2 className="font-bold">{tr("التعارضات")}</h2>
          {conflicts.map((c, i) => (
            <div key={i} className="law-card3d grid gap-2 sm:grid-cols-2">
              <div><p className="text-xs font-bold">{tr("النص الحالي")}</p><p style={{ whiteSpace: "pre-wrap", unicodeBidi: "plaintext" }}>{c.ours.join("\n\n")}</p></div>
              <div><p className="text-xs font-bold">{tr("الاقتراح")}</p><p style={{ whiteSpace: "pre-wrap", unicodeBidi: "plaintext" }}>{c.theirs.join("\n\n")}</p></div>
            </div>
          ))}
        </section>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {open && v.canReview && <Button3D onClick={() => act("merge")} disabled={cr.status === "CONFLICT"}>{tr("موافقة ودمج")}</Button3D>}
        {open && v.canReview && <Button3D variant="neutral" onClick={() => { const note = window.prompt(tr("سبب الرفض (اختياري)")); if (note !== null) act("reject", { reviewNote: note || undefined }); }}>{tr("رفض")}</Button3D>}
        {open && mine && <Button3D variant="neutral" onClick={() => setRebase(rebase === null ? (v.suggestedContent ?? v.proposedContent) : null)}>{tr("مراجعة وإعادة التأسيس")}</Button3D>}
        {open && mine && <Button3D variant="danger" onClick={() => act("withdraw")}>{tr("سحب الطلب")}</Button3D>}
      </div>
      {rebase !== null && (
        <div className="mt-4 grid gap-2">
          {v.headChanged && <Notice>{tr("النص أدناه هو آخر نسخة من الوثيقة مع تعديلاتك التي لا تتعارض. الفقرات المتعارضة بقيت بصياغتها الحالية: أعد كتابة تعديلك فيها ثم أرسله.")}</Notice>}
          <Textarea rows={14} value={rebase} onChange={(e) => setRebase(e.target.value)} dir="auto" aria-label={tr("النص المقترح")} />
          <Button3D onClick={async () => { if (await act("rebase", { content: rebase })) setRebase(null); }}>{tr("إرسال النسخة المحدّثة")}</Button3D>
        </div>
      )}
    </>
  );
}
