import { useEffect, useState } from "react";
import Law from "@/models/law";
import Sheet from "@/components/LawOS/kit/Sheet";
import { findSavedArticle } from "@/components/LawOS/lib/legalOffline";
import { getRelatedNodes, getConceptGraph } from "@/components/LawOS/lib/graphOffline";
import { tr } from "@/components/LawOS/lib/i18n";
import CardSaver from "./CardSaver";
import { NodeName, colorOf, edgeRelation, kindLabel } from "./shared";

/** Full statute text: server first, then a saved offline pack, then only the bundle's short summary. */
function useArticleText(node) {
  const [state, setState] = useState({ text: null, from: null });
  const id = node?.type === "article" ? node.id : null;
  useEffect(() => {
    if (!id) return setState({ text: null, from: null });
    let live = true;
    (async () => {
      const r = await Law.article(id);
      if (!live) return;
      if (r.ok && r.data.article.current) return setState({ text: r.data.article.current.textAr, from: "server" });
      const saved = await findSavedArticle(id);
      if (!live) return;
      setState(saved ? { text: saved.article.text, from: "saved" } : { text: null, from: "none" });
    })();
    return () => { live = false; };
  }, [id]);
  return state;
}

function Rel({ title, items, onPick, onCard, side, plain }) {
  if (!items.length) return null;
  return (
    <section className="mb-3">
      <h3 className="mb-1 text-sm font-bold">{title}</h3>
      <ul className="flex flex-col">
        {items.map(({ node, edge }) => (
          <li key={`${edge.k}-${edge.s}-${edge.t}-${edge.r || ""}`} className="flex items-center justify-between gap-2 py-1" style={{ borderBottom: "1px solid var(--law-border)" }}>
            <button type="button" onClick={() => onPick(node.id)} className="text-start text-sm" style={{ minBlockSize: 44 }}>
              <span aria-hidden="true" className="me-1.5 inline-block size-2.5 rounded-full" style={{ background: colorOf(node) }} />
              {!plain && <span className="law-muted text-xs">{side === "in" ? tr("{0} هذا النص", [edgeRelation(edge)]) : edgeRelation(edge)} </span>}<NodeName node={node} />
              {edge.k === "explicit" && <span className="law-muted text-xs"> · {tr("إحالة نصية")}</span>}
            </button>
            <button type="button" className="law-btn law-btn-secondary text-xs" onClick={() => onCard(edge)}>{tr("بطاقة")}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Bottom sheet for one node: text, relations, and one-tap flashcards for any relation. */
export default function NodeSheet({ index, nodeId, onClose, onPick }) {
  const node = nodeId ? index.nodes.get(nodeId) : null;
  const { text, from } = useArticleText(node);
  const [cardEdge, setCardEdge] = useState(null);
  useEffect(() => setCardEdge(null), [nodeId]);
  if (!node) return null;
  const rel = getRelatedNodes(index, node.id);
  const cg = node.type === "concept" ? getConceptGraph(index, node.slug) : null;
  return (
    <Sheet open onClose={onClose} title={<NodeName node={node} />}>
      <p className="mb-2 text-xs font-semibold" style={{ color: colorOf(node) }}>{kindLabel(node)}</p>
      {node.type === "article" && (
        <div className="law-card mb-3 p-3">
          {text ? <p className="whitespace-pre-wrap leading-8">{text}</p> : <p className="leading-8">{node.summary}</p>}
          {from === "none" && <p className="law-muted mt-2 text-xs">{tr("هذا ملخص فقط. النص الكامل يحتاج اتصالا أو نسخة محفوظة.")}</p>}
        </div>
      )}
      {cg && cg.articles.length > 0 && (
        <section className="mb-3">
          <h3 className="mb-1 text-sm font-bold">{tr("النصوص المرتبطة")}</h3>
          <div className="flex flex-wrap gap-2">
            {cg.articles.map((a) => <button key={a.id} type="button" className="law-chip" onClick={() => onPick(a.id)}><NodeName node={a} /></button>)}
          </div>
        </section>
      )}
      <Rel title={tr("يحيل عليه")} items={rel.parents} side="in" onPick={onPick} onCard={setCardEdge} />
      <Rel title={tr("يحيل على")} items={rel.children} onPick={onPick} onCard={setCardEdge} />
      <Rel title={tr("نظائر وأزواج خلط")} items={rel.peers} plain onPick={onPick} onCard={setCardEdge} />
      {!rel.parents.length && !rel.children.length && !rel.peers.length && <p className="law-muted text-sm">{tr("لا علاقات مسجلة لهذا النص بعد.")}</p>}
      {cardEdge && (
        <div className="law-card mt-3 p-3">
          <CardSaver key={`${cardEdge.k}-${cardEdge.s}-${cardEdge.t}-${cardEdge.r || ""}`} index={index} edge={cardEdge} onDone={() => {}} />
        </div>
      )}
      <button type="button" className="law-btn law-btn-secondary mt-3 w-full" onClick={onClose}>{tr("إغلاق")}</button>
    </Sheet>
  );
}
