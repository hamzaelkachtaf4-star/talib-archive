import { useRef } from "react";
import { Link } from "react-router-dom";
import { tr } from "@/components/LawOS/lib/i18n";
import Sheet from "@/components/LawOS/kit/Sheet";
import useFocusTrap from "@/components/LawOS/lib/useFocusTrap";
import { useMinWidth } from "@/hooks/useDeviceClass";
import NotificationList from "./NotificationList";

/**
 * Opens from the bell without leaving the page. From 640px up it is a popover anchored under the bell; below that a
 * bottom sheet. Both are real dialogs: focus goes in, Tab stays inside, Escape and an outside press close, focus returns to the bell.
 */
export default function NotificationPopover({ open, onClose, anchorRef, onUnread }) {
  const wide = useMinWidth(640);
  const ref = useRef(null);
  useFocusTrap(ref, open && wide, { onClose, returnRef: anchorRef, ignoreRef: anchorRef });
  if (!open) return null;

  const body = (
    <>
      <NotificationList limit={8} onUnread={onUnread} onNavigate={onClose} />
      <div className="p-3 text-center" style={{ borderTop: "1px solid var(--law-border)" }}>
        <Link to="/law/notifications" onClick={onClose} className="text-sm font-bold" style={{ color: "var(--law-primary)" }}>{tr("عرض الكل")}</Link>
      </div>
    </>
  );

  if (!wide) return <Sheet open onClose={onClose} title={tr("الإشعارات")}>{body}</Sheet>;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={tr("الإشعارات")}
      tabIndex={-1}
      className="absolute z-30 mt-1 max-h-[70vh] w-[22rem] overflow-y-auto rounded-xl shadow-lg"
      style={{ insetInlineEnd: 0, background: "var(--law-surface)", border: "1px solid var(--law-border)" }}
    >
      {body}
    </div>
  );
}
