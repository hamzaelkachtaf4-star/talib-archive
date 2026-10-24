import { useEffect, useState } from "react";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice, Textarea } from "@/components/LawOS/ui";
import { useIsAdmin } from "@/components/LawOS/lib/useLawUser";
import { tr } from "@/components/LawOS/lib/i18n";

const refsToText = (r) => r.map((x) => `${x.slug}:${x.number}`).join(", ");
const textToRefs = (t) => t.split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [slug, number] = x.split(":"); return { slug, number }; });

/** Admin: link concepts to corpus articles (refs must exist) and review contrast tables of confusion pairs. */
export default function AdminConcepts() {
  const isAdmin = useIsAdmin();
  const [t, setT] = useState(null);
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState(null);
  const load = () => Law.adminConcepts().then((r) => r.ok && setT(r.data));
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);
  if (!isAdmin || !t) return null;
  const saveConcept = async (c) => {
    const refs = textToRefs(draft[`c${c.id}`] ?? refsToText(c.legalRefs));
    const r = await Law.adminConceptUpdate(c.id, { legalRefs: refs, reviewed: refs.length > 0 });
    setMsg(r.ok ? tr("تم الحفظ.") : r.data?.error?.code === "unknown_article" ? tr("مادة غير موجودة في النصوص المستوردة.") : tr("قيمة غير صالحة."));
    load();
  };
  const savePair = async (p) => {
    const r = await Law.adminPairUpdate(p.id, { contrastMd: draft[`p${p.id}`] ?? p.contrastMd ?? "", reviewed: true });
    setMsg(r.ok ? tr("تم الحفظ.") : tr("قيمة غير صالحة."));
    load();
  };
  return (
    <>
      <PageTitle sub={tr("المفاهيم وأزواج الخلط")}>{tr("تصنيف المفاهيم")}</PageTitle>
      {msg && <Notice tone="muted">{msg}</Notice>}
      <h2 className="mb-2 font-bold">{tr("المفاهيم")}</h2>
      <ul className="mb-6 grid gap-2">{t.concepts.map((c) => (
        <li key={c.id} className="law-card3d grid gap-2 text-sm">
          <p className="font-bold"><bdi>{c.titleAr}</bdi> <span className="law-chip">{c.reviewed ? tr("مراجَع") : tr("غير مراجَع")}</span></p>
          <input className="law-input" dir="ltr" placeholder="DOC:77, CP:3" value={draft[`c${c.id}`] ?? refsToText(c.legalRefs)} onChange={(e) => setDraft({ ...draft, [`c${c.id}`]: e.target.value })} aria-label={tr("المراجع")} />
          <Button3D variant="neutral" onClick={() => saveConcept(c)}>{tr("حفظ")}</Button3D>
        </li>))}</ul>
      <h2 className="mb-2 font-bold">{tr("أزواج الخلط")}</h2>
      <ul className="grid gap-2">{t.pairs.map((p) => (
        <li key={p.id} className="law-card3d grid gap-2 text-sm">
          <p className="font-bold"><bdi>{p.labelAr}</bdi> <span className="law-chip">{p.reviewed ? tr("مراجَع") : tr("غير مراجَع")}</span></p>
          <Textarea rows={4} dir="auto" value={draft[`p${p.id}`] ?? p.contrastMd ?? ""} onChange={(e) => setDraft({ ...draft, [`p${p.id}`]: e.target.value })} placeholder="| معيار | أ | ب |" aria-label={tr("جدول المقارنة")} />
          <Button3D variant="neutral" onClick={() => savePair(p)}>{tr("اعتماد")}</Button3D>
        </li>))}</ul>
    </>
  );
}
