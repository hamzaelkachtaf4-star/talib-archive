import { useEffect, useState } from "react";
import Law from "@/models/law";
import Toggle from "@/components/LawOS/kit/Toggle";
import { tr } from "@/components/LawOS/lib/i18n";

function Line({ label, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: "1px solid var(--law-border)" }}>
      <span className="grid gap-0.5 text-start"><span>{label}</span>{hint && <span className="text-xs" style={{ color: "var(--law-muted)" }}>{hint}</span>}</span>
      {children}
    </div>
  );
}

/** Privacy flags (profile) — optimistic toggles that roll back when the server refuses. */
export function PrivacySettings() {
  const [p, setP] = useState(null);
  useEffect(() => { Law.myProfile().then((r) => r.ok && setP(r.data.profile)); }, []);
  if (!p) return <p className="law-muted py-3 text-sm">…</p>;
  const set = async (key, value) => {
    setP({ ...p, [key]: value });
    const r = await Law.updateMyProfile({ [key]: value });
    setP(r.ok ? r.data.profile : p);
  };
  return (
    <>
      <Line label={tr("حساب خاص")} hint={tr("طلبات المتابعة تحتاج موافقتك.")}><Toggle label={tr("حساب خاص")} checked={p.isPrivate} onChange={(v) => set("isPrivate", v)} /></Line>
      <Line label={tr("يمكن العثور عليّ")} hint={tr("الظهور في البحث والاقتراحات.")}><Toggle label={tr("يمكن العثور عليّ")} checked={p.discoverable} onChange={(v) => set("discoverable", v)} /></Line>
    </>
  );
}

/** Three notification categories + daily reminder time (HH:mm, Africa/Casablanca). */
export function NotificationSettings() {
  const [pr, setPr] = useState(null);
  useEffect(() => { Law.myPreferences().then((r) => r.ok && setPr(r.data.preferences)); }, []);
  if (!pr) return <p className="law-muted py-3 text-sm">…</p>;
  const set = async (patch) => {
    setPr({ ...pr, ...patch });
    const r = await Law.updatePreferences(patch);
    setPr(r.ok ? r.data.preferences : pr);
  };
  return (
    <>
      <Line label={tr("نشاط الأصدقاء")} hint={tr("طلبات الصداقة والمتابعة وقبولها.")}><Toggle label={tr("نشاط الأصدقاء")} checked={pr.notifyFriends} onChange={(v) => set({ notifyFriends: v })} /></Line>
      <Line label={tr("منصة الكلية")} hint={tr("طلبات تعديل ملخصاتك العامة ونتائجها.")}><Toggle label={tr("منصة الكلية")} checked={pr.notifyHub} onChange={(v) => set({ notifyHub: v })} /></Line>
      <Line label={tr("الملتقى والمجموعات")} hint={tr("الردود على منشوراتك ووثائق فرقتك الجديدة.")}><Toggle label={tr("الملتقى والمجموعات")} checked={pr.notifyForum} onChange={(v) => set({ notifyForum: v })} /></Line>
      <Line label={tr("تذكير المراجعة")} hint={tr("تذكير المراجعة اليومي وقرب موعد الحصص.")}><Toggle label={tr("تذكير المراجعة")} checked={pr.notifyReminders} onChange={(v) => set({ notifyReminders: v })} /></Line>
      <p className="py-2 text-xs" style={{ color: "var(--law-muted)" }}>{tr("إشعارات الإشراف وتصحيحات المساعد تصلك دائماً.")}</p>
      <Line label={tr("وقت التذكير")}>
        <input type="time" className="law-input" style={{ inlineSize: "8rem" }} value={pr.reminderTime || ""} disabled={!pr.notifyReminders}
          onChange={(e) => set({ reminderTime: e.target.value || null })} aria-label={tr("وقت التذكير")} />
      </Line>
    </>
  );
}
