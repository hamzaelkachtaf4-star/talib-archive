import { useMemo, useState } from "react";
import {
  CaretDown,
  CaretUp,
  Check,
  FolderOpen,
  MagnifyingGlass,
  PencilSimple,
  Scales,
  Sparkle,
  TreeStructure,
} from "@phosphor-icons/react";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Input } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { childrenMap } from "./treeModel";
import { refsOf, snippet, withRoots } from "./angles";

/** One node row in the full course tree with recursive children. */
function TreeNode({
  node,
  kids,
  openSet,
  toggle,
  onOpen,
  onSelectUnit,
  level = 0,
}) {
  const children = kids.get(node.id) || [];
  const isOpen = openSet.has(node.id);
  const hasKids = children.length > 0;
  const isUnit = level === 0;
  const refs = useMemo(() => refsOf(`${node.title} ${node.body || ""}`, 2), [node.title, node.body]);
  const summary = useMemo(() => snippet(node.body || "", 120), [node.body]);
  const isDone = Boolean(node.doneAt || node.done);

  return (
    <li className="relative">
      <div
        className="group flex flex-wrap items-center gap-2 rounded-xl p-2.5 transition-colors"
        style={{
          background: isUnit
            ? "var(--law-surface-2)"
            : "color-mix(in srgb, var(--law-surface) 60%, transparent)",
          border: isUnit
            ? "1px solid var(--law-border)"
            : "1px solid color-mix(in srgb, var(--law-border) 40%, transparent)",
        }}
      >
        {/* Toggle chevron or leaf indicator */}
        {hasKids ? (
          <button
            type="button"
            onClick={() => toggle(node.id)}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? tr("طي") : tr("فتح")}: ${node.title}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform"
            style={{
              background: "var(--law-surface)",
              color: "var(--law-primary)",
              border: "1px solid var(--law-border)",
            }}
          >
            {isOpen ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
          </button>
        ) : (
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs"
            style={{ color: "var(--law-muted)" }}
          >
            •
          </span>
        )}

        {/* Done status icon */}
        {isDone && (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--law-accent)", color: "var(--law-on-accent)" }}
            title={tr("منجز")}
          >
            <Check size={14} weight="bold" aria-hidden="true" />
          </span>
        )}

        {/* Node title */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen(node)}
              className="text-start font-bold leading-6 hover:underline"
              style={{
                color: isUnit ? "var(--law-text)" : "color-mix(in srgb, var(--law-text) 85%, transparent)",
                fontSize: isUnit ? "0.9375rem" : "0.875rem",
              }}
            >
              <bdi>{node.title}</bdi>
            </button>

            {node.aiDraft && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "var(--law-surface)", color: "var(--law-accent)" }}
              >
                <Sparkle size={12} aria-hidden="true" />
                {tr("صياغة الذكاء الاصطناعي")}
              </span>
            )}

            {refs.length > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "var(--law-surface)", color: "var(--law-gold-ink)" }}
              >
                <Scales size={12} aria-hidden="true" />
                <bdi dir="auto">{refs.join(" · ")}</bdi>
              </span>
            )}
          </div>

          {summary && (
            <p
              className="mt-0.5 line-clamp-2 text-xs leading-5"
              style={{ color: "var(--law-muted)" }}
            >
              <bdi>{summary}</bdi>
            </p>
          )}
        </div>

        {/* Child count badge */}
        {hasKids && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: "var(--law-surface)", color: "var(--law-muted)" }}
          >
            <bdi dir="ltr">{children.length}</bdi> {tr("عناصر")}
          </span>
        )}

        {/* Action buttons */}
        <div className="ms-auto flex shrink-0 items-center gap-1.5">
          {isUnit && onSelectUnit && (
            <button
              type="button"
              onClick={() => onSelectUnit(node.id)}
              className="inline-flex min-h-7 items-center gap-1 rounded-lg border px-2 text-xs font-bold transition-colors hover:bg-[var(--law-surface)]"
              style={{ borderColor: "var(--law-border)", color: "var(--law-primary)" }}
              title={tr("افتح في مسار الحصص")}
            >
              <FolderOpen size={14} aria-hidden="true" />
              <span>{tr("افتح الحصة")}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpen(node)}
            aria-label={tr("تعديل: {0}", [node.title])}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--law-surface)]"
            style={{ color: "var(--law-muted)" }}
          >
            <PencilSimple size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Recursive children tree */}
      {isOpen && hasKids && (
        <ul
          className="ms-3.5 mt-1.5 grid gap-1.5"
          style={{
            borderInlineStart: "2px solid var(--law-border)",
            paddingInlineStart: "0.75rem",
          }}
        >
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              kids={kids}
              openSet={openSet}
              toggle={toggle}
              onOpen={onOpen}
              onSelectUnit={onSelectUnit}
              level={level + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * FullCourseTree: Comprehensive course tree from A to Z («من أ حتى لـ ز»).
 * Displays the entire syllabus hierarchy: axes, sessions, sections, topics, and legal articles.
 */
export default function FullCourseTree({ nodes, onOpen, onSelectUnit }) {
  const rooted = useMemo(() => withRoots(nodes), [nodes]);
  const kids = useMemo(() => childrenMap(rooted), [rooted]);
  const roots = useMemo(() => kids.get(null) || [], [kids]);
  const [filter, setFilter] = useState("");

  // Default: top roots open
  const [openSet, setOpenSet] = useState(() => new Set(roots.map((r) => r.id)));

  const toggle = (id) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => {
    const all = new Set(nodes.map((n) => n.id));
    setOpenSet(all);
  };

  const collapseAll = () => {
    setOpenSet(new Set());
  };

  // Filter nodes matching search query
  const query = filter.trim().toLowerCase();
  const matchingRoots = useMemo(() => {
    if (!query) return roots;
    const matchesNode = (n) =>
      n.title.toLowerCase().includes(query) ||
      (n.body && n.body.toLowerCase().includes(query));
    const hasMatchingDescendant = (n) => {
      if (matchesNode(n)) return true;
      const ch = kids.get(n.id) || [];
      return ch.some(hasMatchingDescendant);
    };
    return roots.filter(hasMatchingDescendant);
  }, [roots, kids, query]);

  const totalBranches = nodes.length - roots.length;

  return (
    <section
      className="law-card grid gap-4 p-4 sm:p-5"
      aria-label={tr("شجرة المادة كاملة من أ إلى ز")}
    >
      {/* Header with search & expand controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--law-border)" }}>
        <div className="flex items-center gap-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "var(--law-surface-2)", color: "var(--law-primary)" }}
          >
            <TreeStructure size={20} weight="bold" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-bold leading-6">
              {tr("الشجرة الكاملة للمادة")}
            </h2>
            <p className="text-xs" style={{ color: "var(--law-muted)" }}>
              {tr("تصميم المادة كاملاً من البداية إلى النهاية: {0} حصة/محور و {1} فرعاً قانونياً", [
                roots.length,
                totalBranches,
              ])}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button3D variant="neutral" onClick={expandAll}>
            {tr("توسيع الكل")}
          </Button3D>
          <Button3D variant="neutral" onClick={collapseAll}>
            {tr("طي الكل")}
          </Button3D>
        </div>
      </div>

      {/* Filter / Search input */}
      <div className="relative">
        <Input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={tr("ابحث في شجرة المادة (عناوين، نصوص، فصول قانونية)...")}
          aria-label={tr("ابحث في الشجرة")}
        />
      </div>

      {/* Tree list */}
      {matchingRoots.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: "var(--law-border)", color: "var(--law-muted)" }}>
          {query ? tr("لا توجد عناصر مطابقة لبحثك في الشجرة.") : tr("لا توجد محاور أو حصص بعد في هذه المادة.")}
        </p>
      ) : (
        <ul className="grid gap-2" role="tree" aria-label={tr("هيكل الشجرة")}>
          {matchingRoots.map((root) => (
            <TreeNode
              key={root.id}
              node={root}
              kids={kids}
              openSet={openSet}
              toggle={toggle}
              onOpen={onOpen}
              onSelectUnit={onSelectUnit}
              level={0}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
