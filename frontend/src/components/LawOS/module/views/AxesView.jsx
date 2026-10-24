import { tr } from "@/components/LawOS/lib/i18n";
import { axes } from "../treeModel";

/** The module as its main axes (top-level nodes): how much sits under each and how much is written. */
export default function AxesView({ nodes, onOpen }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label={tr("محاور المطبوع")}>
      {axes(nodes).map(({ node, count, withBody }) => (
        <button key={node.id} type="button" onClick={() => onOpen(node)} className="law-card3d grid gap-2 text-start">
          <span className="font-bold"><bdi>{node.title}</bdi></span>
          <span className="text-sm" style={{ color: "var(--law-muted)" }}>{node.body.trim() ? node.body.slice(0, 120) : tr("لا نص بعد")}</span>
          <span className="text-xs" style={{ color: "var(--law-muted)" }}>
            {tr("{0} عقد تحته", [count])} · {tr("{0} منها مكتوبة", [withBody])}
          </span>
        </button>
      ))}
    </div>
  );
}
