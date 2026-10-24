import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Scales, Exam, Question, LinkSimple, GitPullRequest, Notebook, UploadSimple } from "@phosphor-icons/react";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import CommunityTabs from "@/components/LawOS/kit/CommunityTabs";
import Button3D from "@/components/LawOS/kit/Button3D";
import Chip from "@/components/LawOS/kit/Chip";
import EmptyState from "@/components/LawOS/kit/EmptyState";
import { Back } from "@/components/LawOS/kit/DirArrow";
import { Field, Input, Notice, Select, Textarea } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

// Squad posts are work artifacts only: no free chat, no stickers.
export const DOC_TYPES = () => ({
  summary: { label: tr("ملخص"), Icon: FileText },
  memo: { label: tr("مذكرة"), Icon: Notebook },
  case_brief: { label: tr("نازلة محلولة"), Icon: Scales },
  mock_exam: { label: tr("امتحان تجريبي"), Icon: Exam },
  question: { label: tr("سؤال"), Icon: Question },
  resource_link: { label: tr("رابط مرجع"), Icon: LinkSimple },
});
export const DOC_ERRORS = () => ({
  invalid_type: tr("نوع غير مسموح."),
  invalid_title: tr("العنوان مطلوب (120 حرفاً كحد أقصى)."),
  invalid_content: tr("المحتوى مطلوب (20000 حرف كحد أقصى)."),
  invalid_url: tr("الرابط يجب أن يبدأ بـ https://"),
  forbidden: tr("دورك في الفرقة لا يسمح بهذا الإجراء."),
  rate_limited: tr("أنت تنشر بسرعة. انتظر قليلاً."),
  too_many_docs: tr("بلغت الفرقة الحد الأقصى من الوثائق."),
  stale_base: tr("تغيّرت الوثيقة منذ فتحتها. أعد تحميلها ثم عدّل من جديد."),
  not_in_squad: tr("انضم إلى فرقة أولاً."),
  consent_required: tr("وافق على الإشعار القانوني أولاً (أعد تحميل الصفحة)."),
  no_changes: tr("لا تغيير في النص."),
  too_many_open: tr("لديك طلبات تعديل مفتوحة كثيرة."),
  conflict: tr("تعارض مع تعديلات أحدث: يجب على صاحب الاقتراح مراجعته أولاً."),
  cannot_review_own: tr("لا يمكنك الموافقة على طلبك أنت."),
  not_open: tr("لم يعد هذا الطلب مفتوحاً."),
  incorporate_head: tr("تغيّرت الوثيقة منذ اقتراحك: ابدأ من آخر نسخة حتى لا تُلغى تعديلات زملائك."),
  too_many_revisions: tr("بلغت هذه الوثيقة الحد الأقصى من النسخ."),
  too_many_rebases: tr("حاولت إعادة التأسيس مرات كثيرة."),
});
export const docError = (r) => (r.offline ? tr("لا يوجد اتصال بالخادم.") : DOC_ERRORS()[r.data?.error] || tr("حدث خطأ. أعد المحاولة."));

function NewDoc({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ type: "summary", title: "", content: "", url: "" });
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // A text or PDF file fills the editor: the student reads and corrects it before publishing. Scans have no text layer and are refused.
  async function attach(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(null);
    if (/\.(txt|md)$/i.test(file.name) || file.type === "text/plain" || file.type === "text/markdown") {
      const text = (await file.text()).slice(0, 20000);
      return setF((x) => ({ ...x, content: text, title: x.title || file.name.replace(/\.[^.]+$/, "") }));
    }
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return setMsg(tr("اختر ملف PDF أو نص (.txt, .md)."));
    if (file.size > 4 * 1024 * 1024) return setMsg(tr("الملف كبير جداً (4 ميغابايت كحد أقصى)."));
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    const r = await Law.extractSquadDocFile(url);
    if (!r.ok) return setMsg(r.data?.error === "no_text_layer" ? tr("هذا PDF صورة بلا نص. أضفه إلى مادة في «المسار الدراسي» ليُقرأ بالتعرف الضوئي، ثم انسخ النص هنا.") : tr("تعذر قراءة الملف."));
    setF((x) => ({ ...x, content: r.data.text, title: x.title || file.name.replace(/\.[^.]+$/, "") }));
  }
  if (!open) return <Button3D onClick={() => setOpen(true)}>{tr("وثيقة جديدة")}</Button3D>;
  async function submit(e) {
    e.preventDefault();
    const r = await Law.createSquadDoc({ ...f, url: f.type === "resource_link" ? f.url : undefined });
    if (!r.ok) return setMsg(docError(r));
    setOpen(false); setF({ type: "summary", title: "", content: "", url: "" }); setMsg(null);
    onCreated();
  }
  return (
    <form onSubmit={submit} className="law-card3d grid gap-3">
      <Select aria-label={tr("النوع")} value={f.type} onChange={set("type")} options={Object.entries(DOC_TYPES()).map(([k, v]) => [k, v.label])} />
      <Field label={tr("العنوان")}><Input value={f.title} maxLength={120} onChange={set("title")} /></Field>
      {f.type === "resource_link" && <Field label={tr("الرابط")}><Input dir="ltr" value={f.url} onChange={set("url")} placeholder="https://" /></Field>}
      {f.type !== "resource_link" && (
        <label className="law-btn law-btn-secondary flex cursor-pointer items-center gap-2 justify-self-start"><UploadSimple size={18} aria-hidden="true" />{tr("رفع ملف PDF أو نص")}<input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="sr-only" onChange={attach} /></label>
      )}
      <Field label={f.type === "resource_link" ? tr("وصف قصير") : tr("المحتوى")}><Textarea rows={f.type === "resource_link" ? 2 : 8} value={f.content} maxLength={20000} onChange={set("content")} dir="auto" /></Field>
      {msg && <Notice tone="warn">{msg}</Notice>}
      <div className="flex gap-2">
        <Button3D type="submit" disabled={!f.title.trim() || (f.type !== "resource_link" && !f.content.trim())}>{tr("نشر في الفرقة")}</Button3D>
        <Button3D type="button" variant="neutral" onClick={() => setOpen(false)}>{tr("إلغاء")}</Button3D>
      </div>
    </form>
  );
}

/** Work documents of the student's squad, and the change requests waiting for review. */
export default function SquadDocs() {
  const [data, setData] = useState(null);
  const [crs, setCrs] = useState([]);
  const [type, setType] = useState("");
  const [err, setErr] = useState(null);
  const load = () => {
    Law.squadDocs(type).then((r) => (r.ok ? (setData(r.data), setErr(null)) : setErr(docError(r))));
    Law.squadCRs().then((r) => r.ok && setCrs(r.data.changeRequests));
  };
  useEffect(load, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  const types = DOC_TYPES();
  const canCreate = data && data.myRole !== "viewer";
  return (
    <>
      <CommunityTabs />
      <PageTitle sub={tr("ملخصات وأسئلة وروابط عمل فرقتك")}>{tr("وثائق الفرقة")}</PageTitle>
      <Link to="/law/community/squads" className="mb-3 inline-block text-sm font-semibold" style={{ color: "var(--law-primary)" }}><Back /> {tr("فرقة الدراسة")}</Link>
      {err && <Notice tone="warn">{err}</Notice>}
      {data?.myRole === "viewer" && <Notice>{tr("أنت قارئ في هذه الفرقة: يمكنك الاطلاع فقط.")}</Notice>}
      {canCreate && <div className="mb-4"><NewDoc onCreated={load} /></div>}
      {crs.length > 0 && (
        <section className="mb-4" aria-label={tr("طلبات التعديل")}>
          <h2 className="mb-2 flex items-center gap-2 font-bold"><GitPullRequest size={18} aria-hidden="true" /> {tr("طلبات التعديل")} <bdi dir="ltr">({crs.length})</bdi></h2>
          <ul className="grid gap-2">{crs.map((c) => (
            <li key={c.id}><Link to={`/law/squad/change-requests/${c.id}`} className="law-card3d block text-start"><span className="font-semibold"><bdi>{c.title}</bdi></span> <span className="text-xs" style={{ color: "var(--law-muted)" }}>· <bdi>{c.docTitle}</bdi> · <bdi>{c.author.name}</bdi></span>{c.status === "CONFLICT" && <span className="law-chip ms-2">{tr("تعارض")}</span>}</Link></li>
          ))}</ul>
        </section>
      )}
      <div className="mb-3 flex flex-wrap gap-2" role="tablist">
        <Chip role="tab" aria-selected={type === ""} active={type === ""} onClick={() => setType("")}>{tr("الكل")}</Chip>
        {Object.entries(types).map(([k, v]) => <Chip key={k} role="tab" aria-selected={type === k} active={type === k} onClick={() => setType(k)}>{v.label}</Chip>)}
      </div>
      {data && !data.docs.length && !err && <EmptyState title={tr("لا وثائق بعد")} hint={tr("انشر أول ملخص لفرقتك.")} />}
      <ul className="grid gap-2">
        {(data?.docs || []).map((d) => {
          const T = types[d.type];
          return (
            <li key={d.id}>
              <Link to={`/law/squad/docs/${d.id}`} className="law-card3d flex items-start gap-3 text-start">
                {T && <T.Icon size={22} aria-hidden="true" style={{ color: "var(--law-primary)" }} />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold"><bdi>{d.title}</bdi></span>
                  <span className="block text-xs" style={{ color: "var(--law-muted)" }}>{T?.label} · <bdi>{d.author}</bdi>{d.openChangeRequests > 0 && <> · {tr("{0} طلب تعديل", [d.openChangeRequests])}</>}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
