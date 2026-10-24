import { useEffect, useState } from "react";
import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Textarea } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

async function api(path, method = "GET", body) {
  const res = await fetch(`${API_BASE}/law/admin/timetable${path}`, { method, headers: { ...baseHeaders(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, data: await res.json().catch(() => null) };
}

/** Admin: fetch the official PDFs, import a CSV, review the diff, publish. Students only see published sessions. */
export default function TimetableAdmin() {
  const [sources, setSources] = useState([]);
  const [staging, setStaging] = useState(null);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState(null);
  const load = () => api("/sources").then((r) => r.ok && setSources(r.data.sources));
  useEffect(() => { load(); }, []);
  const review = async (id) => { const r = await api(`/staging/${id}`); if (r.ok) setStaging(r.data); };
  const fetchNow = async () => { setMsg("…"); const r = await api("/fetch", "POST", { season: "AUTOMNE" }); setMsg(r.ok ? tr("اكتمل الجلب: {0} ملف", [r.data.results.length]) : tr("فشل الجلب.")); load(); };
  const importCsv = async () => { const r = await api("/import-csv", "POST", { season: "AUTOMNE", csv }); setMsg(r.ok ? tr("تم الاستيراد.") : tr("ملف غير صالح: {0}", [JSON.stringify(r.data?.details || r.data?.error)])); if (r.ok) { setCsv(""); load(); } };
  const publish = async (mode = "replace") => { const r = await api(`/staging/${staging.source.id}/publish`, "POST", { mode }); setMsg(r.ok ? tr("تم النشر.") : tr("تعذر النشر.")); setStaging(null); load(); };
  return (
    <div className="grid gap-3 py-3">
      <Button3D variant="neutral" onClick={fetchNow}>{tr("جلب جداول الكلية (الخريف)")}</Button3D>
      <ul className="grid gap-1 text-sm">
        {sources.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate"><bdi dir="ltr">{decodeURIComponent(s.url.split("/").pop())}</bdi> · {s.status}</span>
            {s.status === "STAGED" && <button type="button" className="font-bold underline" onClick={() => review(s.id)}>{tr("مراجعة")}</button>}
          </li>
        ))}
      </ul>
      {staging && (
        <div className="law-card3d grid gap-2 text-sm">
          <p className="font-bold">{tr("الفروقات")}: +{staging.diff.added} / −{staging.diff.removed} / ~{staging.diff.changed} ({staging.rows.length})</p>
          {staging.source.parseLog && <pre className="whitespace-pre-wrap text-xs" style={{ color: "var(--law-warn)" }}>{staging.source.parseLog}</pre>}
          <div className="flex flex-wrap gap-2"><Button3D onClick={() => publish("replace")}>{tr("نشر (استبدال)")}</Button3D><Button3D variant="neutral" onClick={() => publish("merge")}>{tr("نشر كإضافة (دمج)")}</Button3D></div>
        </div>
      )}
      <Textarea rows={4} dir="ltr" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="semester,track,language,groupCode,dayOfWeek,startTime,endTime,subject,kind,room,professor" />
      <Button3D variant="neutral" onClick={importCsv} disabled={!csv.trim()}>{tr("استيراد CSV")}</Button3D>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}
