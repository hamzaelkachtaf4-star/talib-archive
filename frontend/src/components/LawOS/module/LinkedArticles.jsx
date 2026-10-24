import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "@phosphor-icons/react";
import Law from "@/models/law";
import { tr } from "@/components/LawOS/lib/i18n";

/** Legal texts the student linked to this module: the mentor and the exam center read them as part of the module's material. */
export default function LinkedArticles({ moduleId }) {
  const [items, setItems] = useState(null);
  const load = () => Law.moduleArticles(moduleId).then((r) => setItems(r.ok ? r.data.articles : []));
  useEffect(() => { load(); }, [moduleId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function unlink(id) { const r = await Law.unlinkArticle(moduleId, id); if (r.ok) load(); }
  return (
    <section className="law-card mt-4 grid gap-2 p-4" aria-label={tr("نصوص قانونية مرتبطة")}>
      <h3 className="font-bold">{tr("نصوص قانونية مرتبطة")}</h3>
      {items && items.length === 0 && <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("افتح فصلاً في «قوانين ومراجع» واضغط «اربط بمادة» ليقرأه المرشد مع ملاحظاتك.")} <Link to="/law/library" className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("قوانين ومراجع")}</Link></p>}
      <ul>{(items || []).map((a) => (
        <li key={a.canonicalId} className="flex items-center justify-between gap-2 py-1.5">
          <Link to={`/law/corpus/a/${encodeURIComponent(a.canonicalId)}`} className="min-w-0 truncate font-semibold no-underline"><bdi>{a.code.numberingLabel} <bdi dir="ltr">{a.number}</bdi> — {a.code.titleAr}</bdi></Link>
          <button type="button" onClick={() => unlink(a.canonicalId)} aria-label={tr("إلغاء الربط")} className="p-1" style={{ color: "var(--law-muted)" }}><X size={16} /></button>
        </li>
      ))}</ul>
    </section>
  );
}
