import { ArticleNum } from "../Bdi";
import { tr } from "@/components/LawOS/lib/i18n";

// Cloze syntax: [[hidden text]] in the front. Before reveal: a blank; after: the text, highlighted.
const CLOZE = /\[\[(.+?)\]\]/g;

function Cloze({ text, revealed }) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(CLOZE)) {
    parts.push(text.slice(last, m.index));
    parts.push(
      <mark
        key={m.index}
        className="rounded px-1"
        style={{
          background: "var(--law-surface-2)",
          color: revealed ? "var(--law-accent)" : "transparent",
        }}
      >
        {revealed ? m[1] : "………"}
      </mark>
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <p className="whitespace-pre-wrap text-xl leading-10">{parts}</p>;
}

/**
 * Renders a card. The back is always laid out and only made visible on reveal, so revealing never
 * shifts the layout (spec §10.3).
 */
export default function CardFace({ card, revealed }) {
  const ids = card.canonicalIds || [];
  return (
    <div className="flex flex-col gap-5">
      {card.type === "qualification" && (
        <span className="law-muted text-xs font-semibold">
          {tr("الوقائع: ما التكييف القانوني؟")}
        </span>
      )}
      {card.type === "cloze" ? (
        <Cloze text={card.front} revealed={revealed} />
      ) : (
        <p className="whitespace-pre-wrap text-xl leading-10">{card.front}</p>
      )}
      <div
        aria-hidden={!revealed}
        style={{
          visibility: revealed ? "visible" : "hidden",
          borderTop: "1px solid var(--law-border)",
        }}
        className="pt-5"
      >
        <p className="whitespace-pre-wrap text-lg leading-9">{card.back}</p>
        {ids.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {ids.map((id) => {
              const [code, num] = id.split(":");
              return (
                <span
                  key={id}
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: "var(--law-surface-2)" }}
                >
                  <bdi dir="ltr">{code}</bdi> <ArticleNum value={num} />
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
