import { SunHorizon, MapTrifold, Exam, Books, UsersThree, CalendarBlank, Bank } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";

// Single source for the sidebar (>=1024px) and the bottom bar (<1024px). Talib v3: five hubs, in this order.
// `match` lists the path prefixes that keep a hub highlighted (deep routes such as /law/subjects/:id); `exclude`
// carves a sub-route out of a hub that would otherwise contain it (squads live under /law/community).
// The study path (S1-S6) is not a hub: it is the accordion at the bottom of the sidebar (PATH_HUB).
export const NAV_HUBS = [
  { id: "community", to: "/law/community", label: tr("ملتقى الكلية"), short: tr("الملتقى"), Icon: Bank, match: ["/law/community"], exclude: ["/law/community/squads"] },
  { id: "today", to: "/law/today", label: tr("تعلم"), short: tr("تعلم"), Icon: SunHorizon, match: ["/law/today", "/law/path", "/law/subjects", "/law/method", "/law/timetable", "/law/recap", "/law/notifications", "/law/capture"] },
  { id: "squads", to: "/law/community/squads", label: tr("مجموعات القراءة"), short: tr("المجموعات"), Icon: UsersThree, match: ["/law/community/squads", "/law/squad"] },
  { id: "exam", to: "/law/exam", label: tr("امتحان"), short: tr("امتحان"), Icon: Exam, match: ["/law/exam", "/law/review"] },
  { id: "library", to: "/law/library", label: tr("خزانة القوانين المحينة"), short: tr("القوانين"), Icon: Books, match: ["/law/library", "/law/corpus", "/law/legal"] },
];

// The study path, shown as the sidebar accordion (S1-S6 modules) and reachable from Learn.
export const PATH_HUB = { id: "path", to: "/law/path", label: tr("المسار الدراسي"), short: tr("المسار"), Icon: MapTrifold, match: ["/law/path", "/law/subjects", "/law/method"] };

// Reachable from the account menu; not hubs of their own.
export const SECONDARY_LINKS = [
  { id: "timetable", to: "/law/timetable", label: tr("استعمال الزمن"), Icon: CalendarBlank },
  { id: "community", to: "/law/community", label: tr("المجتمع"), Icon: UsersThree },
];

// The bottom bar carries all five hubs (icon + short label); profile and settings live in the header avatar menu.
export const MOBILE_BAR_IDS = NAV_HUBS.map((h) => h.id);

const under = (pathname, p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/");
export const isHubActive = (hub, pathname) => hub.match.some((p) => under(pathname, p)) && !(hub.exclude || []).some((p) => under(pathname, p));
