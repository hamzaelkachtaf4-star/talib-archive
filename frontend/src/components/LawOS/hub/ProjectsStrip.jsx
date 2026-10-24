import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Law from "@/models/law";
import Avatar from "./../Squad/Avatar";
import { COLORS, formatInfo, ordered } from "@/components/LawOS/Today/formats";
import { tr } from "@/components/LawOS/lib/i18n";

/** Colleagues' public subjects (same faculty and semester), with how many edit requests wait on them. */
export default function ProjectsStrip() {
  const [projects, setProjects] = useState([]);
  useEffect(() => { Law.hubProjects().then((r) => r.ok && setProjects(r.data.projects)); }, []);
  if (!projects.length) return null;
  return (
    <section className="mb-4" aria-label={tr("مشاريع عمومية")}>
      <h2 className="mb-2 text-sm font-bold">{tr("مشاريع الزملاء العمومية")}</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {projects.map((p) => (
          <article key={`${p.id}-${p.author.userId}`} className="law-card flex w-64 shrink-0 flex-col gap-2 p-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[p.color] || COLORS.slate }} />
              <h3 className="min-w-0 flex-1 truncate text-sm font-bold"><bdi>{p.title}</bdi></h3>
              <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--law-accent)", color: "var(--law-on-accent)" }}>{tr("مشروع عمومي")}</span>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--law-muted)" }}>
              <Avatar person={p.author} size={20} /><bdi className="truncate">{p.author.name}</bdi>
            </div>
            <div className="flex flex-wrap gap-1">
              {ordered(p.formats).map((k) => <span key={k} className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--law-surface-2)", border: "1px solid var(--law-border)" }}>{formatInfo(k)[3]}</span>)}
            </div>
            {p.pendingRequests > 0 && (
              <Link to="/law/community/hub/requests" className="whitespace-nowrap text-xs font-bold" style={{ color: "var(--law-warn)" }}>
                <bdi dir="ltr">{p.pendingRequests}</bdi> {tr("طلبات تعديل")}
              </Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
