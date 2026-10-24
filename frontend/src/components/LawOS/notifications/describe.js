import { tr } from "@/components/LawOS/lib/i18n";

export const GROUP_ORDER = ["requests", "squads", "reviews", "reminders", "friends", "other"];
export const GROUP_LABEL = () => ({
  requests: tr("طلبات الصداقة"),
  squads: tr("الفرق"),
  reviews: tr("مراجعة التعديلات"),
  reminders: tr("تذكيرات"),
  friends: tr("الأصدقاء"),
  other: tr("أخرى"),
});

const crLink = (p) => (p.changeRequestId ? `/law/community/hub/requests/${p.changeRequestId}` : "/law/community/hub/requests");

/** Maps a server notification to { group, text, to } for display. Unknown types fall back to a neutral line. */
export function describe(n) {
  const p = n.payload || {};
  const name = p.name || tr("زميل");
  switch (n.type) {
    case "FRIEND_REQUEST": return { group: "requests", text: tr("{0} أرسل لك طلب صداقة", [name]), to: "/law/community/friends" };
    case "FRIEND_ACCEPTED": return { group: "friends", text: tr("{0} قبل طلب الصداقة", [name]), to: "/law/community/friends" };
    case "FOLLOW_REQUEST": return { group: "requests", text: tr("{0} يريد متابعتك", [name]), to: p.userId ? `/law/u/${p.userId}` : "/law/community/friends" };
    case "NEW_FOLLOWER": return { group: "friends", text: tr("{0} بدأ بمتابعتك", [name]), to: p.userId ? `/law/u/${p.userId}` : "/law/community/friends" };
    case "FOLLOW_ACCEPTED": return { group: "friends", text: tr("{0} قبل طلب المتابعة", [name]), to: p.userId ? `/law/u/${p.userId}` : "/law/community/friends" };
    case "HUB_CHANGE_REQUEST": return { group: "reviews", text: tr("{0} اقترح تعديلاً على «{1}»", [p.from || tr("زميل"), p.title || ""]), to: crLink(p) };
    case "HUB_MERGED": return { group: "reviews", text: p.you ? tr("دمجتَ تعديلاً على «{0}»", [p.title || ""]) : tr("تم دمج تعديلك على «{0}»", [p.title || ""]), to: crLink(p) };
    case "HUB_CHANGE_REJECTED": return { group: "reviews", text: tr("رُفض تعديلك على «{0}»", [p.title || ""]), to: crLink(p) };
    case "HUB_REPORT_ACTION": return { group: "reviews", text: tr("اتُّخذ إجراء بشأن بلاغ على ملخص"), to: "/law/community/hub" };
    case "SQUAD_DOC_NEW": return { group: "squads", text: tr("{0} نشر «{1}» في فرقتك", [p.from || tr("زميل"), p.title || ""]), to: p.docId ? `/law/squad/docs/${p.docId}` : "/law/squad/docs" };
    case "SQUAD_CR_OPENED": return { group: "squads", text: tr("{0} اقترح تعديلاً على «{1}»", [p.from || tr("زميل"), p.title || ""]), to: p.changeRequestId ? `/law/squad/change-requests/${p.changeRequestId}` : "/law/squad/docs" };
    case "SQUAD_CR_MERGED": return { group: "squads", text: tr("تم دمج تعديلك على «{0}»", [p.title || ""]), to: p.docId ? `/law/squad/docs/${p.docId}` : "/law/squad/docs" };
    case "SQUAD_CR_REJECTED": return { group: "squads", text: tr("رُفض تعديلك على «{0}»", [p.title || ""]), to: p.changeRequestId ? `/law/squad/change-requests/${p.changeRequestId}` : "/law/squad/docs" };
    case "SQUAD_ROLE_CHANGED": return { group: "squads", text: tr("تغيّر دورك في الفرقة"), to: "/law/community/squads" };
    case "CAMPUS_REPLY": return { group: "friends", text: tr("ردّ أحدهم على موضوعك «{0}»", [p.title || ""]), to: p.postId ? `/law/community/campus/${p.postId}` : "/law/community/campus" };
    case "CAMPUS_POST_HIDDEN": return { group: "other", text: tr("أُخفي أحد منشوراتك بعد مراجعة بلاغ"), to: "/law/community/campus" };
    case "SESSION_REMINDER": return { group: "reminders", text: p.count > 1 ? tr("لديك {0} حصص غداً، أولها {1}", [p.count, p.first?.start || ""]) : p.first?.room ? tr("لديك حصة غداً: {0} — {1}", [p.first?.subject || "", p.first.room]) : tr("لديك حصة غداً: {0}", [p.first?.subject || ""]), to: "/law/timetable" };
    case "SESSION_SOON": return { group: "reminders", text: p.room ? tr("حصة قريبة: {0} — {1} ({2})", [p.subject || "", p.room, p.start || ""]) : tr("حصة قريبة: {0} ({1})", [p.subject || "", p.start || ""]), to: "/law/timetable" };
    case "BRAIN_REMINDER": return { group: "reminders", text: tr("حان وقت مراجعة نقطة ضعف"), to: "/law/exam/weak-spots" };
    case "AI_CORRECTION_VERIFIED": return { group: "other", text: tr("تم اعتماد تصحيحك لخطأ المساعد"), to: "/law/memory" };
    case "AI_CORRECTION_REJECTED": return { group: "other", text: tr("لم يُعتمد تصحيحك لخطأ المساعد"), to: "/law/memory" };
    default:
      if (String(n.type).startsWith("SQUAD")) return { group: "squads", text: tr("نشاط جديد في فرقتك"), to: "/law/community/squads" };
      return { group: "other", text: tr("إشعار جديد"), to: "/law/notifications" };
  }
}

export function groupNotifications(items) {
  const out = new Map();
  for (const n of items) {
    const d = describe(n);
    if (!out.has(d.group)) out.set(d.group, []);
    out.get(d.group).push({ ...n, view: d });
  }
  return GROUP_ORDER.filter((g) => out.has(g)).map((g) => ({ group: g, items: out.get(g) }));
}

export const whenFmt = (iso) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(new Date(iso));
