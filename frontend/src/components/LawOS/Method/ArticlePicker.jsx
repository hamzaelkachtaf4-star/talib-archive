import { useEffect, useState } from "react";
import { X, Plus } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Input } from "../ui";
import { ArticleNum } from "../Bdi";
import { tr } from "@/components/LawOS/lib/i18n";

/**
 * Structural citations (spec §8.2): rules are inserted from the local corpus, never typed free text,
 * so every cited id resolves by construction.
 */
export default function ArticlePicker({ value = [], onChange, disabled }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(async () => {
      const r = await Law.searchCorpus({ q });
      if (r.ok) setResults(r.data.results.slice(0, 6));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {value.map((id) => {
          const [code, num] = id.split(":");
          return (
            <span
              key={id}
              className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: "var(--law-surface-2)" }}
            >
              <bdi dir="ltr">{code}</bdi> <ArticleNum value={num} />
              {!disabled && (
                <button
                  type="button"
                  aria-label={tr("حذف")}
                  onClick={() => onChange(value.filter((x) => x !== id))}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          );
        })}
      </div>
      {!disabled && (
        <>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("أضف نصا قانونيا: الفصل 77، أو كلمات")}
          />
          {results.map((r) => (
            <button
              key={r.canonicalId}
              type="button"
              disabled={value.includes(r.canonicalId)}
              onClick={() => {
                onChange([...value, r.canonicalId]);
                setQ("");
              }}
              className="law-card flex items-start gap-2 p-2 text-start text-xs disabled:opacity-40"
            >
              <Plus size={14} className="mt-1 shrink-0" />
              <span>
                <span className="font-bold">
                  {r.numberingLabel} <ArticleNum value={r.articleNumber} /> ·{" "}
                  {r.codeTitle}
                </span>
                <span className="law-muted line-clamp-2 block">
                  {r.snippet}
                </span>
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
