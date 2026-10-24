import { BookOpen, Barbell, Compass, Gavel, Scales } from "@phosphor-icons/react";
import { masteryState } from "@/components/LawOS/lib/mastery";
import { tr } from "@/components/LawOS/lib/i18n";
import { groupNodes } from "@/components/LawOS/lib/pathGroups";

// DB kinds (BOSS, CHECKPOINT) are stable identifiers; only the words shown to students are academic.
export const KIND_ICON = { LESSON: BookOpen, PRACTICE: Barbell, METHOD: Compass, CHECKPOINT: Gavel, BOSS: Scales };
export const kindLabel = () => ({ LESSON: tr("درس"), PRACTICE: tr("مراجعة"), METHOD: tr("منهجية"), CHECKPOINT: tr("محطة تقييمية"), BOSS: tr("محاكاة الامتحان النهائي") });
// Scaffold titles written before rc2 live in the DB; show them with the academic wording (no data migration).
const LEGACY_TITLES = { "محطة الأساسيات": "تقييم الأساسيات", "محطة التطبيق": "تقييم التطبيق", "الاختبار النهائي للمادة": "محاكاة الامتحان النهائي للمادة" };
export const nodeTitle = (t) => tr(LEGACY_TITLES[t] || t);
const STATE = () => ({ LOCKED: tr("مقفل"), AVAILABLE: tr("متاح"), IN_PROGRESS: tr("قيد الإنجاز"), COMPLETED: tr("منجز") });

function Level({ group, currentNodeId, onSelect }) {
  const kinds = kindLabel();
  const states = STATE();
  return (
    <div className="law-level" role="group" aria-label={tr(group.label)}>
      <div className="law-level-head" data-depth={group.depth}>
        <span><bdi>{tr(group.label)}</bdi></span>
        <span className="law-frac" aria-label={tr("{0} من {1}", [group.done, group.total])}><bdi dir="ltr">{group.done}/{group.total}</bdi></span>
      </div>
      <div className="law-bar" aria-hidden="true"><span style={{ inlineSize: `${group.total ? (100 * group.done) / group.total : 0}%` }} /></div>
      {group.nodes.map(({ node: n, index }) => {
        const Icon = KIND_ICON[n.kind] || BookOpen;
        const locked = n.state === "LOCKED";
        return (
          <button key={n.id} type="button" className="law-node" aria-disabled={locked || undefined} data-current={n.id === currentNodeId || undefined}
            onClick={() => onSelect(n)} aria-label={`${nodeTitle(n.title)} — ${states[n.state]}`}>
            <span className="law-seal" data-state={n.state}><span><bdi dir="ltr">{index}</bdi></span></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium"><bdi>{nodeTitle(n.title)}</bdi></span>
              <span className="flex items-center gap-1 text-xs" style={{ color: "var(--law-muted)" }}><Icon size={14} />{kinds[n.kind]}{n.weak && <> · <span style={{ color: "var(--law-danger)" }}>{tr("نقطة ضعف")}</span></>}</span>
            </span>
          </button>
        );
      })}
      {group.children.map((c) => <Level key={c.label} group={c} currentNodeId={currentNodeId} onSelect={onSelect} />)}
    </div>
  );
}

/** Seal-node roadmap: a vertical rail of headings (any depth) with a progress fraction per level; gold fills only when mastered. */
export default function PathNodes({ nodes, currentNodeId, onSelect }) {
  const root = groupNodes(nodes);
  return (
    <div className="law-rail mx-auto w-full max-w-xl">
      {root.nodes.length > 0 && <div className="law-level">{root.nodes.map(({ node: n, index }) => (
        <button key={n.id} type="button" className="law-node" onClick={() => onSelect(n)} data-current={n.id === currentNodeId || undefined}>
          <span className="law-seal" data-state={n.state}><span><bdi dir="ltr">{index}</bdi></span></span><span><bdi>{nodeTitle(n.title)}</bdi></span>
        </button>))}</div>}
      {root.children.map((g) => <Level key={g.label} group={g} currentNodeId={currentNodeId} onSelect={onSelect} />)}
    </div>
  );
}

const label = () => ({ mastered: tr("مُتقن"), in_review: tr("قيد المراجعة"), due_today: tr("يستحق المراجعة اليوم") });

/** Academic mastery state of a module: «مُتقن» / «قيد المراجعة» / «يستحق المراجعة اليوم» (text, no game marks). */
export function Crowns({ n, due = 0 }) {
  const state = masteryState({ crowns: n, dueCount: due });
  return <span className="law-frac" data-mastery={state}>{label()[state]}</span>;
}
