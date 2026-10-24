import { useCallback, useEffect, useState } from "react";
import { Trash } from "@phosphor-icons/react";
import Law from "@/models/law";
import Chip from "@/components/LawOS/kit/Chip";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Field, Input, Notice, Textarea } from "@/components/LawOS/ui";
import { resizeImage } from "@/components/LawOS/lib/media";
import { tr } from "@/components/LawOS/lib/i18n";

const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
const MAX_FILE = 8 * 1024 * 1024; // the server refuses more; fail on the phone before reading the file

/** A pending (imported) row: the student corrects it and confirms; until then it is on nobody's calendar. */
function PendingRow({ p, onDone }) {
  const [title, setTitle] = useState(p.title);
  const [date, setDate] = useState(p.date);
  const [time, setTime] = useState(p.time || ""); // empty when the document gave no time: nothing is guessed
  const [err, setErr] = useState(null);
  async function confirm() {
    const r = await Law.examDateConfirm(p.id, { title, date, ...(time ? { time } : {}) });
    if (!r.ok) return setErr(tr("تحقق من العنوان والتاريخ والساعة."));
    onDone();
  }
  async function drop() { await Law.examDateDelete(p.id); onDone(); }
  return (
    <li className="law-card grid gap-2 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} aria-label={`${tr("المادة")}: ${p.title}`} dir="auto" />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={`${tr("التاريخ")}: ${p.title}`} dir="ltr" />
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={`${tr("الساعة")}: ${p.title}`} dir="ltr" />
      </div>
      {p.room && <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("القاعة:")} <bdi>{p.room}</bdi></p>}
      {err && <Notice tone="warn">{err}</Notice>}
      <div className="flex gap-2">
        <Button3D onClick={confirm}>{tr("تأكيد")}</Button3D>
        <Button3D variant="danger" onClick={drop}>{tr("حذف")}</Button3D>
      </div>
    </li>
  );
}

/** Exam dates: add by hand, import from a photo / PDF / pasted text (review and confirm each row), delete. */
export default function ExamScheduleImport({ onChanged }) {
  const [data, setData] = useState(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => { const r = await Law.examDates(); if (r.ok) setData(r.data); }, []);
  useEffect(() => { load(); }, [load]);
  const changed = () => { load(); onChanged?.(); };

  async function add(e) {
    e.preventDefault();
    const r = await Law.examDateAdd({ title, date, ...(time ? { time } : {}) });
    if (!r.ok) return setMsg(tr("تحقق من العنوان والتاريخ."));
    setTitle(""); setDate(""); setTime(""); setMsg(null);
    changed();
  }

  async function runImport(body) {
    setBusy(true);
    setMsg(null);
    const r = await Law.examDatesImport(body);
    setBusy(false);
    if (!r.ok) {
      const code = r.data?.error?.code;
      return setMsg(code === "AI_QUOTA_EXCEEDED" ? tr("استنفدت حصتك اليومية. تتجدد غداً.") : code === "too_many_pending" ? tr("لديك صفوف كثيرة بانتظار التأكيد. أكّدها أو احذفها أولاً.") : code === "unsupported_file" ? tr("الملف غير مدعوم: صورة أو PDF فقط.") : code === "file_too_large" ? tr("الملف كبير جداً (الحد 8 ميغابايت).") : r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذرت القراءة. جرّب صورة أوضح أو أضف التواريخ يدوياً."));
    }
    const over = r.data.skipped?.overCap || 0;
    if (!r.data.pending.length) setMsg(over ? tr("لديك صفوف كثيرة بانتظار التأكيد. أكّدها أو احذفها أولاً.") : tr("لم نجد تواريخ واضحة في هذه الوثيقة."));
    else setMsg(`${tr("راجع التواريخ المقروءة وأكّد كل صف قبل أن يُحتسب.")}${over ? ` ${tr("لم تُضف {0} صفوف لبلوغ الحد.", [over])}` : ""}`);
    changed();
  }

  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_FILE) return setMsg(tr("الملف كبير جداً (الحد 8 ميغابايت)."));
    if (f.type === "application/pdf") return runImport({ file: await toDataUrl(f), mimeType: f.type });
    if (!f.type.startsWith("image/")) return setMsg(tr("الملف غير مدعوم: صورة أو PDF فقط."));
    const { blob } = await resizeImage(f); // shrunk on the phone before it is sent
    runImport({ file: await toDataUrl(blob), mimeType: blob.type });
  }

  async function drop(id) { await Law.examDateDelete(id); changed(); }

  return (
    <section className="grid gap-4" aria-label={tr("تواريخ الامتحانات")}>
      {msg && <Notice tone="muted">{msg}</Notice>}
      {data?.pending?.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-bold">{tr("بانتظار تأكيدك")}</h3>
          <Notice tone="warn">{tr("قُرئت هذه التواريخ من وثيقة. لا تُحتسب حتى تؤكدها.")}</Notice>
          <ul className="grid gap-2">{data.pending.map((p) => <PendingRow key={p.id} p={p} onDone={changed} />)}</ul>
        </div>
      )}
      <form onSubmit={add} className="law-card grid gap-2 p-4">
        <h3 className="font-bold">{tr("إضافة امتحان")}</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder={tr("المادة")} aria-label={tr("المادة")} dir="auto" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={tr("التاريخ")} dir="ltr" />
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={tr("الساعة")} dir="ltr" />
        </div>
        <div><Button3D type="submit" disabled={!title.trim() || !date}>{tr("إضافة")}</Button3D></div>
      </form>
      <div className="law-card grid gap-2 p-4">
        <h3 className="font-bold">{tr("استيراد جدول الامتحانات")}</h3>
        <label className="law-btn law-btn-primary law-file cursor-pointer" style={{ minHeight: 48 }}>
          {busy ? tr("جارٍ القراءة…") : tr("صورة أو PDF")}
          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={pick} disabled={busy} />
        </label>
        <Field label={tr("أو الصق النص")}><Textarea rows={3} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} dir="auto" /></Field>
        <div><Button3D variant="neutral" disabled={busy || !text.trim()} onClick={() => runImport({ text }).then(() => setText(""))}>{tr("قراءة النص")}</Button3D></div>
      </div>
      {data?.upcoming?.length > 0 && (
        <ul className="grid gap-2" aria-label={tr("الامتحانات القادمة")}>
          {data.upcoming.map((e) => (
            <li key={e.id} className="law-card flex items-center justify-between gap-3 p-3">
              <span className="min-w-0"><span className="block truncate font-semibold"><bdi>{e.title}</bdi></span><span className="text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{e.date}{e.time ? ` ${e.time}` : ""}</bdi>{e.room ? <> · <bdi>{e.room}</bdi></> : null} · <Chip>{e.source === "manual" ? tr("يدوي") : tr("مستورد")}</Chip></span></span>
              <button type="button" onClick={() => drop(e.id)} aria-label={tr("حذف الامتحان")} className="p-1" style={{ color: "var(--law-danger)" }}><Trash size={18} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
