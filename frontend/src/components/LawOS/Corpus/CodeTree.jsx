import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CaretDown, CaretLeft } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Notice } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

const count = (n) => n.articles.length + n.children.reduce((s, c) => s + count(c), 0);

function Node({ node, depth, open, toggle, path, at }) {
  const key = path.join("›");
  const isOpen = open.has(key);
  return (
    <li>
      {node.title && (
        <button type="button" onClick={() => toggle(key)} aria-expanded={isOpen} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start font-semibold" style={{ paddingInlineStart: `${0.5 + depth * 0.9}rem` }}>
          {isOpen ? <CaretDown size={16} aria-hidden="true" /> : <CaretLeft size={16} aria-hidden="true" className="rtl:rotate-0 ltr:-scale-x-100" />}
          <span className="min-w-0 flex-1"><bdi>{node.title}</bdi></span>
          <span className="shrink-0 text-xs font-normal" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{count(node)}</bdi></span>
        </button>
      )}
      {(isOpen || !node.title) && (
        <div style={{ paddingInlineStart: `${0.5 + (depth + (node.title ? 1 : 0)) * 0.9}rem` }}>
          {node.articles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 py-1">
              {node.articles.map((a) => (
                <Link key={a.canonicalId} to={`/law/corpus/a/${encodeURIComponent(a.canonicalId)}?at=${at}`} className="rounded-lg px-2.5 py-1 text-sm font-semibold no-underline" style={{ background: "var(--law-surface-2)", border: "1px solid var(--law-border)" }}>
                  <bdi dir="ltr">{a.number}</bdi>
                </Link>
              ))}
            </div>
          )}
          {node.children.length > 0 && (
            <ul>{node.children.map((c, i) => <Node key={i} node={c} depth={depth + (node.title ? 1 : 0)} open={open} toggle={toggle} path={[...path, c.title]} at={at} />)}</ul>
          )}
        </div>
      )}
    </li>
  );
}

const allKeys = (nodes, path = []) => nodes.flatMap((n) => (n.title ? [[...path, n.title].join("›"), ...allKeys(n.children, [...path, n.title])] : allKeys(n.children, path)));

/** The code as a collapsible outline (book, part, title, chapter) with its article numbers; expand/collapse all. */
export default function CodeTree({ slug, at }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  useEffect(() => {
    setData(null); setError(null); setOpen(new Set());
    Law.codeTree(slug).then((r) => { if (r.ok) setData(r.data); else setError(r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذر تحميل فهرس هذا النص.")); });
  }, [slug]);
  const keys = useMemo(() => (data ? allKeys(data.tree) : []), [data]);
  const toggle = (k) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  if (error) return <Notice tone="warn">{error}</Notice>;
  if (!data) return <p role="status" className="p-2 text-sm" style={{ color: "var(--law-muted)" }}>…</p>;
  return (
    <section aria-label={tr("فهرس النص")} className="law-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold"><bdi>{data.code.titleAr}</bdi> <span className="text-xs font-normal" style={{ color: "var(--law-muted)" }}>(<bdi dir="ltr">{data.code.articleCount}</bdi>)</span></h2>
        {keys.length > 0 && (
          <span className="flex gap-3 text-sm font-bold" style={{ color: "var(--law-primary)" }}>
            <button type="button" onClick={() => setOpen(new Set(keys))}>{tr("فتح الكل")}</button>
            <button type="button" onClick={() => setOpen(new Set())}>{tr("طيّ الكل")}</button>
          </span>
        )}
      </div>
      <ul>{data.tree.map((n, i) => <Node key={i} node={n} depth={0} open={open} toggle={toggle} path={[n.title]} at={at} />)}</ul>
    </section>
  );
}
