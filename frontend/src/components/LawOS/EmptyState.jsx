import MascotSlot from "@/components/LawOS/kit/MascotSlot";

/**
 * Empty state used by every list (written for a student, not a developer): the mascot with a title and an optional hint.
 * `Icon` is accepted for older callers and no longer drawn: the mascot is the illustration.
 */
export default function EmptyState({ title, children }) {
  return (
    <div className="rounded-2xl" style={{ background: "var(--law-surface)", border: "1px dashed var(--law-border)" }}>
      <MascotSlot moment="empty" message={title} as="h2">
        {children && <p className="max-w-sm text-sm leading-7" style={{ color: "var(--law-muted)" }}>{children}</p>}
      </MascotSlot>
    </div>
  );
}

export function PageTitle({ children, sub }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold">{children}</h1>
      {sub && (
        <p className="mt-1 text-sm" style={{ color: "var(--law-muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}
