import { useEffect, useState } from "react";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Button3D from "@/components/LawOS/kit/Button3D";
import EmptyState from "@/components/LawOS/kit/EmptyState";
import { useIsAdmin } from "@/components/LawOS/lib/useLawUser";
import { tr } from "@/components/LawOS/lib/i18n";

export default function ModerationQueue() {
  const isAdmin = useIsAdmin();
  const [q, setQ] = useState(null);
  const load = () => Law.modQueue().then((r) => setQ(r.ok ? r.data.queue : []));
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);
  if (!isAdmin) return null;
  const decide = async (id, d) => { await Law.modDecide(id, d); load(); };
  return (
    <>
      <PageTitle sub={tr("الملخصات المخفاة بعد بلاغات الطلبة")}>{tr("الإشراف")}</PageTitle>
      {q && !q.length && <EmptyState title={tr("لا شيء بانتظار القرار")} />}
      <ul className="grid gap-3">
        {(q || []).map((n) => (
          <li key={n.noteId} className="law-card3d grid gap-2">
            <p className="font-bold"><bdi>{n.title}</bdi> {n.appealed && <span className="law-chip">{tr("استئناف")}</span>}</p>
            <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("سبب الإخفاء")}: <bdi dir="ltr">{n.hiddenReason}</bdi> · {tr("بلاغات")}: <bdi dir="ltr">{n.reports.length}</bdi></p>
            <ul className="text-xs">{n.reports.slice(0, 5).map((r, i) => <li key={i}><bdi dir="ltr">{r.reason}</bdi>{r.detail && ` — ${r.detail}`}</li>)}</ul>
            <div className="flex gap-2"><Button3D variant="danger" onClick={() => decide(n.noteId, "uphold")}>{tr("إزالة نهائية")}</Button3D><Button3D variant="neutral" onClick={() => decide(n.noteId, "restore")}>{tr("استعادة")}</Button3D></div>
          </li>
        ))}
      </ul>
    </>
  );
}
