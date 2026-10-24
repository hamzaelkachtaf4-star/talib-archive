import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { loadGraph } from "@/components/LawOS/lib/pathSync";
import Button3D from "@/components/LawOS/kit/Button3D";
import { BRAND } from "@/config/brand";
import { tr } from "@/components/LawOS/lib/i18n";

/** Print-friendly module outline: the browser shapes Arabic correctly, so "Save as PDF" is the PDF export. */
export default function PathPrint() {
  const { id } = useParams();
  const [g, setG] = useState(null);
  useEffect(() => { loadGraph(id).then((r) => setG(r.data)); }, [id]);
  if (!g) return null;
  const sections = [...new Set(g.nodes.map((n) => n.section))];
  return (
    <article className="mx-auto max-w-2xl" style={{ background: "#fff", color: "#111", padding: "1rem" }}>
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 18mm; } }`}</style>
      <div className="no-print mb-4"><Button3D onClick={() => window.print()}>{tr("طباعة / حفظ PDF")}</Button3D></div>
      <h1 className="text-3xl font-extrabold">{BRAND.name.ar}</h1>
      <h2 className="mb-6 text-2xl font-bold"><bdi>{g.module.title}</bdi> · {g.module.semester}</h2>
      {sections.map((s) => (
        <section key={s} className="mb-5" style={{ breakInside: "avoid" }}>
          <h3 className="mb-2 text-xl font-bold">{tr(s)}</h3>
          <ul className="grid gap-1">{g.nodes.filter((n) => n.section === s).map((n) => <li key={n.id}>{n.state === "COMPLETED" ? "☑" : "☐"} {tr(n.title)} {n.legalRefs.map((r) => <bdi key={r.canonicalId} dir="ltr"> [{r.canonicalId}]</bdi>)}</li>)}</ul>
        </section>
      ))}
      <p className="mt-6 text-xs">{tr("النص المرجعي هو المنشور في الجريدة الرسمية.")}</p>
    </article>
  );
}
