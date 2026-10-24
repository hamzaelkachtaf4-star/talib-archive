import { useEffect, useState } from "react";
import Law from "@/models/law";
import { conceptGraph, edgeCardParts, nodeLabel } from "@/components/LawOS/lib/graphIndex";
import { tr } from "@/components/LawOS/lib/i18n";
import { edgeRelation } from "./shared";

const cite = (ids) => ids.join("، ");

/**
 * Card text restates the edge only: its relation, its own note and canonical citations. Nothing is generated,
 * and the student edits it before saving.
 */
export function composeCard(index, edge) {
  const p = edgeCardParts(index, edge);
  if (!p) return null;
  const la = nodeLabel(p.a), lb = nodeLabel(p.b);
  let front, back;
  if (p.kind === "pair") {
    front = tr("ما الفرق بين {0} و{1}؟", [la, lb]);
    const arts = [p.a, p.b].flatMap((c) => conceptGraph(index, c.slug)?.articles.map((a) => a.id) || []);
    back = [index.nodes.get(`p:${edge.pair}`)?.labelAr, arts.length ? `${tr("المراجع")}: ${cite([...new Set(arts)])}` : ""].filter(Boolean).join("\n");
    return { front, back, canonicalIds: [...new Set(arts)], conceptIds: p.conceptIds };
  }
  if (p.kind === "concept") front = tr("ما صلة مفهوم «{0}» بـ{1}؟", [la, lb]);
  else front = tr("ما هي العلاقة القانونية بين {0} و{1}؟", [la, lb]);
  back = [`${la} ${edgeRelation(edge)} ${lb}`, p.note, p.canonicalIds.length ? `${tr("المراجع")}: ${cite(p.canonicalIds)}` : ""].filter(Boolean).join("\n");
  return { front, back, canonicalIds: p.canonicalIds, conceptIds: p.conceptIds };
}

/** Edit-and-save form for one graph relation; saved as a manual flashcard in the student's chosen subject. */
export default function CardSaver({ index, edge, onDone }) {
  const draft = composeCard(index, edge);
  const [subjects, setSubjects] = useState(null);
  const [subjectId, setSubjectId] = useState("");
  const [front, setFront] = useState(draft?.front || "");
  const [back, setBack] = useState(draft?.back || "");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Law.subjects().then((r) => {
      if (!r.ok) return setSubjects(r.offline ? "offline" : []);
      setSubjects(r.data.subjects);
      setSubjectId(r.data.subjects[0]?.id || "");
    });
  }, []);

  async function save() {
    setBusy(true);
    const r = await Law.createCard({ subjectId, origin: "manual", type: "basic", front, back, canonicalIds: draft.canonicalIds, conceptIds: draft.conceptIds });
    setBusy(false);
    if (r.ok) { setMsg(tr("حُفظت البطاقة وستظهر في المراجعة.")); onDone?.(); }
    else setMsg(r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذر الحفظ."));
  }

  if (!draft) return null;
  if (subjects === "offline") return <p className="law-muted text-sm" role="status">{tr("يحتاج اتصالا بالخادم.")}</p>;
  if (subjects && !subjects.length) return <p className="law-muted text-sm">{tr("أنشئ مادة دراسية أولا لتحفظ فيها البطاقات.")}</p>;
  return (
    <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">{tr("المادة")}</span>
        <select className="law-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!subjects}>
          {(subjects || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">{tr("السؤال")}</span>
        <textarea className="law-input" rows={2} value={front} maxLength={1000} onChange={(e) => setFront(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">{tr("الجواب")}</span>
        <textarea className="law-input" rows={4} value={back} maxLength={4000} onChange={(e) => setBack(e.target.value)} />
      </label>
      <button type="submit" className="law-btn law-btn-primary" disabled={busy || !subjectId || !front.trim() || !back.trim()}>{tr("حفظ كبطاقة مراجعة")}</button>
      {msg && <p role="status" className="text-xs" style={{ color: "var(--law-muted)" }}>{msg}</p>}
    </form>
  );
}
