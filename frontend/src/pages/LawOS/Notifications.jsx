import { PageTitle } from "@/components/LawOS/EmptyState";
import { tr } from "@/components/LawOS/lib/i18n";
import NotificationList from "@/components/LawOS/notifications/NotificationList";

/** Full notification list ("عرض الكل" in the bell popover). */
export default function Notifications() {
  return (
    <>
      <PageTitle>{tr("الإشعارات")}</PageTitle>
      <div className="law-card overflow-hidden p-0"><NotificationList /></div>
    </>
  );
}
