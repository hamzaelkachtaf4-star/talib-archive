import { useMemo } from "react";
import { codeTree } from "@/components/LawOS/lib/graphIndex";
import { colorOf } from "./shared";
import { tr } from "@/components/LawOS/lib/i18n";

/** Kelsen order: constitution above organic above ordinary law above regulations. */
const LEVEL_RANK = { CONSTITUTION: 0, ORGANIC: 1, FRAMEWORK: 2, ORDINARY: 3, REGULATORY: 4 };

/** Fast list tree for budget phones: code, then chapter, then article with its link counts. <details> keeps it light and accessible. */
export default function TreeView({ index, onPick }) {
  const tree = useMemo(() => codeTree(index).sort((a, b) => (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3) || a.code.localeCompare(b.code)), [index]);
  if (!tree.length) return <p className="law-muted text-sm">{tr("لا توجد نصوص مرتبطة بعد.")}</p>;
  return (
    <div className="flex flex-col gap-2">
      {tree.map((c) => (
        <details key={c.code} className="law-card p-3" open={tree.length === 1}>
          <summary className="cursor-pointer font-bold" style={{ minBlockSize: 44, display: "flex", alignItems: "center" }}>
            <span aria-hidden="true" className="me-2 inline-block size-3 rounded-full" style={{ background: colorOf({ type: "article", code: c.code }) }} />
            {c.titleAr} <bdi dir="ltr" className="law-muted ms-2 text-xs">{c.code}</bdi>
          </summary>
          {c.chapters.map((ch) => (
            <details key={ch.title} className="ms-3 mt-2" open={c.chapters.length === 1}>
              <summary className="cursor-pointer text-sm font-semibold" style={{ minBlockSize: 44, display: "flex", alignItems: "center" }}>{ch.title || tr("بدون تبويب")}</summary>
              <ul className="ms-2 flex flex-col">
                {ch.articles.map(({ node, outgoing, incoming }) => (
                  <li key={node.id}>
                    <button type="button" onClick={() => onPick(node.id)} className="flex w-full items-center justify-between gap-2 py-2 text-start text-sm" style={{ minBlockSize: 44, borderBottom: "1px solid var(--law-border)" }}>
                      <span>{node.label} <bdi dir="ltr" className="tabular-nums">{node.n}</bdi></span>
                      <span className="law-muted text-xs">
                        {tr("صادر")} <bdi dir="ltr">{outgoing}</bdi> · {tr("وارد")} <bdi dir="ltr">{incoming}</bdi>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </details>
      ))}
    </div>
  );
}
