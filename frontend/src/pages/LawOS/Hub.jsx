import { useEffect, useState } from "react";
import MascotSlot from "@/components/LawOS/kit/MascotSlot";
import { Link } from "react-router-dom";
import { MagnifyingGlass } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Card, Input, Notice, Select } from "@/components/LawOS/ui";
import { PageTitle } from "@/components/LawOS/EmptyState";
import CommunityTabs from "@/components/LawOS/kit/CommunityTabs";
import Chip from "@/components/LawOS/kit/Chip";
import PinnedExamCard from "@/components/LawOS/hub/PinnedExamCard";
import ProjectsStrip from "@/components/LawOS/hub/ProjectsStrip";
import { DOC_TYPES, docTypeLabel } from "@/components/LawOS/lib/docTypes";
import Avatar from "@/components/LawOS/Squad/Avatar";
import NoteBadges from "@/components/LawOS/Squad/NoteBadges";
import { squadError } from "./Squad";
import { tr } from "@/components/LawOS/lib/i18n";

/** Faculty Hub: public master notes of a cohort, filtered by module and professor, searchable. */
export default function Hub() {
  const [facets, setFacets] = useState(null);
  const [filters, setFilters] = useState({ cohort: "", module: "", professor: "", q: "", sort: "recent", type: "" });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value, ...(k === "cohort" ? { module: "", professor: "" } : {}) }));

  useEffect(() => {
    Law.hubFacets(filters.cohort || undefined).then((r) => (r.ok ? setFacets(r.data) : setError(squadError(r))));
  }, [filters.cohort]);

  useEffect(() => {
    const t = setTimeout(() => {
      Law.hubNotes(filters).then((r) => (r.ok ? (setData(r.data), setError(null)) : setError(squadError(r))));
    }, 250);
    return () => clearTimeout(t);
  }, [filters]);

  return (
    <>
      <PageTitle sub={tr("ملخصات الطلبة العامة، حسب المادة والأستاذ")}>{tr("منصة الكلية")}</PageTitle>
      <CommunityTabs />
      <Link to="/law/community/hub/requests" className="mb-3 inline-block text-sm font-bold" style={{ color: "var(--law-primary)" }}>{tr("طلبات التعديل")}</Link>
      <Notice>{tr("ملخصات طلبة، وليست مصدراً رسمياً: تحقّق دائماً من النصوص الرسمية ومن محاضرة الأستاذ.")}</Notice>
      <PinnedExamCard />
      <ProjectsStrip />
      <div role="tablist" aria-label={tr("نوع الوثيقة")} className="mb-3 flex gap-2 overflow-x-auto">
        {[["", tr("الكل")], ...DOC_TYPES()].map(([k, l]) => (
          <Chip key={k || "all"} role="tab" aria-selected={filters.type === k} active={filters.type === k} onClick={() => setFilters((f) => ({ ...f, type: k }))}>{l}</Chip>
        ))}
      </div>
      <Card className="mb-4 flex flex-col gap-2 p-3">
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute top-3 opacity-60" style={{ insetInlineStart: 12 }} />
          <Input value={filters.q} onChange={set("q")} placeholder={tr("ابحث في الملخصات…")} style={{ paddingInlineStart: 38 }} dir="auto" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={filters.module} onChange={set("module")} aria-label={tr("المادة")} options={[["", tr("كل المواد")], ...(facets?.modules || []).map((m) => [m, m])]} />
          <Select value={filters.professor} onChange={set("professor")} aria-label={tr("الأستاذ(ة)")} options={[["", tr("كل الأساتذة")], ...(facets?.professors || []).map((p) => [p, p])]} />
          <Select value={filters.cohort || facets?.cohort || ""} onChange={set("cohort")} aria-label={tr("الفوج")} options={(facets?.cohorts || []).map((c) => [c, c])} />
          <Select
            value={filters.sort}
            onChange={set("sort")}
            aria-label={tr("الترتيب")}
            options={[
              ["recent", tr("الأحدث")],
              ["endorsed", tr("الأكثر توثيقاً")],
            ]}
          />
        </div>
      </Card>
      {error && <Notice tone="warn">{error}</Notice>}
      {!data ? (
        !error && <p className="law-muted">…</p>
      ) : !data.notes.length ? (
        <MascotSlot message={tr("لا ملخصات عامة هنا بعد. انشر محاضرة من فرقتك لتكون الأول.")} />
      ) : (
        <div className="flex flex-col gap-3">
          {data.notes.map((n) => (
            <Link key={n.id} to={`/law/hub/notes/${n.id}`} className="law-card flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2">
                <Avatar person={n.author} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  <bdi>{n.author.name}</bdi>
                </span>
                <NoteBadges note={n} />
              </div>
              {(n.docType || n.pendingRequests > 0) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {n.docType && <span className="whitespace-nowrap rounded-full px-2.5 py-0.5 font-bold" style={{ background: "var(--law-surface-2)", border: "1px solid var(--law-border)" }}>{docTypeLabel(n.docType)}</span>}
                  {n.pendingRequests > 0 && <span className="whitespace-nowrap font-bold" style={{ color: "var(--law-warn)" }}><bdi dir="ltr">{n.pendingRequests}</bdi> {tr("طلبات تعديل")}</span>}
                </div>
              )}
              <p className="font-bold">
                <bdi>{n.title}</bdi>
              </p>
              <p className="text-xs" style={{ color: "var(--law-muted)" }}>
                <bdi>{n.moduleName}</bdi> · <bdi>{n.professorName}</bdi> · {tr("الحصة {0}", [n.sessionNumber])}
              </p>
              {n.excerpt && (
                <p className="line-clamp-3 text-sm leading-7" style={{ color: "var(--law-muted)" }}>
                  <bdi>{n.excerpt}</bdi>
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
