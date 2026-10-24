import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Paperclip, PaperPlaneRight, Plus, Books, WarningCircle } from "@phosphor-icons/react";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Button3D from "@/components/LawOS/kit/Button3D";
import Chip from "@/components/LawOS/kit/Chip";
import Sheet from "@/components/LawOS/kit/Sheet";
import { Notice } from "@/components/LawOS/ui";
import { lang, tr } from "@/components/LawOS/lib/i18n";

const ID_RE = /\[([A-Za-z][A-Za-z0-9.-]*:[0-9A-Za-z؀-ۿ-]+)\]/g;

/** Renders the answer with [CODE:n] turned into links to the reader. Unverified ids were already removed server-side. */
function Answer({ text }) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(ID_RE)) {
    parts.push(text.slice(last, m.index));
    parts.push(<Link key={m.index} to={`/law/corpus/a/${encodeURIComponent(m[1])}`} className="law-chip" style={{ textDecoration: "none" }}><bdi dir="ltr">{m[1]}</bdi></Link>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <p className="whitespace-pre-wrap leading-7">{parts}</p>;
}

function QuotaChip({ q }) {
  if (!q) return null;
  if (q.unlimited) return <span className="law-chip">∞</span>;
  const low = q.remaining <= 3;
  return <span className="law-chip" style={low ? { color: "var(--law-warn)", borderColor: "var(--law-warn)" } : undefined} title={tr("استشارات قانونية متبقية اليوم")}>⚡ <bdi dir="ltr">{q.remaining}/{q.limit}</bdi> {tr("استشارة متبقية")}</span>;
}

function ScopeSheet({ open, onClose, codes, value, onSave }) {
  const [sel, setSel] = useState(value);
  useEffect(() => setSel(value), [value, open]);
  const toggle = (slug) => setSel(sel.includes(slug) ? sel.filter((s) => s !== slug) : [...sel, slug]);
  return (
    <Sheet open={open} onClose={onClose} title={tr("المراجع القانونية")}>
      <p className="mb-3 text-sm" style={{ color: "var(--law-muted)" }}>{tr("لن يستشهد المساعد إلا بنصوص من المراجع التي تختارها هنا.")}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {codes.map((c) => (
          <Chip key={c.slug} active={sel.includes(c.slug)} onClick={() => toggle(c.slug)}>{lang() === "fr" || lang() === "en" ? c.titleFr || c.titleAr : c.titleAr}</Chip>
        ))}
        {codes.length === 0 && <span className="text-sm">{tr("لا نصوص مستوردة بعد.")}</span>}
      </div>
      <Button3D block onClick={() => onSave(sel)} disabled={!sel.length}>{tr("حفظ")}</Button3D>
    </Sheet>
  );
}

/** "هذا غير صحيح": pick the wrong sentence, say what is right, cite at least one corpus article. */
function MistakeSheet({ message, onClose }) {
  const sentences = (message?.content || "").split(/(?<=[.!؟?])\s+/).map((x) => x.trim()).filter((x) => x.length > 8);
  const [claim, setClaim] = useState("");
  const [correction, setCorrection] = useState("");
  const [refs, setRefs] = useState("");
  const [done, setDone] = useState(null);
  async function send() {
    const citations = refs.split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [slug, number] = x.split(":"); return { slug, number }; });
    const r = await Law.reportAiMistake(message.id, { claim, correction, citations });
    const c = r.data?.error?.code;
    setDone(r.ok ? tr("شكرا. سيراجع مشرف بلاغك، وسيعيد المساعد التحقق من هذه النقطة معك في الأثناء.") : c === "unknown_article" ? tr("أحد المراجع غير موجود في النصوص المستوردة.") : c === "citation_required" ? tr("أضف مرجعا واحدا على الأقل من النصوص (مثل DOC:77).") : tr("تعذر الإرسال."));
  }
  return (
    <Sheet open={!!message} onClose={onClose} title={tr("هذا غير صحيح")}>
      {message && (done ? <p role="status">{done}</p> : (
        <div className="grid gap-3">
          <select className="law-input" value={claim} onChange={(e) => setClaim(e.target.value)} aria-label={tr("الجملة الخاطئة")}>
            <option value="">{tr("اختر الجملة الخاطئة")}</option>
            {sentences.map((x, i) => <option key={i} value={x}>{x.slice(0, 90)}</option>)}
          </select>
          <textarea className="law-input" rows={3} value={correction} onChange={(e) => setCorrection(e.target.value)} placeholder={tr("ما الصحيح برأيك؟")} aria-label={tr("ما الصحيح برأيك؟")} />
          <input className="law-input" dir="ltr" value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="DOC:77, CP:3" aria-label={tr("المراجع")} />
          <Button3D onClick={send} disabled={!claim || !correction.trim() || !refs.trim()}>{tr("إرسال")}</Button3D>
        </div>
      ))}
    </Sheet>
  );
}

export default function Chat() {
  const [params] = useSearchParams();
  const [threads, setThreads] = useState([]);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [codes, setCodes] = useState([]);
  const [quota, setQuota] = useState(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]); // uploaded attachments waiting for the next message
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [wrong, setWrong] = useState(null);
  const endRef = useRef(null);
  const fileRef = useRef(null);

  const refreshQuota = useCallback(() => Law.chatQuota().then((r) => r.ok && setQuota(r.data)), []);
  useEffect(() => {
    refreshQuota();
    Law.codes().then((r) => r.ok && setCodes(r.data.codes.filter((c) => c.articleCount > 0)));
    Law.chatThreads().then((r) => { if (!r.ok) return setOffline(true); setThreads(r.data.threads); });
  }, [refreshQuota]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  const open = async (id) => {
    const r = await Law.chatThread(id);
    if (r.ok) { setThread(r.data.thread); setMessages(r.data.messages); setErr(null); }
  };
  const newThread = async (slugs) => {
    const scope = { codeSlugs: slugs };
    const r = await Law.chatCreate(scope);
    if (!r.ok) return setErr(tr("تعذر إنشاء المحادثة."));
    setThreads([r.data.thread, ...threads]);
    setThread(r.data.thread);
    setMessages([]);
    return r.data.thread;
  };
  // ?code=DOC from "ask about this article": start a thread already scoped to that code
  useEffect(() => {
    const c = params.get("code");
    if (c && !thread && !offline) newThread([c]);
  }, [params, offline]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveScope(slugs) {
    setScopeOpen(false);
    if (!thread) return newThread(slugs);
    const r = await Law.chatScope(thread.id, { codeSlugs: slugs });
    if (r.ok) setThread(r.data.thread);
  }

  async function attach(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const r = await Law.uploadChatAttachment(f);
    if (!r.ok) return setErr(r.status === 413 ? tr("الملف أكبر من 10 ميغابايت.") : r.status === 415 ? tr("نوع الملف غير مدعوم.") : tr("تعذر رفع الملف."));
    setFiles([...files, r.data.attachment]);
  }

  async function send() {
    const q = text.trim();
    if (!q || busy) return;
    let t = thread;
    if (!t) {
      const sug = await Law.chatSuggested();
      t = await newThread(sug.ok ? sug.data.codeSlugs : []);
      if (!t) return;
      if (!(t.scope?.codeSlugs || []).length) return setScopeOpen(true);
    }
    setBusy(true);
    setErr(null);
    const r = await Law.chatSend(t.id, { text: q, attachmentIds: files.map((f) => f.id), locale: lang() });
    setBusy(false);
    if (r.ok) {
      setMessages((m) => [...m, ...r.data.messages]);
      setText("");
      setFiles([]);
      setQuota(r.data.quota);
      return;
    }
    const code = r.data?.error?.code;
    if (code === "AI_QUOTA_EXCEEDED") return refreshQuota();
    if (code === "scope_required") return setScopeOpen(true);
    setErr(code === "ai_unavailable" ? tr("المساعد غير متاح الآن. لم تُحتسب هذه الاستشارة.") : r.offline ? tr("لا يوجد اتصال.") : tr("تعذر الإرسال."));
  }

  const exhausted = quota && !quota.unlimited && quota.remaining === 0;
  return (
    <>
      <PageTitle sub={tr("إجابات تعليمية مبنية على نصوص مراجعك فقط")}>{tr("اسأل المكتبة")}</PageTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <QuotaChip q={quota} />
        <Chip onClick={() => setScopeOpen(true)}><Books size={14} /> {tr("المراجع القانونية")}{thread ? ` (${(thread.scope?.codeSlugs || []).length})` : ""}</Chip>
        <Chip onClick={() => { setThread(null); setMessages([]); setFiles([]); }}><Plus size={14} /> {tr("محادثة جديدة")}</Chip>
      </div>
      {threads.length > 0 && !thread && (
        <ul className="mb-4 grid gap-2">
          {threads.slice(0, 8).map((t) => <li key={t.id}><button type="button" className="law-card3d w-full text-start" onClick={() => open(t.id)}><bdi>{t.title || tr("محادثة")}</bdi></button></li>)}
        </ul>
      )}
      {offline && <Notice tone="warn">{tr("المحادثة تحتاج اتصالا بالخادم.")}</Notice>}
      <div className="mb-4 grid gap-3" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className="law-card3d" style={m.role === "user" ? { background: "var(--law-surface-2)" } : undefined}>
            {m.role === "assistant" ? <Answer text={m.content} /> : <p className="whitespace-pre-wrap leading-7"><bdi>{m.content}</bdi></p>}
            {m.attachments?.length > 0 && <p className="mt-1 text-xs" style={{ color: "var(--law-muted)" }}><Paperclip size={12} /> {m.attachments.length}</p>}
            {m.citations?.unverified?.length > 0 && (
              <p role="note" className="mt-2 flex items-start gap-1 text-xs" style={{ color: "var(--law-warn)" }}>
                <WarningCircle size={14} className="mt-0.5 shrink-0" />
                <span>{tr("لم يتم التحقق من هذا المرجع")}: <s><bdi dir="ltr">{m.citations.unverified.join(" · ")}</bdi></s></span>
              </p>
            )}
            {m.citations?.unreviewed?.length > 0 && (
              <p role="note" className="mt-2 text-xs" style={{ color: "var(--law-warn)" }}>{tr("بعض النصوص المستشهد بها قيد المراجعة ولم يتحقق منها بعد:")} <bdi dir="ltr">{m.citations.unreviewed.join(" · ")}</bdi></p>
            )}
            {m.role === "assistant" && !m.citations?.noContext && <button type="button" className="mt-2 text-xs underline" onClick={() => setWrong(m)}>{tr("هذا غير صحيح")}</button>}
            {m.role === "assistant" && <p className="mt-2 text-xs" style={{ color: "var(--law-muted)" }}>{tr("للدراسة فقط وليست استشارة قانونية. النص المرجعي هو المنشور في الجريدة الرسمية.")}</p>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {err && <p role="alert" className="mb-2 text-sm" style={{ color: "var(--law-danger)" }}>{err}</p>}
      {exhausted ? (
        <div className="law-card3d grid justify-items-start gap-3">
          <p className="font-bold">{tr("استنفدت استشاراتك لليوم — تتجدد عند منتصف الليل. ما رأيك في جلسة مراجعة الآن؟")}</p>
          <Button3D to="/law/exam/cards">{tr("ابدأ المراجعة")}</Button3D>
        </div>
      ) : (
        <div className="law-card3d grid gap-2">
          {files.length > 0 && <div className="flex flex-wrap gap-2">{files.map((f) => <span key={f.id} className="law-chip">{f.kind} · {f.status === "EXTRACTED" ? "✓" : tr("غير مدعوم")}</span>)}</div>}
          <textarea className="law-input" rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("اكتب سؤالك القانوني…")} aria-label={tr("سؤالك")} />
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} aria-label={tr("إرفاق ملف")} className="p-2" style={{ color: "var(--law-muted)" }}><Paperclip size={22} /></button>
            <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf,audio/*" onChange={attach} />
            <Button3D onClick={send} disabled={busy || !text.trim()}><PaperPlaneRight size={18} className="law-flip" /> {busy ? "…" : tr("إرسال")}</Button3D>
          </div>
        </div>
      )}
      <MistakeSheet key={wrong?.id || "none"} message={wrong} onClose={() => setWrong(null)} />
      <ScopeSheet open={scopeOpen} onClose={() => setScopeOpen(false)} codes={codes} value={thread?.scope?.codeSlugs || []} onSave={saveScope} />
    </>
  );
}
