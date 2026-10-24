import { tr } from "@/components/LawOS/lib/i18n";
import { nodeLabel } from "@/components/LawOS/lib/graphIndex";

// Colour coding comes from the app theme tokens only (light and dark both defined there):
// DOC green, penal red, concepts blue, confusion pairs orange, any other code gold.
export function colorOf(node) {
  if (!node) return "var(--law-muted)";
  if (node.type === "concept") return "var(--law-primary)";
  if (node.type === "pair") return "var(--law-warn)";
  if (node.code === "DOC") return "var(--law-ok)";
  if (node.code === "CP") return "var(--law-danger)";
  return "var(--law-gold-ink)";
}

export function kindLabel(node) {
  if (!node) return "";
  if (node.type === "concept") return tr("مفهوم");
  if (node.type === "pair") return tr("زوج خلط");
  if (node.code === "DOC") return tr("قانون الالتزامات والعقود");
  if (node.code === "CP") return tr("القانون الجنائي");
  return node.codeTitleAr || node.code;
}

export const RELATIONS = {
  references: tr("يحيل على"),
  applies: tr("يطبق"),
  interprets: tr("يفسر"),
  confirms: tr("يؤكد"),
  reverses: tr("يتراجع عن"),
  contradicts: tr("يعارض"),
  cites: tr("يستشهد بـ"),
  divergesFrom: tr("يخالف"),
};

export const edgeRelation = (e) =>
  e.k === "concept" ? tr("يستند إلى") : e.k === "pair" ? tr("يلتبس بـ") : RELATIONS[e.r] || RELATIONS.references;

/** A node's name with the article number isolated so it never reorders inside Arabic text. */
export function NodeName({ node }) {
  if (!node) return null;
  if (node.type === "article")
    return (
      <span>
        {node.label} <bdi dir="ltr" className="tabular-nums">{node.n}</bdi>{" "}
        <bdi dir="ltr" className="law-muted text-xs">{node.code}</bdi>
      </span>
    );
  return <span>{nodeLabel(node)}</span>;
}

export function Legend() {
  const items = [
    [{ type: "article", code: "DOC" }, tr("قانون الالتزامات والعقود")],
    [{ type: "article", code: "CP" }, tr("القانون الجنائي")],
    [{ type: "concept" }, tr("مفهوم")],
    [{ type: "pair" }, tr("زوج خلط")],
  ];
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={tr("دليل الألوان")}>
      {items.map(([n, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-full" style={{ background: colorOf(n) }} />
          {label}
        </li>
      ))}
    </ul>
  );
}
