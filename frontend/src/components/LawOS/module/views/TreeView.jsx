import { useState } from "react";
import { CaretDown, CaretUp, PencilSimple } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";
import { childrenMap } from "../treeModel";

function Branch({ node, kids, open, toggle, onOpen }) {
  const list = kids.get(node.id) || [];
  const isOpen = open.has(node.id);
  return (
    <li>
      <div className="flex items-center gap-1 py-1">
        {list.length ? (
          <button type="button" onClick={() => toggle(node.id)} aria-expanded={isOpen} aria-label={`${isOpen ? tr("طي") : tr("فتح")}: ${node.title}`} className="flex h-9 w-9 items-center justify-center rounded-full">
            {isOpen ? <CaretUp size={16} /> : <CaretDown size={16} />}
          </button>
        ) : <span className="inline-block h-9 w-9" aria-hidden="true" />}
        <button type="button" onClick={() => onOpen(node)} className="min-w-0 flex-1 truncate text-start font-medium"><bdi>{node.title}</bdi></button>
        {list.length > 0 && <span className="law-frac text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{list.length}</bdi></span>}
        <button type="button" onClick={() => onOpen(node)} aria-label={tr("تعديل: {0}", [node.title])} className="p-1" style={{ color: "var(--law-muted)" }}><PencilSimple size={16} /></button>
      </div>
      {isOpen && list.length > 0 && (
        <ul className="ms-6" style={{ borderInlineStart: "1px solid var(--law-border)", paddingInlineStart: "0.5rem" }}>
          {list.map((c) => <Branch key={c.id} node={c} kids={kids} open={open} toggle={toggle} onOpen={onOpen} />)}
        </ul>
      )}
    </li>
  );
}

/** Collapsible tree: branches open and close; the first level starts open. */
export default function TreeView({ nodes, onOpen }) {
  const kids = childrenMap(nodes);
  const roots = kids.get(null) || [];
  const [open, setOpen] = useState(() => new Set(roots.map((r) => r.id)));
  const toggle = (id) => setOpen((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <ul aria-label={tr("شجرة قابلة للطي")}>
      {roots.map((r) => <Branch key={r.id} node={r} kids={kids} open={open} toggle={toggle} onOpen={onOpen} />)}
    </ul>
  );
}
