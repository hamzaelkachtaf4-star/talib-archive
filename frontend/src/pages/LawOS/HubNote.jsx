import { useEffect, useState } from "react";
import { Back } from "@/components/LawOS/kit/DirArrow";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GitFork, HandsClapping, PencilSimpleLine, Flag } from "@phosphor-icons/react";
import Sheet from "@/components/LawOS/kit/Sheet";
import Avatar from "@/components/LawOS/kit/Avatar";
import Button3D from "@/components/LawOS/kit/Button3D";
import Law from "@/models/law";
import { Button, Notice, Textarea, Input, Select } from "@/components/LawOS/ui";
import { PageTitle } from "@/components/LawOS/EmptyState";
import MasterNoteView from "@/components/LawOS/Squad/MasterNoteView";
import { squadError } from "./Squad";
import { tr } from "@/components/LawOS/lib/i18n";

/** A public master note: read, endorse (التوثيق), fork into my squad. */
export default function HubNote() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null); // { title, content }
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("INAPPROPRIATE");
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    Law.hubNote(id).then((r) => (r.ok ? setNote(r.data.note) : setError(squadError(r))));
  }, [id]);

  async function endorse() {
    setBusy(true);
    const r = await Law.endorseNote(id);
    setBusy(false);
    if (!r.ok) return setError(squadError(r));
    setNote((n) => ({ ...n, endorsedByMe: r.data.endorsed, endorsementCount: r.data.endorsementCount, verified: r.data.verified }));
  }

  async function fork() {
    if (!window.confirm(tr("نسخ هذه المحاضرة إلى فرقتك لتطويرها؟ يبقى اسم صاحبها الأصلي ظاهراً."))) return;
    setBusy(true);
    const r = await Law.forkNote(id);
    setBusy(false);
    if (!r.ok) return setError(squadError(r));
    navigate(`/law/squad/notes/${r.data.note.id}`);
  }

  async function sendEdit() {
    setBusy(true);
    const r = await Law.hubPropose(id, { title: edit.title, content: edit.content });
    setBusy(false);
    if (r.ok) { setEdit(null); return navigate(`/law/community/hub/requests/${r.data.changeRequest.id}`); }
    const c = r.data?.error?.code;
    setError(c === "no_changes" ? tr("لم تغيّر شيئاً.") : c === "too_many_open" ? tr("لديك 5 طلبات مفتوحة على هذا الملخص.") : c === "media_not_allowed" ? tr("لا روابط وسائط في الملخصات العامة.") : tr("تعذر إرسال الاقتراح."));
    setEdit(null);
  }
  async function sendReport() {
    const r = await Law.hubReport(id, reason);
    setReportOpen(false);
    setFlash(r.ok ? tr("شكراً، وصل بلاغك.") : r.data?.error?.code === "already_reported" ? tr("سبق أن بلّغت عن هذا الملخص.") : tr("تعذر إرسال البلاغ."));
  }

  return (
    <>
      <PageTitle sub={note ? <><bdi>{note.moduleName}</bdi> · <bdi>{note.professorName}</bdi> · {tr("الحصة {0}", [note.sessionNumber])}</> : null}>
        {note ? <bdi>{note.title}</bdi> : tr("منصة الكلية")}
      </PageTitle>
      <Link to="/law/community/hub" className="mb-3 inline-block text-sm font-semibold" style={{ color: "var(--law-primary)" }}>
        <Back /> {tr("منصة الكلية")}
      </Link>
      {error && <Notice tone="warn">{error}</Notice>}
      {flash && <Notice tone="muted">{flash}</Notice>}
      {note?.moderationStatus && note.moderationStatus !== "ACTIVE" && (
        <Notice tone="warn">
          {tr("هذا الملخص مخفي بعد بلاغات: ")}<bdi dir="ltr">{note.hiddenReason}</bdi>{" "}
          {!note.appealed ? <button type="button" className="font-bold underline" onClick={async () => { await Law.hubAppeal(id); setNote({ ...note, appealed: true }); }}>{tr("استئناف القرار")}</button> : tr("(تم الاستئناف)")}
        </Notice>
      )}
      {note && (
        <>
          <p className="mb-3 text-sm">
            {tr("نشرها:")}{" "}
            {note.createdBy.publicProfile ? (
              <Link to={`/law/u/${note.createdBy.userId}`} className="font-bold" style={{ color: "var(--law-primary)" }}>
                <bdi>{note.createdBy.name}</bdi>
              </Link>
            ) : (
              <bdi className="font-bold">{note.createdBy.name}</bdi>
            )}
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {!note.mine && (
              <Button type="button" variant={note.endorsedByMe ? "primary" : "secondary"} disabled={busy} onClick={endorse} className="flex items-center gap-2">
                <HandsClapping size={18} weight={note.endorsedByMe ? "fill" : "regular"} />
                {note.endorsedByMe ? tr("وثّقتها") : tr("توثيق")} · <bdi dir="ltr">{note.endorsementCount}</bdi>
              </Button>
            )}
            {note.canFork && (
              <Button type="button" variant="secondary" disabled={busy} onClick={fork} className="flex items-center gap-2">
                <GitFork size={18} /> {tr("نسخ إلى فرقتي")}
              </Button>
            )}
            {note.inMySquad && (
              <Link to={`/law/squad/notes/${note.id}`} className="law-btn law-btn-secondary">
                {tr("فتحها في فرقتي")}
              </Link>
            )}
            {!note.mine && (
              <Button type="button" variant="secondary" onClick={() => setEdit({ title: "", content: note.content || "" })} className="flex items-center gap-2"><PencilSimpleLine size={18} /> {tr("اقترح تعديلاً")}</Button>
            )}
            {!note.mine && (
              <Button type="button" variant="secondary" onClick={() => setReportOpen(true)} className="flex items-center gap-2"><Flag size={18} /> {tr("إبلاغ")}</Button>
            )}
            {!note.canFork && !note.inMySquad && (
              <Link to="/law/community/squads" className="text-xs" style={{ color: "var(--law-muted)" }}>
                {tr("انضم إلى فرقة لتنسخ الملخصات وتطورها.")}
              </Link>
            )}
          </div>
          {note.coAuthors?.length > 0 && (
            <p className="mb-3 flex items-center gap-2 text-sm"><span>{tr("بمساهمة:")}</span>{note.coAuthors.map((c) => <Avatar key={c.userId} name={c.name} size={28} />)}</p>
          )}
          <Notice>{tr("ملخص طالب، وليس مصدراً رسمياً: تحقّق من النص الرسمي ومن محاضرة الأستاذ.")}</Notice>
          <MasterNoteView note={note} />
        </>
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={tr("اقترح تعديلاً")}>
        {edit && (
          <div className="grid gap-3">
            <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder={tr("عنوان الاقتراح")} aria-label={tr("عنوان الاقتراح")} maxLength={120} />
            <Textarea rows={12} dir="auto" value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} aria-label={tr("النص المقترح")} />
            <Button3D onClick={sendEdit} disabled={busy || !edit.title.trim() || edit.content === note?.content}>{tr("إرسال الاقتراح")}</Button3D>
          </div>
        )}
      </Sheet>
      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title={tr("إبلاغ عن هذا الملخص")}>
        <div className="grid gap-3">
          <Select value={reason} onChange={(e) => setReason(e.target.value)} aria-label={tr("السبب")} options={[["INAPPROPRIATE", tr("محتوى غير لائق")], ["VULGARITY", tr("ألفاظ بذيئة")], ["SPAM_ADS", tr("إعلانات / مزعج")], ["MISLEADING_LEGAL", tr("معلومة قانونية مضللة")], ["COPYRIGHT", tr("حقوق المؤلف")], ["OTHER", tr("آخر")]]} />
          <Button3D variant="danger" onClick={sendReport}>{tr("إرسال البلاغ")}</Button3D>
        </div>
      </Sheet>
    </>
  );
}
