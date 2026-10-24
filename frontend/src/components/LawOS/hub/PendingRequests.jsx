import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GitPullRequest } from "@phosphor-icons/react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice } from "@/components/LawOS/ui";
import DiffViewer from "./DiffViewer";
import { tr } from "@/components/LawOS/lib/i18n";

const errText = (r) => (r.offline ? tr("لا يوجد اتصال بالخادم.") : r.data?.error === "conflict" ? tr("تغيّرت الوثيقة في الفقرات نفسها: افتح الطلب لمراجعة التعارض.") : tr("تعذر تنفيذ الإجراء."));

/** Open change requests of one document, each with its word-level diff; reviewers accept ("قبول التعديل") or reject in place. */
export default function PendingRequests({ docId, canReview, onMerged }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    const list = await Law.squadCRs({ docId });
    if (!list.ok) return setItems([]);
    const open = list.data.changeRequests.filter((c) => c.status === "OPEN" || c.status === "CONFLICT");
    const full = await Promise.all(open.map((c) => Law.squadCR(c.id)));
    setItems(full.filter((r) => r.ok).map((r) => r.data));
  }, [docId]);
  useEffect(() => { load(); }, [load]);
  async function act(id, action, body) {
    setErr(null);
    const r = await Law.squadCRAction(id, action, body);
    if (!r.ok) return setErr(errText(r));
    await load();
    if (action === "merge") onMerged?.();
  }
  if (!items?.length) return null;
  return (
    <section className="mt-6 grid gap-3" aria-label={tr("طلبات التعديل المعلقة")}>
      <h2 className="flex items-center gap-2 font-bold"><GitPullRequest size={18} aria-hidden="true" /> {tr("طلبات التعديل المعلقة")} <bdi dir="ltr">({items.length})</bdi></h2>
      {err && <Notice tone="warn">{err}</Notice>}
      {items.map((v) => {
        const cr = v.changeRequest;
        return (
          <article key={cr.id} className="law-card3d grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold"><bdi>{cr.title}</bdi> <span className="text-xs font-normal" style={{ color: "var(--law-muted)" }}>· <bdi>{cr.author.name}</bdi></span></p>
              <Link to={`/law/squad/change-requests/${cr.id}`} className="text-sm font-bold" style={{ color: "var(--law-primary)" }}>{tr("فتح الطلب")}</Link>
            </div>
            {cr.description && <p className="text-sm"><bdi>{cr.description}</bdi></p>}
            <DiffViewer blocks={v.diff} />
            {v.canReview && canReview !== false && (
              <div className="flex flex-wrap gap-2">
                <Button3D onClick={() => act(cr.id, "merge")} disabled={cr.status === "CONFLICT" || !v.mergeable}>{tr("قبول التعديل")}</Button3D>
                <Button3D variant="neutral" onClick={() => { const note = window.prompt(tr("سبب الرفض (اختياري)")); if (note !== null) act(cr.id, "reject", { reviewNote: note || undefined }); }}>{tr("رفض")}</Button3D>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
