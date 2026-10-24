import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { tr } from "@/components/LawOS/lib/i18n";
import { loadGraph } from "@/components/LawOS/lib/graphOffline";
import EgoMap from "@/components/LawOS/Graph/EgoMap";
import NodeSheet from "@/components/LawOS/Graph/NodeSheet";
import { Legend, NodeName } from "@/components/LawOS/Graph/shared";
import { Notice } from "@/components/LawOS/ui";
import { conceptIdsOf, graphIdsOf } from "../angles";

/** «غراف العلاقات»: the legal graph, started from the texts and concepts this module's own notes mention. */
export default function GraphAngleView({ nodes }) {
  const [state, setState] = useState(null);
  const [focus, setFocus] = useState(null);
  const [sheet, setSheet] = useState(null);
  useEffect(() => { loadGraph().then(setState).catch(() => setState({ index: null, source: "error" })); }, []);
  const index = state?.index;
  const starts = useMemo(() => (index ? [...new Set([...graphIdsOf(nodes, index), ...conceptIdsOf(nodes, index)])].slice(0, 12) : []), [index, nodes]);
  useEffect(() => { if (starts.length && !focus) setFocus(starts[0]); }, [starts]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (id) => { setFocus(id); setSheet(id); };

  if (!state) return <p role="status" className="law-muted">{tr("جارٍ التحميل…")}</p>;
  if (!index) return <Notice tone="warn">{state.source === "offline-empty" ? tr("لم تُحمَّل الخريطة بعد. اتصل بالإنترنت مرة واحدة لتحميلها.") : tr("تعذر تحميل الخريطة.")}</Notice>;
  return (
    <section aria-label={tr("غراف العلاقات")}>
      {state.source === "offline" && <Notice tone="warn">{tr("بدون اتصال: نسخة محفوظة.")}</Notice>}
      {starts.length === 0 ? (
        <Notice>{tr("لم نجد في ملاحظات هذه المادة فصولاً أو مفاهيم موجودة في الخريطة بعد. افتح الخريطة العامة لتتصفحها.")}</Notice>
      ) : (
        <>
          <p className="mb-2 text-sm" style={{ color: "var(--law-muted)" }}>{tr("نقاط بداية مأخوذة من ملاحظاتك:")}</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {starts.map((id) => <button key={id} type="button" aria-pressed={focus === id} className="law-chip" onClick={() => setFocus(id)}><NodeName node={index.nodes.get(id)} /></button>)}
          </div>
          <Legend />
          {focus && index.nodes.has(focus) && (
            <>
              <EgoMap index={index} focusId={focus} onPick={open} />
              <button type="button" className="law-btn3d mt-2" data-variant="neutral" onClick={() => setSheet(focus)}>{tr("التفاصيل والبطاقات")}</button>
            </>
          )}
        </>
      )}
      <Link to="/law/library/graph" className="mt-3 inline-block text-sm font-bold" style={{ color: "var(--law-primary)" }}>{tr("افتح الخريطة العامة")}</Link>
      <NodeSheet index={index} nodeId={sheet} onClose={() => setSheet(null)} onPick={open} />
    </section>
  );
}
