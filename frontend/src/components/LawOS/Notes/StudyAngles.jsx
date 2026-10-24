import { useMemo } from "react";
import { TreeStructure, Table, ListBullets, Cards } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";

/** The four study angles of a subject; the three first are views over the same accepted atoms. */
export const ANGLES = [
  ["schemas", tr("الخطاطات"), TreeStructure],
  ["tables", tr("الجداول"), Table],
  ["summaries", tr("الملخصات"), ListBullets],
  ["cards", tr("البطاقات"), Cards],
];

const clip = (t, n = 140) => {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
};

/** Tactile tiles: one pressed at a time; "cards" is a link handled by the caller. */
export function AngleTiles({ angle, onPick }) {
  return (
    <div role="tablist" aria-label={tr("زوايا الدراسة")} className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {ANGLES.map(([key, label, Icon]) => (
        <button key={key} type="button" role="tab" aria-selected={angle === key} onClick={() => onPick(key)} className="law-btn3d" data-variant={angle === key ? undefined : "neutral"}>
          <Icon size={20} weight="duotone" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Outline of the course as a concept map: headings are nodes, each with its notes underneath. */
export function SchemasView({ atoms }) {
  const tree = useMemo(() => {
    const root = { children: new Map(), atoms: [] };
    for (const a of atoms) {
      let node = root;
      for (const h of a.headingPath?.length ? a.headingPath : [tr("بدون عنوان")]) {
        if (!node.children.has(h)) node.children.set(h, { children: new Map(), atoms: [] });
        node = node.children.get(h);
      }
      node.atoms.push(a);
    }
    return root;
  }, [atoms]);
  const render = (node, depth = 0) =>
    [...node.children.entries()].map(([title, n]) => (
      <li key={title} className="relative ps-4" style={{ borderInlineStart: "2px solid rgb(167 243 208)" }}>
        <div className="my-1 inline-flex items-center gap-2 rounded-xl border-2 border-emerald-200 bg-[var(--law-surface)] px-3 py-1.5 text-sm font-bold text-[var(--law-text)]">
          <bdi>{title}</bdi>
          {n.atoms.length > 0 && <span className="rounded-full bg-emerald-100 px-2 text-xs text-emerald-800"><bdi dir="ltr">{n.atoms.length}</bdi></span>}
        </div>
        {n.atoms.length > 0 && (
          <ul className="mb-1 ms-2 space-y-0.5 text-xs text-[var(--law-muted)]">
            {n.atoms.slice(0, 3).map((a) => <li key={a.id}><bdi>{clip(a.body, 90)}</bdi></li>)}
          </ul>
        )}
        {n.children.size > 0 && <ul className="ms-3">{render(n, depth + 1)}</ul>}
      </li>
    ));
  return <ul className="space-y-1">{render(tree)}</ul>;
}

/** Comparison table per heading: statute text, the professor's position, case law and doctrine side by side. */
export function TablesView({ atoms }) {
  const rows = useMemo(() => {
    const by = new Map();
    for (const a of atoms) {
      const k = a.headingPath?.length ? a.headingPath.join(" › ") : tr("بدون عنوان");
      if (!by.has(k)) by.set(k, { PROF: [], TEXT: [], JURIS: [], DOCTRINE: [] });
      const cell = by.get(k)[a.provenance];
      if (cell) cell.push(a);
    }
    return [...by.entries()].filter(([, c]) => Object.values(c).some((x) => x.length));
  }, [atoms]);
  const cols = [["TEXT", tr("النص")], ["PROF", tr("الأستاذ")], ["JURIS", tr("اجتهاد")], ["DOCTRINE", tr("فقه")]];
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--law-border)] bg-[var(--law-surface)]">
      <table className="w-full min-w-[40rem] text-start text-sm">
        <thead className="bg-[var(--law-surface-2)] text-xs font-bold text-[var(--law-muted)]">
          <tr>
            <th className="p-3 text-start">{tr("الموضوع")}</th>
            {cols.map(([k, l]) => <th key={k} className="p-3 text-start">{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([heading, cells]) => (
            <tr key={heading} className="border-t border-[var(--law-border)] align-top">
              <th scope="row" className="p-3 text-start font-bold text-[var(--law-text)]"><bdi>{heading}</bdi></th>
              {cols.map(([k]) => (
                <td key={k} className="p-3 text-[var(--law-text)]">
                  {cells[k].length ? cells[k].slice(0, 2).map((a) => <p key={a.id} className="mb-1"><bdi>{clip(a.body)}</bdi></p>) : <span className="text-[var(--law-muted)]">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
