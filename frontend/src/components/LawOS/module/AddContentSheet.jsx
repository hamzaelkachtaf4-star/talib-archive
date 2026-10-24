import { useCallback, useEffect, useState } from "react";
import Law from "@/models/law";
import Sheet from "@/components/LawOS/kit/Sheet";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice } from "@/components/LawOS/ui";
import { lang, tr } from "@/components/LawOS/lib/i18n";
import LectureIngest from "./LectureIngest";
import { Proposal } from "./ModuleMentorChat";

/**
 * «+ إضافة محتوى أو حصة»: photos of the course or notebook, a pasted session text (e.g. session 4) or a recording, then
 * the assistant structures it into sessions and headings. Nothing joins the notes until the student accepts it.
 */
export default function AddContentSheet({ open, onClose, moduleId, tree, onChanged }) {
  const [proposals, setProposals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const loadProposals = useCallback(async () => { const r = await Law.moduleProposals(moduleId, "pending"); if (r.ok) setProposals(r.data.proposals); }, [moduleId]);
  useEffect(() => { if (open) loadProposals(); }, [open, loadProposals]);

  async function structure() {
    setBusy(true);
    setMsg(null);
    const r = await Law.moduleMentor(moduleId, { mode: "build", question: tr("نظّم المصادر المضافة حديثاً في حصص وعناوين مرتبة، بحسب تصميم المادة."), locale: lang() });
    setBusy(false);
    if (!r.ok) {
      const code = r.data?.error?.code;
      return setMsg(code === "AI_QUOTA_EXCEEDED" ? tr("استنفدت حصتك اليومية من الأسئلة. تتجدد غداً.") : code === "too_many_pending" ? tr("لديك اقتراحات كثيرة غير محسومة. اقبل بعضها أو ارفضه أولاً.") : r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("المرشد غير متاح الآن. أعد المحاولة لاحقاً."));
    }
    if (!r.data.proposals.length) setMsg(r.data.answer || tr("لم يجد المرشد في مصادرك ما يكفي لاقتراح تعديلات."));
    await loadProposals();
  }
  async function decide(p, verb) {
    const r = verb === "accept" ? await Law.moduleProposalAccept(moduleId, p.id) : await Law.moduleProposalReject(moduleId, p.id);
    if (!r.ok) setMsg(r.data?.error?.code === "stale" ? tr("تغيّرت هذه العقدة بعد الاقتراح. رُفض الاقتراح حتى لا يُلغي تعديلك.") : tr("تعذر تنفيذ العملية."));
    else if (verb === "accept") { await tree.reload(); onChanged?.(); }
    await loadProposals();
  }

  return (
    <Sheet open={open} onClose={onClose} variant="drawer" label={tr("إضافة محتوى أو حصة")}>
      <div className="grid gap-4" aria-label={tr("إضافة محتوى أو حصة")}>
        <header>
          <h2 className="text-lg font-bold">{tr("إضافة محتوى أو حصة")}</h2>
          <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("صوّر الدرس أو الدفتر، ألصق نص الحصة، أو أضف تسجيلاً. ثم يرتّبه المساعد في حصص وعناوين وتقرّر أنت ما يدخل.")}</p>
        </header>
        <LectureIngest moduleId={moduleId} tree={tree} onChanged={onChanged} />
        <div className="grid gap-2 rounded-2xl border-2 p-4" style={{ borderColor: "var(--law-accent)" }}>
          <h3 className="font-bold">{tr("رتّب لي ما أضفته")}</h3>
          <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("يقترح المساعد حصصاً وعناوين من مصادرك الجاهزة، دون أن يغيّر شيئاً قبل موافقتك.")}</p>
          <div><Button3D onClick={structure} disabled={busy}>{busy ? tr("جارٍ التفكير…") : tr("نظّم تلقائياً")}</Button3D></div>
          {msg && <Notice tone="warn">{msg}</Notice>}
          {proposals.length > 0 && <ul className="grid gap-3">{proposals.map((p) => <Proposal key={p.id} p={p} onDecide={decide} />)}</ul>}
        </div>
        <div><Button3D variant="neutral" onClick={onClose}>{tr("إغلاق")}</Button3D></div>
      </div>
    </Sheet>
  );
}
