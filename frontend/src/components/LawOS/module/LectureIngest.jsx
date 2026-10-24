import { useCallback, useEffect, useState } from "react";
import { Trash, PencilSimple } from "@phosphor-icons/react";
import Law from "@/models/law";
import Chip from "@/components/LawOS/kit/Chip";
import Button3D from "@/components/LawOS/kit/Button3D";
import Toggle from "@/components/LawOS/kit/Toggle";
import { Field, Input, Notice, Select, Textarea } from "@/components/LawOS/ui";
import { queueImport, queuePhotoBatch } from "@/components/LawOS/lib/captureQueue";
import { flushModuleLinks, queueModuleLink } from "@/components/LawOS/lib/moduleLinks";
import { resizeImage } from "@/components/LawOS/lib/media";
import { tr } from "@/components/LawOS/lib/i18n";

const NOTICE_KEY = "lawos_recording_notice_v1";
const readAck = () => { try { return localStorage.getItem(NOTICE_KEY) === "1"; } catch { return false; } };
const writeAck = () => { try { localStorage.setItem(NOTICE_KEY, "1"); } catch { /* private mode: asked again next time */ } };

const KIND = () => ({ text: tr("نص"), audio: tr("تسجيل صوتي"), image: tr("صور"), pdf: "PDF" });
const STATUS = () => ({ pending: tr("بانتظار الرفع من هاتفك"), processing: tr("قيد المعالجة"), ready: tr("جاهز"), failed: tr("فشلت المعالجة") });

/** Preview of what was extracted from a source (OCR, transcript, PDF text or pasted): the student reads it and fixes it before the mentor structures it. */
function SourceEditor({ moduleId, source, onSaved, onClose }) {
  const [text, setText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { Law.moduleSource(moduleId, source.id).then((r) => (r.ok ? setText(r.data.source.text) : setErr(tr("تعذر تحميل النص.")))); }, [moduleId, source.id]);
  async function save() {
    setBusy(true);
    const r = await Law.moduleSourceEdit(moduleId, source.id, text);
    setBusy(false);
    if (r.ok) onSaved(); else setErr(tr("تعذر حفظ النص."));
  }
  if (text === null) return <p className="p-2 text-sm" style={{ color: "var(--law-muted)" }}>{err || "…"}</p>;
  return (
    <div className="grid gap-2 p-2">
      <Textarea rows={8} maxLength={60000} value={text} onChange={(e) => setText(e.target.value)} dir="auto" aria-label={tr("النص المستخرج")} />
      {err && <Notice tone="warn">{err}</Notice>}
      <div className="flex gap-2">
        <Button3D onClick={save} disabled={busy || !text.trim()}>{tr("حفظ النص")}</Button3D>
        <Button3D variant="neutral" onClick={onClose}>{tr("إغلاق")}</Button3D>
      </div>
    </div>
  );
}

/** Adds material to a module: pasted text, a recording, photos or a PDF. Media is queued on the device first, like any capture. */
export default function LectureIngest({ moduleId, tree, onChanged }) {
  const [sources, setSources] = useState(null);
  const [lectureId, setLectureId] = useState("");
  const [newLecture, setNewLecture] = useState("");
  const [text, setText] = useState("");
  const [keepRaw, setKeepRaw] = useState(false);
  const [waiting, setWaiting] = useState(null); // files held back until the recording notice is acknowledged
  const [ack, setAck] = useState(false);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(null); // source id whose text is open for review

  const load = useCallback(async () => {
    const r = await Law.moduleSources(moduleId);
    if (r.ok) setSources(r.data.sources);
  }, [moduleId]);
  useEffect(() => {
    flushModuleLinks().then(() => load());
    const online = () => flushModuleLinks().then(() => load());
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [load]);
  const busy = sources?.some((s) => s.status === "pending" || s.status === "processing");
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [busy, load]);

  const lectures = (tree.nodes || []).filter((n) => n.kind === "lecture");

  async function target() {
    if (newLecture.trim()) {
      const r = await tree.add({ title: newLecture, kind: "lecture" });
      if (!r.ok) { setMsg(tr("تعذر إنشاء المحاضرة.")); return null; }
      setNewLecture("");
      setLectureId(r.data.node.id);
      return r.data.node.id;
    }
    return lectureId || null;
  }

  async function addText(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const lec = await target();
    if (lec === null && newLecture.trim()) return;
    const r = await Law.moduleSourceAdd(moduleId, { kind: "text", text, ...(lec ? { lectureId: lec } : {}) });
    if (!r.ok) return setMsg(r.data?.error?.code === "text_too_long" ? tr("النص طويل جداً (الحد 60 ألف حرف).") : tr("تعذرت الإضافة. يلزم الاتصال."));
    setText("");
    setMsg(null);
    await load();
    onChanged?.();
  }

  async function upload(files, permission) {
    const lec = await target();
    const common = lec ? { lectureId: lec } : {};
    const images = files.filter((f) => f.type.startsWith("image/"));
    const jobs = [];
    if (images.length) {
      const pages = [];
      for (const f of images) pages.push(await resizeImage(f)); // resized on the phone before upload, to spare the server
      jobs.push([queuePhotoBatch(pages), "image"]);
    }
    for (const f of files.filter((x) => x.type.startsWith("audio/"))) jobs.push([queueImport(f), "audio"]);
    for (const f of files.filter((x) => x.type === "application/pdf")) jobs.push([queueImport(f), "pdf"]);
    for (const [pending, kind] of jobs) {
      const batch = await pending;
      const body = { kind, clientBatchId: batch.clientBatchId, ...common, ...(kind === "audio" ? { keepRaw, recordingPermission: permission } : {}) };
      const r = await Law.moduleSourceAdd(moduleId, body);
      if (!r.ok && (r.offline || r.status >= 500)) {
        await queueModuleLink(moduleId, body); // linked automatically when the connection is back
        setMsg(tr("حُفظ الملف على هاتفك وسيُربط بالمادة عند عودة الاتصال."));
      } else if (!r.ok) setMsg(r.status === 429 ? tr("بلغت حد الإضافة اليومي.") : tr("تعذر ربط الملف بالمادة."));
    }
    await load();
    onChanged?.();
  }

  async function pick(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    if (files.some((f) => f.type.startsWith("audio/")) && !readAck()) { setAck(false); return setWaiting(files); }
    await upload(files, true);
  }

  async function confirmNotice() {
    writeAck();
    const files = waiting;
    setWaiting(null);
    await upload(files, true);
  }

  async function remove(s) {
    if (!window.confirm(tr("حذف هذا المصدر؟"))) return;
    const r = await Law.moduleSourceDelete(moduleId, s.id);
    if (r.ok) { await load(); onChanged?.(); }
  }

  const kinds = KIND();
  const states = STATUS();
  return (
    <section className="grid gap-4" aria-label={tr("محاضرات ومصادر")}>
      {msg && <Notice tone="warn">{msg}</Notice>}
      <div className="law-card grid gap-3 p-4">
        <h3 className="font-bold">{tr("المحاضرة")}</h3>
        <Field label={tr("أضف إلى")}>
          <Select value={lectureId} onChange={(e) => setLectureId(e.target.value)} options={[["", tr("بدون محاضرة محددة")], ...lectures.map((l) => [l.id, l.title])]} />
        </Field>
        <Field label={tr("أو محاضرة جديدة")}><Input value={newLecture} maxLength={200} onChange={(e) => setNewLecture(e.target.value)} dir="auto" /></Field>
      </div>

      <form onSubmit={addText} className="law-card grid gap-3 p-4">
        <h3 className="font-bold">{tr("لصق نص")}</h3>
        <Textarea rows={6} maxLength={60000} value={text} onChange={(e) => setText(e.target.value)} dir="auto" aria-label={tr("لصق نص")} />
        <div><Button3D type="submit" disabled={!text.trim()}>{tr("إضافة النص")}</Button3D></div>
      </form>

      <div className="law-card grid gap-3 p-4">
        <h3 className="font-bold">{tr("تسجيل أو صور أو PDF")}</h3>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">{tr("الاحتفاظ بالتسجيل الصوتي الأصلي")}</span>
          <Toggle label={tr("الاحتفاظ بالتسجيل الصوتي الأصلي")} checked={keepRaw} onChange={setKeepRaw} />
        </div>
        <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("يُحذف التسجيل الأصلي بعد التفريغ ما لم تختر الاحتفاظ به.")}</p>
        <label className="law-btn law-btn-primary cursor-pointer" style={{ minHeight: 48 }}>
          {tr("اختيار ملفات")}
          <input type="file" accept="audio/*,application/pdf,image/*" multiple className="hidden" onChange={pick} />
        </label>
        {waiting && (
          <div role="alertdialog" aria-label={tr("تنبيه التسجيل")} className="grid gap-2 rounded-xl p-3" style={{ border: "1px solid var(--law-border)", background: "var(--law-surface-2)" }}>
            <p className="text-sm font-semibold">{tr("أنت المسؤول عن الحصول على إذن بتسجيل المحاضرة قبل رفع تسجيل صوتي.")}</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />{tr("أؤكد أن لدي إذن بالتسجيل")}</label>
            <div className="flex gap-2">
              <Button3D onClick={confirmNotice} disabled={!ack}>{tr("متابعة")}</Button3D>
              <Button3D variant="neutral" onClick={() => setWaiting(null)}>{tr("إلغاء")}</Button3D>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <h3 className="font-bold">{tr("المصادر")}</h3>
        {sources && sources.length === 0 && <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا مصادر بعد.")}</p>}
        <ul className="grid gap-2">
          {(sources || []).map((s) => (
            <li key={s.id} className="law-card p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Chip>{kinds[s.kind]}</Chip>
                  <Chip active={s.status === "ready"}>{states[s.status]}</Chip>
                  {s.chars > 0 && <span className="text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{s.chars}</bdi> {tr("حرف")}</span>}
                </span>
                <span className="flex items-center gap-1">
                  {s.status === "ready" && <button type="button" onClick={() => setEditing(editing === s.id ? null : s.id)} aria-expanded={editing === s.id} aria-label={tr("مراجعة النص المستخرج")} className="p-1" style={{ color: "var(--law-primary)" }}><PencilSimple size={18} /></button>}
                  <button type="button" onClick={() => remove(s)} aria-label={tr("حذف المصدر")} className="p-1" style={{ color: "var(--law-danger)" }}><Trash size={18} /></button>
                </span>
              </div>
              {editing === s.id && <SourceEditor moduleId={moduleId} source={s} onSaved={() => { setEditing(null); load(); onChanged?.(); }} onClose={() => setEditing(null)} />}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
