import { Link } from "react-router-dom";
import { ArticleNum } from "../Bdi";
import { tr } from "@/components/LawOS/lib/i18n";

/** A resolved citation: always links to the stored article (spec §1.4). */
export default function RefChip({ r }) {
  const [code, num] = r.canonicalId.split(":");
  return (
    <Link
      to={`/law/corpus/a/${encodeURIComponent(r.canonicalId)}`}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: "var(--law-surface-2)" }}
      title={r.quote || r.paraphrase || ""}
    >
      <bdi dir="ltr">{code}</bdi> <ArticleNum value={num} />
      {r.quoteMismatch && (
        <span className="law-muted">{tr("(إعادة صياغة)")}</span>
      )}
    </Link>
  );
}
