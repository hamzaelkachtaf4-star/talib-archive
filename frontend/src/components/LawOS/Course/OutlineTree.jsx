import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, CaretLeft, MagnifyingGlass } from "@phosphor-icons/react";
import Law from "@/models/law";
import { tr } from "@/components/LawOS/lib/i18n";

/** The note text with the student's bold spans ({start,end} offsets into the text) rendered as <strong>. */
export function EmphasisText({ text, emphasis = [] }) {
  const parts = useMemo(() => {
    const out = [];
    let at = 0;
    for (const s of [...emphasis].sort((a, b) => a.start - b.start)) {
      if (s.start < at || s.end > text.length) continue;
      if (s.start > at) out.push({ t: text.slice(at, s.start) });
      out.push({ t: text.slice(s.start, s.end), strong: true });
      at = s.end;
    }
    if (at < text.length) out.push({ t: text.slice(at) });
    return out;
  }, [text, emphasis]);
  return (
    <p className="whitespace-pre-wrap text-sm leading-7">
      {parts.map((p, i) => (p.strong ? <strong key={i}>{p.t}</strong> : <span key={i}>{p.t}</span>))}
    </p>
  );
}

function TopicNote({ courseId, topicId }) {
  const [topic, setTopic] = useState(undefined); // undefined = loading, null = failed
  useEffect(() => {
    let live = true;
    Law.courseTopic(courseId, topicId).then((r) => live && setTopic(r.ok ? r.data.topic : null));
    return () => { live = false; };
  }, [courseId, topicId]);
  if (topic === undefined) return <p className="py-2 text-sm" style={{ color: "var(--law-muted)" }} role="status">…</p>;
  if (topic === null) return <p className="py-2 text-sm" style={{ color: "var(--law-danger)" }}>{tr("تعذر تحميل الملاحظة.")}</p>;
  return topic.text ? <EmphasisText text={topic.text} emphasis={topic.emphasis} /> : <p className="py-2 text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا نص في هذا الموضوع (عنوان فقط).")}</p>;
}

/** Collapsible outline of a course (topics in document order) with a note viewer and a search box. */
export default function OutlineTree({ courseId, topics }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(null);
  const seq = useRef(0);

  const hasChildren = useMemo(() => new Set(topics.map((t) => t.parentId).filter(Boolean)), [topics]);
  // Visible rows: everything except the descendants of a collapsed topic (rows are in document order, so a stack of depths is enough).
  const rows = useMemo(() => {
    const out = [];
    let hideBelow = null;
    for (const t of topics) {
      if (hideBelow !== null && t.depth > hideBelow) continue;
      hideBelow = null;
      out.push(t);
      if (collapsed.has(t.id)) hideBelow = t.depth;
    }
    return out;
  }, [topics, collapsed]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { seq.current++; return setHits(null); } // also invalidates a request still in flight
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      const r = await Law.courseSearch(term, courseId);
      if (mine === seq.current) setHits(r.ok ? r.data.results : []);
    }, 300);
    return () => clearTimeout(timer);
  }, [q, courseId]);

  // Opening a search hit: expand every ancestor so the topic is actually visible in the tree.
  const reveal = (id) => {
    const byId = new Map(topics.map((t) => [t.id, t]));
    setCollapsed((s) => {
      const n = new Set(s);
      for (let t = byId.get(id); t; t = byId.get(t.parentId)) n.delete(t.id);
      return n;
    });
    setOpenId(id);
    setQ("");
  };
  const toggle = (id) => setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allExpanded = collapsed.size === 0;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-md px-3" style={{ border: "1px solid var(--law-border)", background: "var(--law-surface)" }}>
          <MagnifyingGlass size={18} aria-hidden="true" style={{ color: "var(--law-muted)" }} />
          <span className="sr-only">{tr("ابحث في ملاحظاتك")}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("ابحث في ملاحظاتك")} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <button type="button" className="law-chip" onClick={() => setCollapsed(allExpanded ? new Set(topics.filter((t) => hasChildren.has(t.id)).map((t) => t.id)) : new Set())}>
          {allExpanded ? tr("طيّ الكل") : tr("فتح الكل")}
        </button>
      </div>

      {hits && (
        <section aria-live="polite" className="grid gap-1">
          <p className="text-xs" style={{ color: "var(--law-muted)" }}>{hits.length ? <><bdi dir="ltr">{hits.length}</bdi> {tr("نتيجة")}</> : tr("لا نتائج.")}</p>
          <ul className="grid gap-1">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" className="w-full rounded-md p-2 text-start" style={{ border: "1px solid var(--law-border)" }} onClick={() => reveal(h.id)}>
                  <span className="block text-xs" style={{ color: "var(--law-muted)" }}><bdi>{h.headingPath.slice(0, -1).join(" › ")}</bdi></span>
                  <span className="block font-semibold"><bdi>{h.title}</bdi></span>
                  {h.snippet && <span className="block text-xs" style={{ color: "var(--law-muted)" }}><bdi>{h.snippet}</bdi></span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul aria-label={tr("مخطط المادة")} className="grid">
        {rows.map((t) => {
          const branch = hasChildren.has(t.id);
          const isOpen = openId === t.id;
          return (
            <li key={t.id} style={{ borderBottom: "1px solid var(--law-border)" }}>
              <div className="flex min-h-[44px] items-center gap-1" style={{ paddingInlineStart: `${Math.min(t.depth, 8) * 1}rem` }}>
                {branch ? (
                  <button type="button" onClick={() => toggle(t.id)} aria-expanded={!collapsed.has(t.id)} aria-label={`${collapsed.has(t.id) ? tr("فتح الفرع") : tr("طيّ الفرع")}: ${t.title}`} className="grid min-h-[44px] min-w-[44px] place-items-center" style={{ color: "var(--law-muted)" }}>
                    {collapsed.has(t.id) ? <CaretLeft size={16} className="law-flip" /> : <CaretDown size={16} />}
                  </button>
                ) : <span className="min-w-[44px]" aria-hidden="true" />}
                <button type="button" onClick={() => setOpenId(isOpen ? null : t.id)} aria-expanded={isOpen} className="min-w-0 flex-1 py-2 text-start" style={{ fontWeight: t.depth === 0 ? 700 : 500 }}>
                  <bdi>{t.title}</bdi>
                  {t.hasEmphasis && <span className="law-chip ms-2" title={tr("فيه مقاطع مُبرَزة")}>{tr("مُبرَز")}</span>}
                </button>
              </div>
              {isOpen && <div className="pb-3" style={{ paddingInlineStart: `${Math.min(t.depth, 8) * 1 + 2.75}rem`, paddingInlineEnd: "0.75rem" }}><TopicNote courseId={courseId} topicId={t.id} /></div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
