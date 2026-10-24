import { SealCheck, GitFork, HandsClapping, Globe, UsersThree, LockSimple } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";

export const VISIBILITY = {
  private: { label: tr("خاص (أنا فقط)"), Icon: LockSimple },
  squad: { label: tr("الفرقة"), Icon: UsersThree },
  public: { label: tr("عام (منصة الكلية)"), Icon: Globe },
};

/** "موثق من الفوج" (5+ endorsements), endorsement and fork counts, and visibility. */
export default function NoteBadges({ note, showVisibility = false }) {
  const V = VISIBILITY[note.visibility];
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      {note.verified && (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold" style={{ background: "var(--law-accent)", color: "var(--law-on-primary)" }}>
          <SealCheck size={14} weight="fill" /> {tr("موثق من الفوج")}
        </span>
      )}
      {note.endorsementCount > 0 && (
        <span className="inline-flex items-center gap-1" style={{ color: "var(--law-muted)" }} title={tr("التوثيق")}>
          <HandsClapping size={14} /> <bdi dir="ltr">{note.endorsementCount}</bdi>
        </span>
      )}
      {note.forkCount > 0 && (
        <span className="inline-flex items-center gap-1" style={{ color: "var(--law-muted)" }} title={tr("نسخ الفرق")}>
          <GitFork size={14} /> <bdi dir="ltr">{note.forkCount}</bdi>
        </span>
      )}
      {showVisibility && V && (
        <span className="inline-flex items-center gap-1" style={{ color: "var(--law-muted)" }}>
          <V.Icon size={14} /> {V.label}
        </span>
      )}
    </span>
  );
}

/** "مقتبسة ومطورة عن تلخيص الطالب …" */
export function ForkAttribution({ name }) {
  if (!name) return null;
  return (
    <p className="mb-3 flex items-center gap-2 text-sm" style={{ color: "var(--law-muted)" }}>
      <GitFork size={16} />
      <span>
        {tr("مقتبسة ومطورة عن تلخيص الطالب")} <bdi className="font-semibold">{name}</bdi>
      </span>
    </p>
  );
}
