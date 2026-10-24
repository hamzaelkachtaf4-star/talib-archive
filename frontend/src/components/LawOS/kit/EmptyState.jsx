import MascotSlot from "@/components/LawOS/kit/MascotSlot";

/** Branded empty state: the mascot (MascotSlot) with a title, an optional hint and an optional action. */
export default function EmptyState({ title, hint, action, pose }) {
  return (
    <MascotSlot moment={pose === "celebrating" ? "celebrate" : "empty"} message={title} as="h3">
      {hint && <p className="text-sm" style={{ color: "var(--law-muted)" }}>{hint}</p>}
      {action}
    </MascotSlot>
  );
}
