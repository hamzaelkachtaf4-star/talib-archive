import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import { PageTitle } from "@/components/LawOS/EmptyState";
import { Input, Notice } from "@/components/LawOS/ui";
import Chip from "@/components/LawOS/kit/Chip";
import { loadGraph, searchGraph } from "@/components/LawOS/lib/graphOffline";
import EgoMap from "@/components/LawOS/Graph/EgoMap";
import TreeView from "@/components/LawOS/Graph/TreeView";
import Tours from "@/components/LawOS/Graph/Tours";
import NodeSheet from "@/components/LawOS/Graph/NodeSheet";
import { Legend, NodeName, colorOf } from "@/components/LawOS/Graph/shared";
import { tr } from "@/components/LawOS/lib/i18n";

const MODES = [
  ["map", () => tr("الخريطة")],
  ["tree", () => tr("الشجرة")],
  ["tours", () => tr("مسارات المراجعة")],
];

/** Starting points for the map: every concept, then the best-connected articles. */
function starters(index) {
  const deg = (n) => (index.out.get(n.id) || []).length + (index.inc.get(n.id) || []).length;
  const all = [...index.nodes.values()];
  return [...all.filter((n) => n.type === "concept"), ...all.filter((n) => n.type === "article" && deg(n) > 0).sort((a, b) => deg(b) - deg(a)).slice(0, 8)];
}

export default function LegalGraph() {
  const [state, setState] = useState(null); // { index, source, savedAt }
  const [mode, setMode] = useState("map");
  const [focus, setFocus] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => { loadGraph().then(setState); }, []);
  const index = state?.index;
  const results = useMemo(() => (index && query.trim() ? searchGraph(index, query, 8) : []), [index, query]);
  const open = (id) => { setFocus(id); setSheet(id); setMode((m) => (m === "tours" ? "map" : m)); };

  return (
    <>
      <Link to="/law/library" className="mb-3 flex items-center gap-1 text-sm">
        <ArrowRight size={18} className="law-flip" /> {tr("قوانين ومراجع")}
      </Link>
      <PageTitle sub={tr("علاقات النصوص والمفاهيم، تعمل بدون اتصال بعد أول تحميل")}>{tr("خريطة المفاهيم والقواعد القانونية")}</PageTitle>

      {!state && <p role="status" className="law-muted">{tr("جارٍ التحميل…")}</p>}
      {state && !index && <Notice tone="warn">{state.source === "offline-empty" ? tr("لم تُحمَّل الخريطة بعد. اتصل بالإنترنت مرة واحدة لتحميلها.") : tr("تعذر تحميل الخريطة.")}</Notice>}
      {state?.source === "offline" && <Notice tone="warn">{tr("بدون اتصال: نسخة محفوظة.")}</Notice>}

      {index && (
        <>
          <div role="tablist" aria-label={tr("طريقة العرض")} className="mb-3 flex flex-wrap gap-2">
            {MODES.map(([k, label]) => <Chip key={k} role="tab" aria-selected={mode === k} active={mode === k} onClick={() => setMode(k)}>{label()}</Chip>)}
          </div>
          <div className="mb-3">
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("ابحث عن مفهوم أو رقم فصل")} aria-label={tr("بحث في الخريطة")} />
            {results.length > 0 && (
              <ul className="law-card mt-1 flex flex-col p-1">
                {results.map((n) => (
                  <li key={n.id}><button type="button" className="w-full py-2 text-start text-sm" style={{ minBlockSize: 44 }} onClick={() => { setQuery(""); open(n.id); }}>
                    <span aria-hidden="true" className="me-1.5 inline-block size-2.5 rounded-full" style={{ background: colorOf(n) }} /><NodeName node={n} />
                  </button></li>
                ))}
              </ul>
            )}
          </div>

          {mode === "map" && (
            <>
              <Legend />
              {focus && index.nodes.has(focus) ? (
                <>
                  <EgoMap index={index} focusId={focus} onPick={open} />
                  <button type="button" className="law-btn law-btn-secondary mt-2" onClick={() => setSheet(focus)}>{tr("التفاصيل والبطاقات")}</button>
                </>
              ) : index.size === 0 ? (
                <p className="law-muted text-sm">{tr("لا توجد علاقات مسجلة بعد.")}</p>
              ) : (
                <>
                  <p className="law-muted mb-2 text-sm">{tr("اختر نقطة بداية:")}</p>
                  <div className="flex flex-wrap gap-2">
                    {starters(index).map((n) => <button key={n.id} type="button" className="law-chip" onClick={() => open(n.id)}><NodeName node={n} /></button>)}
                  </div>
                </>
              )}
            </>
          )}
          {mode === "tree" && <TreeView index={index} onPick={open} />}
          {mode === "tours" && <Tours index={index} onPick={open} />}
          <NodeSheet index={index} nodeId={sheet} onClose={() => setSheet(null)} onPick={open} />
        </>
      )}
    </>
  );
}
