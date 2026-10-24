import { useEffect, useState } from "react";
import { Back } from "@/components/LawOS/kit/DirArrow";
import { Link, useNavigate, useParams } from "react-router-dom";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice, Textarea } from "@/components/LawOS/ui";
import DiffViewer from "@/components/LawOS/hub/DiffViewer";
import { useLawUser } from "@/components/LawOS/lib/useLawUser";
import { tr } from "@/components/LawOS/lib/i18n";

const STATUS = () => ({ OPEN: tr("مفتوح"), MERGED: tr("مدموج"), REJECTED: tr("مرفوض"), CONFLICT: tr("تعارض"), WITHDRAWN: tr("مسحوب") });

/** One change request: the server-computed diff, merge/reject for the note's owner, rebase/withdraw for the proposer. */
export default function ChangeRequest() {
  const { id } = useParams();
  const user = useLawUser();
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  const [rebase, setRebase] = useState(null); // textarea content while resolving a conflict
  const [conflicts, setConflicts] = useState([]);
  const load = () => Law.hubCR(id).then((r) => { if (r.ok) { setV(r.data); setConflicts(r.data.conflicts || []); } else setErr(tr("طلب التعديل غير موجود.")); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action, body) => {
    setErr(null);
    const r = await Law.hubCRAction(id, action, body);
    if (r.ok) { if (action === "merge") navigate(`/law/hub/notes/${v.changeRequest.noteId}`); else load(); return; }
    const code = r.data?.error?.code;
    if (code === "conflict") { setConflicts(r.data.error.details.conflicts || []); setErr(tr("تعارض مع تعديلات أحدث: يجب على صاحب الاقتراح مراجعته أولا.")); load(); }
    else setErr(code === "edit_conflict" ? tr("تغيّر الملخص للتو. أعد المحاولة.") : tr("تعذر تنفيذ الإجراء."));
  };

  if (!v) return err ? <Notice tone="warn">{err}</Notice> : null;
  const cr = v.changeRequest;
  const mine = cr.author.userId === user?.id;
  const open = ["OPEN", "CONFLICT"].includes(cr.status);
  return (
    <>
      <PageTitle sub={<><bdi>{cr.author.name}</bdi> · <span className="law-chip">{STATUS()[cr.status]}</span></>}><bdi>{cr.title}</bdi></PageTitle>
      <Link to={`/law/hub/notes/${cr.noteId}`} className="mb-3 inline-block text-sm font-semibold" style={{ color: "var(--law-primary)" }}><Back /> <bdi>{v.noteTitle}</bdi></Link>
      {cr.description && <p className="mb-3 text-sm"><bdi>{cr.description}</bdi></p>}
      {err && <Notice tone="warn">{err}</Notice>}
      {v.headChanged && <Notice tone={v.mergeable ? "muted" : "warn"}>{v.mergeable ? tr("تغيّر الملخص منذ هذا الاقتراح، لكن التعديلين لا يتعارضان وسيُدمجان.") : tr("تغيّر الملخص في الفقرات نفسها: لا يمكن الدمج دون مراجعة.")}</Notice>}
      <DiffViewer blocks={v.diff} />
      {conflicts.length > 0 && (
        <section className="mt-4 grid gap-3" aria-label={tr("التعارضات")}>
          <h2 className="font-bold">{tr("التعارضات")}</h2>
          {conflicts.map((c, i) => (
            <div key={i} className="law-card3d grid gap-2 sm:grid-cols-2">
              <div><p className="text-xs font-bold">{tr("الملخص الحالي")}</p><p style={{ whiteSpace: "pre-wrap", unicodeBidi: "plaintext" }}>{c.ours.join("\n\n")}</p></div>
              <div><p className="text-xs font-bold">{tr("اقتراحك")}</p><p style={{ whiteSpace: "pre-wrap", unicodeBidi: "plaintext" }}>{c.theirs.join("\n\n")}</p></div>
            </div>
          ))}
        </section>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {open && !mine && <Button3D onClick={() => act("merge")} disabled={cr.status === "CONFLICT"}>{tr("دمج")}</Button3D>}
        {open && !mine && <Button3D variant="neutral" onClick={() => act("reject", { reviewNote: window.prompt(tr("سبب الرفض (اختياري)")) || undefined })}>{tr("رفض")}</Button3D>}
        {open && mine && <Button3D variant="neutral" onClick={() => setRebase(rebase === null ? v.proposedContent : null)}>{tr("مراجعة وإعادة التأسيس")}</Button3D>}
        {open && mine && <Button3D variant="danger" onClick={() => act("withdraw")}>{tr("سحب الطلب")}</Button3D>}
      </div>
      {rebase !== null && (
        <div className="mt-4 grid gap-2">
          <Textarea rows={14} value={rebase} onChange={(e) => setRebase(e.target.value)} dir="auto" aria-label={tr("النص المقترح")} />
          <Button3D onClick={async () => { await act("rebase", { content: rebase }); setRebase(null); }}>{tr("إرسال النسخة المحدّثة")}</Button3D>
        </div>
      )}
    </>
  );
}
