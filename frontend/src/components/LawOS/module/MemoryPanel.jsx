import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trash } from "@phosphor-icons/react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice, Select, Textarea } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

/** What the assistant remembers about how this student learns: short notes they write or accept, and can delete any time. */
export default function MemoryPanel({ moduleId }) {
  const [data, setData] = useState(null);
  const [text, setText] = useState("");
  const [scope, setScope] = useState("module");
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => Law.moduleMemory(moduleId).then((r) => r.ok && setData(r.data)), [moduleId]);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    const r = await Law.moduleMemoryAdd(moduleId, { content: text, scope });
    if (r.ok) { setText(""); setMsg(null); return load(); }
    const code = r.data?.error;
    setMsg(code === "too_many_notes" ? tr("وصلت إلى الحد الأقصى من الملاحظات. احذف بعضها أولاً.") : code === "duplicate_note" ? tr("هذه الملاحظة موجودة.") : r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذر الحفظ."));
  }
  async function del(id) { const r = await Law.moduleMemoryDelete(moduleId, id); if (r.ok) load(); }

  if (!data) return <p className="p-2 text-sm" style={{ color: "var(--law-muted)" }}>…</p>;
  return (
    <section className="grid gap-3" aria-label={tr("ذاكرة المساعد")}>
      <p className="text-sm leading-7" style={{ color: "var(--law-muted)" }}>{tr("ملاحظات قصيرة عن طريقتك في التعلم يقرؤها المساعد قبل كل جواب ليخاطبك بأسلوبك. أنت من يكتبها أو يقبلها، وتحذفها متى شئت.")}</p>
      {!data.enabled && <Notice tone="warn">{tr("ذاكرتك متوقفة: لا يقرأ المساعد هذه الملاحظات الآن.")} <Link to="/law/memory" className="font-bold underline">{tr("ذاكرتي")}</Link></Notice>}
      {data.notes.length === 0 && <p className="rounded-2xl border border-dashed p-4 text-center text-sm" style={{ borderColor: "var(--law-border)", color: "var(--law-muted)" }}>{tr("لا ملاحظات بعد. اكتب مثلاً: «أفضّل الأمثلة المغربية».")}</p>}
      <ul className="grid gap-2">
        {data.notes.map((n) => (
          <li key={n.id} className="flex items-start gap-2 rounded-xl border p-2.5 text-sm" style={{ borderColor: "var(--law-border)" }}>
            <span className="min-w-0 flex-1"><bdi>{n.content}</bdi><span className="mt-0.5 block text-[11px]" style={{ color: "var(--law-muted)" }}>{n.scope === "all" ? tr("لكل المواد") : tr("لهذه المادة")}{n.source === "mentor" && ` · ${tr("اقترحها المساعد")}`}</span></span>
            <button type="button" onClick={() => del(n.id)} aria-label={`${tr("حذف")}: ${n.content}`} className="p-1" style={{ color: "var(--law-danger)" }}><Trash size={16} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="grid gap-2">
        <Textarea rows={2} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} dir="auto" aria-label={tr("ملاحظة جديدة")} placeholder={tr("اكتب ملاحظة قصيرة عن طريقتك في التعلم")} />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={scope} onChange={(e) => setScope(e.target.value)} options={[["module", tr("لهذه المادة")], ["all", tr("لكل المواد")]]} aria-label={tr("نطاق الملاحظة")} />
          <Button3D type="submit" disabled={!text.trim()}>{tr("أضف")}</Button3D>
        </div>
        {msg && <Notice tone="warn">{msg}</Notice>}
      </form>
    </section>
  );
}
