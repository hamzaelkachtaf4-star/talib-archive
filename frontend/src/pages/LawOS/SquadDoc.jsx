import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Back } from "@/components/LawOS/kit/DirArrow";
import { Field, Input, Notice, Textarea } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { DOC_TYPES, docError } from "./SquadDocs";
import PendingRequests from "@/components/LawOS/hub/PendingRequests";

const when = (iso) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(new Date(iso));

/** One squad document: read it, edit in place (author or admin) or propose a change (any other editor). */
export default function SquadDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [revs, setRevs] = useState([]);
  const [err, setErr] = useState(null);
  const [text, setText] = useState(null); // null = reading
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const load = () =>
    Law.squadDoc(id).then((r) => {
      if (!r.ok) return setErr(r.status === 404 ? tr("الوثيقة غير موجودة.") : docError(r));
      setV(r.data);
      setErr(null);
    });
  useEffect(() => { load(); Law.squadDocRevisions(id).then((r) => r.ok && setRevs(r.data.revisions)); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return err ? <Notice tone="warn">{err}</Notice> : null;
  const { doc } = v;
  const T = DOC_TYPES()[doc.type];

  async function save() {
    setErr(null);
    const r = v.canEditDirect
      ? await Law.editSquadDoc(id, { content: text, baseRevisionId: doc.headRevisionId, message: why || undefined })
      : await Law.proposeSquadDoc(id, { title, description: why || undefined, content: text });
    if (!r.ok) return setErr(docError(r));
    setText(null); setWhy(""); setTitle("");
    if (!v.canEditDirect) return navigate(`/law/squad/change-requests/${r.data.changeRequest.id}`);
    load();
  }
  async function remove() {
    if (!window.confirm(tr("حذف هذه الوثيقة؟"))) return;
    const r = await Law.deleteSquadDoc(id);
    if (r.ok) navigate("/law/squad/docs"); else setErr(docError(r));
  }
  return (
    <>
      <PageTitle sub={<>{T?.label} · <bdi>{doc.author}</bdi> · {when(doc.updatedAt)}</>}><bdi>{doc.title}</bdi></PageTitle>
      <Link to="/law/squad/docs" className="mb-3 inline-block text-sm font-semibold" style={{ color: "var(--law-primary)" }}><Back /> {tr("وثائق الفرقة")}</Link>
      {err && <Notice tone="warn">{err}</Notice>}
      {doc.url && <p className="mb-3 text-sm"><a href={doc.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "var(--law-primary)" }}><bdi dir="ltr">{doc.url}</bdi></a></p>}
      {text === null ? (
        <>
          <article className="law-card3d mb-4"><p style={{ whiteSpace: "pre-wrap", unicodeBidi: "plaintext" }}>{doc.content}</p></article>
          <div className="flex flex-wrap gap-2">
            {(v.canEditDirect || v.canPropose) && <Button3D onClick={() => { setText(doc.content); setTitle(""); }}>{v.canEditDirect ? tr("تعديل") : tr("اقتراح تعديل")}</Button3D>}
            {v.canEditDirect && <Button3D variant="danger" onClick={remove}>{tr("حذف")}</Button3D>}
          </div>
        </>
      ) : (
        <div className="grid gap-3">
          {!v.canEditDirect && <Notice>{tr("لست صاحب هذه الوثيقة: سيُرسل تعديلك كطلب يراجعه مشرف الفرقة قبل الدمج.")}</Notice>}
          {!v.canEditDirect && <Field label={tr("عنوان الاقتراح")}><Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field>}
          <Textarea rows={16} value={text} onChange={(e) => setText(e.target.value)} dir="auto" aria-label={tr("المحتوى")} />
          <Field label={v.canEditDirect ? tr("ملاحظة التعديل (اختياري)") : tr("وصف الاقتراح (اختياري)")}><Input value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
          <div className="flex gap-2">
            <Button3D onClick={save} disabled={!text.trim() || (!v.canEditDirect && !title.trim())}>{v.canEditDirect ? tr("حفظ") : tr("إرسال الاقتراح")}</Button3D>
            <Button3D variant="neutral" onClick={() => setText(null)}>{tr("إلغاء")}</Button3D>
          </div>
        </div>
      )}
      {text === null && <PendingRequests docId={id} canReview={v.canReview} onMerged={load} />}
      {revs.length > 0 && (
        <section className="mt-6" aria-label={tr("السجل")}>
          <h2 className="mb-2 font-bold">{tr("السجل")}</h2>
          <ul className="grid gap-1 text-sm">{revs.map((r) => <li key={r.id} style={{ color: "var(--law-muted)" }}>{when(r.createdAt)} · <bdi>{r.author}</bdi>{r.message && <> · <bdi>{r.message}</bdi></>}{r.head && <span className="law-chip ms-2">{tr("الحالية")}</span>}</li>)}</ul>
        </section>
      )}
    </>
  );
}
