import { PencilSimple } from "@phosphor-icons/react";
import Chip from "@/components/LawOS/kit/Chip";
import { tr } from "@/components/LawOS/lib/i18n";
import { flatten } from "../treeModel";

const Heading = ({ level, children }) => {
  const Tag = level <= 0 ? "h2" : level === 1 ? "h3" : "h4";
  const cls = level <= 0 ? "text-xl font-bold" : level === 1 ? "text-lg font-bold" : "text-base font-semibold";
  return <Tag className={cls}>{children}</Tag>;
};

/** Academic reader: the notes as one continuous document, headings by depth. */
export default function ReaderView({ nodes, onOpen }) {
  const flat = flatten(nodes);
  return (
    <article className="grid gap-4" aria-label={tr("قارئ أكاديمي")}>
      {flat.map((n) => (
        <section key={n.id} style={{ paddingInlineStart: `${Math.min(n.depth, 3) * 1}rem` }}>
          <div className="flex items-start justify-between gap-2">
            <Heading level={n.depth}><bdi>{n.title}</bdi></Heading>
            <button type="button" onClick={() => onOpen(n)} aria-label={tr("تعديل: {0}", [n.title])} className="shrink-0 p-1" style={{ color: "var(--law-muted)" }}><PencilSimple size={18} /></button>
          </div>
          {n.aiDraft && <Chip className="mt-1">{tr("صياغة الذكاء الاصطناعي")}</Chip>}
          {n.body.trim() ? n.body.split(/\n{2,}/).map((p, i) => <p key={i} dir="auto" className="mt-2 leading-8">{p}</p>) : <p className="mt-1 text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا نص بعد")}</p>}
        </section>
      ))}
    </article>
  );
}
