import { egoLayout, nodeLabel } from "@/components/LawOS/lib/graphIndex";
import { colorOf } from "./shared";
import { tr } from "@/components/LawOS/lib/i18n";

const SIZE = 320;
const HALF = SIZE / 2;
const R = 132; // layout is in [-1, 1]; leave room for the labels

const short = (n) => (n.type === "article" ? String(n.n) : nodeLabel(n).slice(0, 14));

/** Focus node in the centre, its neighbours on a ring. Plain SVG: no canvas engine, no dependency. */
export default function EgoMap({ index, focusId, onPick, max = 10 }) {
  const { nodes, edges, hidden } = egoLayout(index, focusId, { max });
  if (!nodes.length) return null;
  const at = Object.fromEntries(nodes.map((p) => [p.id, { x: HALF + p.x * R, y: HALF + p.y * R }]));
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label={tr("خريطة العلاقات")} className="mx-auto block w-full max-w-md" style={{ touchAction: "manipulation" }}>
        {edges.map((e, i) => (
          <line key={i} x1={at[e.s].x} y1={at[e.s].y} x2={at[e.t].x} y2={at[e.t].y} stroke="var(--law-border)" strokeWidth={e.k === "link" ? 2.5 : 1.5} strokeDasharray={e.k === "explicit" ? "4 3" : undefined} />
        ))}
        {nodes.map((p) => {
          const n = index.nodes.get(p.id);
          const center = p.id === focusId;
          const { x, y } = at[p.id];
          return (
            <g key={p.id} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={nodeLabel(n)} aria-current={center || undefined}
              onClick={() => onPick(p.id)} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), onPick(p.id))} style={{ cursor: "pointer" }}>
              <circle r={center ? 28 : 22} fill="var(--law-surface)" stroke={colorOf(n)} strokeWidth={center ? 4 : 2.5} />
              <text textAnchor="middle" dominantBaseline="central" fontSize={center ? 13 : 11} fontWeight="700" fill="var(--law-text)" direction="ltr">{short(n)}</text>
            </g>
          );
        })}
      </svg>
      {hidden > 0 && <figcaption className="law-muted mt-1 text-center text-xs">{tr("و{0} علاقات أخرى في قائمة التفاصيل", [hidden])}</figcaption>}
    </figure>
  );
}
