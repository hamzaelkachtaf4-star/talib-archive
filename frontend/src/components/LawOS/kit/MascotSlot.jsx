/**
 * Empty-state block: a plain message with optional actions. Kept under its old name so callers do not change;
 * no illustration is drawn (academic tone).
 */
export default function MascotSlot({ moment = "empty", message, children, className = "", compact = false, as: Tag = "p" }) {
  return (
    <div className={`law-mascot-slot grid justify-items-start ${compact ? "gap-1 p-2" : "gap-3 p-6"} text-start ${className}`.trim()} data-moment={moment} data-compact={compact || undefined}>
      {message && <Tag className={compact ? "text-sm font-bold" : "text-lg font-bold"}>{message}</Tag>}
      {children}
    </div>
  );
}
