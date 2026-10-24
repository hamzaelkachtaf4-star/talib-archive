import { useEffect, useState } from "react";
import { BellRinging } from "@phosphor-icons/react";
import Law from "@/models/law";
import Toggle from "@/components/LawOS/kit/Toggle";
import { Notice, Select } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

/** When to be reminded about classes: the evening before, and optionally N minutes ahead. Saved as soon as it changes. */
export default function ReminderSettings() {
  const [prefs, setPrefs] = useState(null);
  const [options, setOptions] = useState([15, 30, 60, 120]);
  const [msg, setMsg] = useState(null);
  useEffect(() => { Law.timetableReminders().then((r) => { if (r.ok) { setPrefs(r.data.prefs); setOptions(r.data.minutesOptions); } else setMsg(tr("يحتاج اتصالا بالخادم.")); }); }, []);
  async function change(patch) {
    const before = prefs;
    setPrefs({ ...prefs, ...patch });
    const r = await Law.saveTimetableReminders(patch);
    if (r.ok) { setPrefs(r.data.prefs); setMsg(null); } else { setPrefs(before); setMsg(tr("تعذر الحفظ. يلزم الاتصال.")); }
  }
  if (!prefs) return msg ? <Notice tone="warn">{msg}</Notice> : null;
  const row = "flex items-center justify-between gap-3 py-2";
  return (
    <section className="law-card mt-6 p-4" aria-label={tr("التذكيرات")}>
      <h2 className="mb-1 flex items-center gap-2 font-bold"><BellRinging size={20} style={{ color: "var(--law-primary)" }} aria-hidden="true" />{tr("تذكيرات الحصص")}</h2>
      {msg && <Notice tone="warn">{msg}</Notice>}
      <div className={row}><span>{tr("تذكيرات الحصص")}</span><Toggle label={tr("تفعيل تذكيرات الحصص")} checked={prefs.enabled} onChange={(v) => change({ enabled: v })} /></div>
      <div className={row} style={{ opacity: prefs.enabled ? 1 : 0.5 }}>
        <span>{tr("تذكير مساء اليوم السابق")}</span>
        <span className="flex items-center gap-3">
          {prefs.eveningBefore && <input type="time" dir="ltr" value={prefs.eveningTime || "20:00"} onChange={(e) => e.target.value && change({ eveningTime: e.target.value })} aria-label={tr("وقت تذكير المساء")} className="law-input" style={{ inlineSize: "auto" }} />}
          <Toggle label={tr("تذكير مساء اليوم السابق")} checked={prefs.eveningBefore} onChange={(v) => change({ eveningBefore: v })} />
        </span>
      </div>
      <div className={row} style={{ opacity: prefs.enabled ? 1 : 0.5 }}>
        <span>{tr("قبل الحصة بـ")}</span>
        <Select value={prefs.minutesBefore ?? ""} onChange={(e) => change({ minutesBefore: e.target.value === "" ? null : Number(e.target.value) })} aria-label={tr("قبل الحصة بـ")}
          options={[["", tr("بدون")], ...options.map((m) => [m, tr("{0} دقيقة", [m])])]} />
      </div>
    </section>
  );
}
