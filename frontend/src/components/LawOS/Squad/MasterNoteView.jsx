import { useMemo, useState } from "react";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { BookBookmark, FileText, Warning, ListBullets } from "@phosphor-icons/react";
import Avatar, { AvatarStack } from "./Avatar";
import NoteBadges, { ForkAttribution } from "./NoteBadges";
import { tr } from "@/components/LawOS/lib/i18n";
import { createMarkdown } from "@/components/LawOS/lib/mdPolicy";
import { useLawUser } from "@/components/LawOS/lib/useLawUser";

// One colour per contributor (the viewer is always emerald). Never colour alone: the author avatar stays on every section.
const PALETTE = ["rgb(16 185 129)", "rgb(168 85 247)", "rgb(249 115 22)", "rgb(6 182 212)", "rgb(59 130 246)", "rgb(236 72 153)", "rgb(234 179 8)", "rgb(100 116 139)"];
const keyOf = (p, i) => (p?.userId == null ? `anon-${i}` : String(p.userId));

/** Colour for each contributor, in a stable order: the viewer first (emerald), then the others as they appear. */
export function contributorColors(note, viewerId) {
  const ids = [];
  if (viewerId != null) ids.push(String(viewerId));
  (note.contributors || []).forEach((c, i) => { const k = keyOf(c, i); if (!ids.includes(k)) ids.push(k); });
  (note.sections || []).forEach((s) => { const k = keyOf(s.author, -1); if (s.author?.userId != null && !ids.includes(k)) ids.push(k); });
  return new Map(ids.map((k, i) => [k, PALETTE[i % PALETTE.length]]));
}

// Raw HTML is never rendered: markdown-it with html disabled, then DOMPurify as a second fence.
const md = createMarkdown(MarkdownIt);

/** Markdown → safe HTML, with [^pin-N] turned into pin buttons. */
function renderBody(text) {
  const html = DOMPurify.sanitize(md.render(text || ""), { ADD_ATTR: ["target"] });
  return html.replace(
    /\[\^(pin-\d{1,3})\]/g,
    (_m, id) => `<button type="button" class="law-pin" data-pin="${id}">${id.replace("pin-", "")}</button>`
  );
}


// Moroccan plan typography: each level indented and sized by its role, not only by its Markdown level.
const HEADING_STYLE = {
  part: "text-xl font-extrabold",
  chapter: "text-lg font-bold",
  section: "text-lg font-bold",
  subsection: "text-base font-bold",
  paragraph: "text-sm font-bold",
  intro: "text-lg font-bold",
  conclusion: "text-lg font-bold",
  other: "text-base font-bold",
};

function Outline({ plan }) {
  if (!plan?.length) return null;
  const walk = (nodes, depth) =>
    nodes.map((n, i) => (
      <li key={`${depth}-${i}`}>
        <span style={{ paddingInlineStart: depth * 14 }} className="block py-0.5">
          <bdi>{n.heading}</bdi>
        </span>
        {n.children?.length > 0 && <ul>{walk(n.children, depth + 1)}</ul>}
      </li>
    ));
  return (
    <details className="mb-4 rounded-2xl p-3 text-sm" style={{ background: "var(--law-surface-2)" }} open>
      <summary className="flex cursor-pointer items-center gap-2 font-bold">
        <ListBullets size={18} /> {tr("التصميم")}
      </summary>
      <ul className="mt-2">{walk(plan, 0)}</ul>
    </details>
  );
}

function PinChip({ pin, active, onClick }) {
  const Icon = pin.type === "ref" ? BookBookmark : FileText;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2 rounded-xl p-2 text-start text-sm"
      style={{
        background: active ? "var(--law-surface-2)" : "transparent",
        border: `1px solid ${pin.resolved ? "var(--law-border)" : "var(--law-warn)"}`,
      }}
    >
      <span className="law-pin mt-0.5">{pin.id.replace("pin-", "")}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-semibold">
          <Icon size={14} />
          <bdi dir={pin.type === "ref" ? "ltr" : "auto"}>{pin.label || pin.ref}</bdi>
          {!pin.resolved && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--law-warn)" }}>
              <Warning size={12} /> {tr("غير موجود في النصوص المحفوظة")}
            </span>
          )}
        </span>
        {active && pin.preview && (
          <span className="mt-1 block text-xs leading-6" style={{ color: "var(--law-muted)" }}>
            <bdi>{pin.preview}…</bdi>
          </span>
        )}
        {active && pin.type === "document" && pin.label && (
          <span className="mt-1 block text-xs" style={{ color: "var(--law-muted)" }}>
            <bdi>{pin.ref}</bdi>
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The squad's master lecture note: the plan, each section with its author badge ("Law Blame"), and source pins
 * (article previews from the local corpus; unresolved articles flagged).
 */
export default function MasterNoteView({ note, showVisibility = false }) {
  const [activePin, setActivePin] = useState(null);
  const [colors, setColors] = useState(true);
  const me = useLawUser();
  const palette = useMemo(() => contributorColors(note, me?.id), [note, me?.id]);
  const colorOf = (p) => (p?.userId == null ? null : palette.get(String(p.userId)) || null);
  const sections = useMemo(
    () => (note.sections || []).map((s) => ({ ...s, html: renderBody(s.body) })),
    [note.sections]
  );

  function onClick(e) {
    const id = e.target?.dataset?.pin;
    if (!id) return;
    setActivePin(id);
    document.getElementById(`law-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Anonymous squad-mates on public notes come back with userId null.
  const label = (p) => (p?.userId === null ? tr("عضو في الفرقة") : p?.name);
  return (
    <article>
      <ForkAttribution name={note.forkedFromAuthorName} />
      <div className="mb-2">
        <NoteBadges note={note} showVisibility={showVisibility} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--law-muted)" }}>
        <span>{tr("المساهمون:")}</span>
        <AvatarStack people={(note.contributors || []).map((c) => ({ ...c, name: label(c) }))} />
        {(note.contributors || []).map((c, i) => (
          <span key={c.userId ?? `anon-${i}`}>
            <bdi>{label(c)}</bdi> <bdi dir="ltr">{c.percent}%</bdi>
          </span>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl p-3 text-xs" style={{ background: "var(--law-surface-2)" }}>
        <button type="button" role="switch" aria-checked={colors} onClick={() => setColors((c) => !c)} className="law-btn3d text-xs" data-variant={colors ? undefined : "neutral"}>
          {tr("الألوان")}
        </button>
        {colors && (note.contributors || []).map((c, i) => (
          <span key={keyOf(c, i)} className="inline-flex items-center gap-1.5 whitespace-nowrap font-bold">
            <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: colorOf(c) || PALETTE[PALETTE.length - 1] }} />
            <bdi>{me?.id != null && c.userId === me.id ? tr("أنت") : label(c)}</bdi>
          </span>
        ))}
      </div>
      <Outline plan={note.planJson} />
      {note.danglingPins?.length > 0 && (
        <p className="mb-3 text-xs" style={{ color: "var(--law-warn)" }}>
          {tr("إحالات بدون مرجع:")} <bdi dir="ltr">{note.danglingPins.join(", ")}</bdi>
        </p>
      )}
      <div onClick={onClick} className="law-master-note flex flex-col gap-4">
        {sections.map((s) => (
          <section key={s.key} className="relative rounded-2xl p-3" style={colors && colorOf(s.author) ? { background: `color-mix(in srgb, ${colorOf(s.author)} 12%, var(--law-surface))`, borderInlineStart: `4px solid ${colorOf(s.author)}` } : { background: "var(--law-surface)" }}>
            <div className="mb-1 flex items-start justify-between gap-3">
              {s.level ? (
                <h3 className={HEADING_STYLE[s.kind] || HEADING_STYLE.other} style={{ paddingInlineStart: Math.max(0, s.level - 1) * 8 }}>
                  <bdi>{s.heading}</bdi>
                </h3>
              ) : (
                <span />
              )}
              <span className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: "var(--law-muted)" }} title={tr("آخر من عدّل هذا الجزء")}>
                <Avatar person={{ ...s.author, name: label(s.author) }} size={22} />
              </span>
            </div>
            <div className="law-md text-sm leading-8" dangerouslySetInnerHTML={{ __html: s.html }} />
          </section>
        ))}
      </div>
      {note.sourcePins?.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-bold">{tr("المراجع")}</h3>
          <div className="flex flex-col gap-2">
            {note.sourcePins.map((p) => (
              <div key={p.id} id={`law-${p.id}`}>
                <PinChip pin={p} active={activePin === p.id} onClick={() => setActivePin(activePin === p.id ? null : p.id)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
