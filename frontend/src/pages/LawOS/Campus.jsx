import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Flag, Megaphone, ChatsCircle, Trash, ShieldCheck } from "@phosphor-icons/react";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Avatar from "@/components/LawOS/kit/Avatar";
import AvatarArt from "@/components/LawOS/avatar/AvatarArt";
import CommunityTabs from "@/components/LawOS/kit/CommunityTabs";
import Button3D from "@/components/LawOS/kit/Button3D";
import Chip from "@/components/LawOS/kit/Chip";
import EmptyState from "@/components/LawOS/kit/EmptyState";
import { Back } from "@/components/LawOS/kit/DirArrow";
import { Field, Input, Notice, Select, Textarea } from "@/components/LawOS/ui";
import { useIsAdmin } from "@/components/LawOS/lib/useLawUser";
import { tr } from "@/components/LawOS/lib/i18n";

const ERRORS = () => ({
  no_faculty: tr("حدّد كليتك في ملفك الدراسي لترى جدار الكلية."),
  forbidden: tr("الإعلانات لإدارة التطبيق فقط."),
  invalid_title: tr("العنوان مطلوب (120 حرفاً كحد أقصى)."),
  invalid_body: tr("النص مطلوب (2000 حرف كحد أقصى)."),
  too_many_links: tr("روابط كثيرة. ضع رابطين كحد أقصى."),
  rate_limited: tr("أنت تنشر بسرعة. انتظر قليلاً."),
  thread_full: tr("اكتمل عدد الردود في هذا الموضوع."),
  consent_required: tr("وافق على الإشعار القانوني أولاً (أعد تحميل الصفحة)."),
});
const fail = (r) => (r.offline ? tr("لا يوجد اتصال بالخادم.") : ERRORS()[r.data?.error] || tr("حدث خطأ. أعد المحاولة."));
const REASONS = () => [["INAPPROPRIATE", tr("غير لائق")], ["VULGARITY", tr("ألفاظ نابية")], ["SPAM_ADS", tr("إعلان أو إزعاج")], ["MISLEADING_LEGAL", tr("معلومة قانونية مضلّلة")], ["OTHER", tr("آخر")]];
const when = (iso) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(new Date(iso));

function ReportButton({ id }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <span className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("شكراً، وصل بلاغك.")}</span>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="law-chip" aria-label={tr("إبلاغ")}><Flag size={14} /> {tr("إبلاغ")}</button>;
  return (
    <Select aria-label={tr("سبب البلاغ")} value="" onChange={async (e) => { if (!e.target.value) return; const r = await Law.reportCampusPost(id, e.target.value); if (r.ok) setDone(true); setOpen(false); }}
      options={[["", tr("اختر السبب")], ...REASONS()]} />
  );
}

const POST_TYPES = () => [["announcement", tr("إعلان")], ["td_thread", tr("تبادل أفواج TD")], ["legal_discussion", tr("اجتهاد ونقاش قانوني")], ["inquiry", tr("استفسار")]];

function Compose({ onPosted }) {
  const [kind, setKind] = useState("legal_discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const r = await Law.createCampusPost({ kind, title, body });
    setBusy(false);
    if (!r.ok) return setMsg(fail(r));
    setTitle(""); setBody(""); setMsg(null);
    onPosted();
  }
  return (
    <form onSubmit={submit} className="law-card3d mb-4 grid gap-3">
      <Select aria-label={tr("نوع المنشور")} value={kind} onChange={(e) => setKind(e.target.value)} options={POST_TYPES()} />
      <Field label={tr("العنوان")}><Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label={tr("النص")} hint={tr("للنقاش الدراسي فقط: لا صور ولا ملصقات.")}><Textarea rows={3} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} dir="auto" /></Field>
      {msg && <Notice tone="warn">{msg}</Notice>}
      <Button3D type="submit" disabled={busy || !title.trim() || !body.trim()}>{tr("نشر")}</Button3D>
    </form>
  );
}

function WallAvatar({ author }) {
  return author?.avatarConfig ? <AvatarArt config={author.avatarConfig} size={36} title={author.name} /> : <Avatar name={author?.name || ""} size={36} />;
}

function Wall() {
  const admin = useIsAdmin();
  const [posts, setPosts] = useState(null);
  const [next, setNext] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("all");
  const load = useCallback(async (more) => {
    const r = await Law.campusPosts({ kind: tab === "all" ? undefined : tab, before: more ? next : undefined });
    if (!r.ok) return setErr(fail(r));
    setErr(null);
    setPosts((cur) => (more && cur ? [...cur, ...r.data.posts] : r.data.posts));
    setNext(r.data.next);
  }, [tab, next]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(false); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <CommunityTabs />
      <PageTitle sub={tr("إعلانات وأسئلة طلبة كليتك")}>{tr("مجتمع الكلية")}</PageTitle>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {[["all", tr("الكل")], ...POST_TYPES().map(([k, l]) => [k, k === "announcement" ? tr("إعلانات") : l])].map(([k, label]) => (
          <Chip key={k} role="tab" aria-selected={tab === k} active={tab === k} onClick={() => setTab(k)}>{label}</Chip>
        ))}
        {admin && <Link to="/law/community/campus/moderation" className="law-chip"><ShieldCheck size={14} /> {tr("المراقبة")}</Link>}
      </div>
      {err && <Notice tone="warn">{err}</Notice>}
      {!err && <Compose onPosted={() => load(false)} />}
      {posts && !posts.length && !err && <EmptyState title={tr("لا منشورات بعد")} hint={tr("افتح أول موضوع لزملائك.")} />}
      <ul className="grid gap-2">
        {(posts || []).map((p) => (
          <li key={p.id} className="law-card3d">
            <Link to={`/law/community/campus/${p.id}`} className="flex items-start gap-3 text-start">
              <WallAvatar author={p.author} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold"><bdi>{p.title}</bdi></span>
                <span className="block text-xs" style={{ color: "var(--law-muted)" }}><bdi>{p.author.name}</bdi> · {when(p.createdAt)} · <span className="law-chip">{POST_TYPES().find(([k]) => k === p.kind)?.[1]}</span> · {tr("{0} ردود", [p.replyCount || 0])}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {next && <div className="mt-4"><Button3D variant="neutral" onClick={() => load(true)}>{tr("المزيد")}</Button3D></div>}
    </>
  );
}

function Thread({ id }) {
  const navigate = useNavigate();
  const admin = useIsAdmin();
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  const [text, setText] = useState("");
  const load = useCallback(() => Law.campusPost(id).then((r) => (r.ok ? (setV(r.data), setErr(null)) : setErr(tr("الموضوع غير موجود.")))), [id]);
  useEffect(() => { load(); }, [load]);
  async function reply(e) {
    e.preventDefault();
    const r = await Law.createCampusPost({ kind: "reply", parentId: id, body: text });
    if (!r.ok) return setErr(fail(r));
    setText(""); setErr(null); load();
  }
  async function remove(pid, isThread) {
    if (!window.confirm(tr("حذف هذا المنشور؟"))) return;
    const r = await Law.deleteCampusPost(pid);
    if (!r.ok) return setErr(fail(r));
    if (isThread) navigate("/law/community/campus"); else load();
  }
  if (!v) return err ? <Notice tone="warn">{err}</Notice> : null;
  const { post, replies } = v;
  return (
    <>
      <PageTitle sub={<><bdi>{post.author.name}</bdi> · {when(post.createdAt)}</>}><bdi>{post.title}</bdi></PageTitle>
      <Link to="/law/community/campus" className="mb-3 inline-block text-sm font-semibold" style={{ color: "var(--law-primary)" }}><Back /> {tr("جدار الكلية")}</Link>
      {err && <Notice tone="warn">{err}</Notice>}
      <article className="law-card3d mb-4"><p style={{ whiteSpace: "pre-wrap", unicodeBidi: "plaintext" }}>{post.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!post.mine && <ReportButton id={post.id} />}
          {(post.mine || admin) && <button type="button" onClick={() => remove(post.id, true)} className="law-chip"><Trash size={14} /> {tr("حذف")}</button>}
        </div>
      </article>
      <h2 className="mb-2 font-bold">{tr("الردود")}</h2>
      <ul className="mb-4 grid gap-2">
        {replies.map((r) => (
          <li key={r.id} className="law-card3d">
            <p className="text-xs" style={{ color: "var(--law-muted)" }}><bdi>{r.author.name}</bdi> · {when(r.createdAt)}</p>
            <p style={{ whiteSpace: "pre-wrap", unicodeBidi: "plaintext" }}>{r.body}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!r.mine && <ReportButton id={r.id} />}
              {(r.mine || admin) && <button type="button" onClick={() => remove(r.id, false)} className="law-chip"><Trash size={14} /> {tr("حذف")}</button>}
            </div>
          </li>
        ))}
        {!replies.length && <li className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا ردود بعد.")}</li>}
      </ul>
      {post.kind === "td_thread" && (
        <form onSubmit={reply} className="grid gap-2">
          <Textarea rows={3} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} dir="auto" aria-label={tr("ردّك")} />
          <Button3D type="submit" disabled={!text.trim()}>{tr("إرسال الرد")}</Button3D>
        </form>
      )}
    </>
  );
}

function Moderation() {
  const admin = useIsAdmin();
  const [queue, setQueue] = useState(null);
  const load = useCallback(() => Law.campusQueue().then((r) => r.ok && setQueue(r.data.queue)), []);
  useEffect(() => { if (admin) load(); }, [admin, load]);
  if (!admin) return <Notice tone="warn">{tr("هذه الصفحة للإدارة فقط.")}</Notice>;
  return (
    <>
      <PageTitle>{tr("مراقبة جدار الكلية")}</PageTitle>
      <Link to="/law/community/campus" className="mb-3 inline-block text-sm font-semibold" style={{ color: "var(--law-primary)" }}><Back /> {tr("جدار الكلية")}</Link>
      {queue && !queue.length && <EmptyState title={tr("لا بلاغات مفتوحة")} />}
      <ul className="grid gap-2">
        {(queue || []).map((q) => (
          <li key={q.id} className="law-card3d grid gap-2">
            <p className="font-semibold"><bdi>{q.title || q.body.slice(0, 60)}</bdi> {q.status === "HIDDEN" && <span className="law-chip">{tr("مخفي")}</span>}</p>
            <p className="text-sm" style={{ whiteSpace: "pre-wrap", unicodeBidi: "plaintext" }}>{q.body}</p>
            <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("{0} مبلّغين", [q.reporters])}</p>
            <div className="flex gap-2">
              <Button3D variant="danger" onClick={async () => { await Law.campusDecide(q.id, "uphold"); load(); }}>{tr("إخفاء")}</Button3D>
              <Button3D variant="neutral" onClick={async () => { await Law.campusDecide(q.id, "dismiss"); load(); }}>{tr("رفض البلاغ")}</Button3D>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Campus() {
  const { id } = useParams();
  if (id === "moderation") return <Moderation />;
  return id ? <Thread id={id} /> : <Wall />;
}
