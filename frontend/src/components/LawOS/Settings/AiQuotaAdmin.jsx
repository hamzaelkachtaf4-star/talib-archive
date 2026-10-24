import { useEffect, useState } from "react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Field, Input } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

/** Admin: daily legal-chat limit (global), per-student override, today's heaviest users. */
export default function AiQuotaAdmin() {
  const [limit, setLimit] = useState("");
  const [top, setTop] = useState([]);
  const [uid, setUid] = useState("");
  const [ulimit, setUlimit] = useState("");
  const [msg, setMsg] = useState(null);
  const load = () => Law.adminQuota().then((r) => { if (r.ok) { setLimit(String(r.data.limit)); setTop(r.data.top); } });
  useEffect(() => { load(); }, []);
  const saveGlobal = async () => { if (limit.trim() === "") return setMsg(tr("قيمة غير صالحة.")); const r = await Law.setAdminQuota(Number(limit)); setMsg(r.ok ? tr("تم الحفظ.") : tr("قيمة غير صالحة.")); load(); };
  const saveUser = async (clear) => { const r = await Law.setUserAiLimit(Number(uid), clear ? null : Number(ulimit)); setMsg(r.ok ? tr("تم الحفظ.") : r.status === 404 ? tr("المستخدم غير موجود.") : tr("قيمة غير صالحة.")); load(); };
  return (
    <div className="grid gap-3 py-3">
      <Field label={tr("الحد اليومي للاستشارات (لكل طالب)")}>
        <div className="flex gap-2"><Input type="number" min="0" max="1000" dir="ltr" value={limit} onChange={(e) => setLimit(e.target.value)} /><Button3D onClick={saveGlobal}>{tr("حفظ")}</Button3D></div>
      </Field>
      <Field label={tr("استثناء لطالب (رقم المستخدم / الحد)")}>
        <div className="flex flex-wrap gap-2"><Input type="number" dir="ltr" placeholder="id" value={uid} onChange={(e) => setUid(e.target.value)} /><Input type="number" min="0" max="1000" dir="ltr" value={ulimit} onChange={(e) => setUlimit(e.target.value)} /><Button3D variant="neutral" onClick={() => saveUser(false)} disabled={!uid || ulimit === ""}>{tr("حفظ")}</Button3D><Button3D variant="neutral" onClick={() => saveUser(true)} disabled={!uid}>{tr("إزالة الاستثناء")}</Button3D></div>
      </Field>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <table className="w-full text-sm"><caption className="mb-1 text-start font-bold">{tr("الأكثر استعمالا اليوم")}</caption>
        <tbody>{top.map((t) => <tr key={t.userId}><td><bdi dir="auto">{t.name || t.email || t.userId}</bdi></td><td><bdi dir="ltr">#{t.userId}</bdi></td><td className="text-end"><bdi dir="ltr">{t.count}</bdi></td></tr>)}</tbody></table>
    </div>
  );
}
