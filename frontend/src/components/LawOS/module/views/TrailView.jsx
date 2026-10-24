import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Law from "@/models/law";
import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";
import Sheet from "@/components/LawOS/kit/Sheet";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice } from "@/components/LawOS/ui";
import PathNodes, { KIND_ICON, kindLabel, nodeTitle } from "@/components/LawOS/path/PathNodes";
import { completeNode } from "@/components/LawOS/lib/pathSync";
import { playSound, soundOn } from "@/components/LawOS/lib/prefs";
import { tr } from "@/components/LawOS/lib/i18n";


/** The stage-by-stage trail of a module (the offline-capable part of the workspace). The graph is loaded once by the page and handed in. */
export default function TrailView({ id, g, stale, load, onMethod }) {
  const navigate = useNavigate();
  const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState(null);
  const [notes, setNotes] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (sel && g) Law.hubNotes({ module: g.module.title }).then((r) => r.ok && setNotes((r.data.notes || []).slice(0, 5)));
  }, [sel, g?.module?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  const node = sel && g?.nodes.find((n) => n.id === sel.id);
  async function complete() {
    setBusy(true);
    const r = await completeNode(node.id);
    setBusy(false);
    if (!r.ok) return setMsg(r.error === "locked" ? tr("أكمل الخطوة السابقة أولاً.") : tr("تعذر الحفظ."));
    if (soundOn()) playSound("levelUp");
    setSel(null);
    setMsg(r.queued ? tr("حُفظ على جهازك وسيُرسل عند عودة الاتصال.") : r.data?.moduleDone ? tr("أتممت هذه المادة.") : tr("تم الإنجاز. +15 نقطة تحصيل"));
    load();
  }
  function practice() {
    try { localStorage.setItem("lawos_review_subject", node.practice.subjectId); } catch {}
    navigate("/law/exam/cards");
  }
  async function pin(noteId) { await Law.pathPin(node.id, noteId); load(); }
  async function unpin(noteId) { await Law.pathUnpin(node.id, noteId); load(); }
  async function downloadDocx() {
    const res = await fetch(`${API_BASE}/law/path/modules/${id}/export?format=docx`, { headers: baseHeaders() });
    if (!res.ok) return setMsg(tr("تعذر التصدير."));
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: `${g.module.title}.docx` });
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!g) return <Notice tone="warn">{stale ? tr("يحتاج اتصالا بالخادم.") : "…"}</Notice>;
  const Icon = node ? KIND_ICON[node.kind] : null;
  return (
    <>
      {stale && <Notice tone="warn">{tr("بدون اتصال: يظهر آخر مسار محفوظ.")}</Notice>}
      {msg && <Notice tone="muted">{msg}</Notice>}
      <PathNodes nodes={g.nodes} currentNodeId={g.currentNodeId} onSelect={setSel} />
      <div className="mt-6 flex flex-wrap gap-2">
        <Button3D variant="neutral" onClick={downloadDocx}>{tr("تصدير Word")}</Button3D>
        <Button3D variant="neutral" to={`/law/path/modules/${id}/print`}>{tr("طباعة / PDF")}</Button3D>
      </div>
      <Sheet open={!!node} onClose={() => setSel(null)} title={node ? nodeTitle(node.title) : ""}>
        {node && (
          <div className="grid gap-3">
            <p className="flex items-center gap-2 text-sm" style={{ color: "var(--law-muted)" }}>{Icon && <Icon size={18} />}{kindLabel()[node.kind]} · {tr(node.section)}</p>
            {node.weak && <Notice tone="muted">{tr("هذا الدرس يتناول مفهوما تخلط فيه أحيانا.")} <Link to="/law/exam/weak-spots" className="font-bold underline">{tr("تمارين نقاط ضعفي")}</Link></Notice>}
            {node.state === "LOCKED" && <Notice tone="warn">{tr("أكمل الخطوة السابقة لفتح هذه المحطة.")}</Notice>}
            {node.legalRefs.length > 0 && (
              <div><p className="mb-1 text-sm font-bold">{tr("نصوص قانونية مرتبطة")}</p>
                <div className="flex flex-wrap gap-2">{node.legalRefs.map((r) => r.exists ? <Link key={r.canonicalId} className="law-chip" to={`/law/corpus/a/${encodeURIComponent(r.canonicalId)}`}><bdi dir="ltr">{r.canonicalId}</bdi></Link> : <span key={r.canonicalId} className="law-chip" title={tr("غير موجود في النصوص المستوردة")}><s><bdi dir="ltr">{r.canonicalId}</bdi></s></span>)}</div></div>
            )}
            {node.kind === "PRACTICE" && (node.practice ? <Button3D onClick={practice} disabled={node.state === "LOCKED"}>{tr("ابدأ المراجعة")}</Button3D> : <Notice tone="muted">{tr("أنشئ مادة بنفس الاسم وأضف بطاقات لتفعيل المراجعة هنا.")}</Notice>)}
            {node.kind === "METHOD" && onMethod && <Button3D variant="neutral" onClick={() => { setSel(null); onMethod(); }}>{tr("افتح المنهجية")}</Button3D>}
            <div><p className="mb-1 text-sm font-bold">{tr("ملخصات المجتمع")}</p>
              {node.pins.map((p) => <p key={p.noteId} className="flex items-center justify-between text-sm"><Link to={`/law/hub/notes/${p.noteId}`}><bdi>{p.title}</bdi></Link><button type="button" className="p-1" onClick={() => unpin(p.noteId)} aria-label={tr("إزالة")}>×</button></p>)}
              {node.state !== "LOCKED" && notes.filter((n) => !node.pins.some((p) => p.noteId === n.id)).map((n) => <p key={n.id} className="flex items-center justify-between text-sm"><span><bdi>{n.title}</bdi></span><button type="button" className="font-bold" style={{ color: "var(--law-primary)" }} onClick={() => pin(n.id)}>{tr("إضافة")}</button></p>)}
            </div>
            {node.state !== "LOCKED" && node.state !== "COMPLETED" && <Button3D onClick={complete} disabled={busy}>{tr("أنهيت هذه الخطوة")}</Button3D>}
            {node.state === "COMPLETED" && <p className="font-bold" style={{ color: "var(--law-ok)" }}>{tr("منجز")}</p>}
          </div>
        )}
      </Sheet>
    </>
  );
}
