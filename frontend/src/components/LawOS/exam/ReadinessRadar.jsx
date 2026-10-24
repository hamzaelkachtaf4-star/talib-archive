import { useEffect, useState } from "react";
import Law from "@/models/law";
import Chip from "@/components/LawOS/kit/Chip";
import MascotSlot from "@/components/LawOS/kit/MascotSlot";
import { tr } from "@/components/LawOS/lib/i18n";

export const AXES = () => [["cards", tr("البطاقات")], ["path", tr("المسار")], ["drills", tr("التمارين")], ["notes", tr("الملاحظات")], ["gaps", tr("الفجوات")]];

/** Pentagon points for values 0-100 (missing counts as 0 in the shape; the table below says "no data"). */
export function polygon(values, r = 80, c = 100) {
  const n = values.length;
  return values.map((v, i) => {
    const a = (-Math.PI / 2) + (2 * Math.PI * i) / n;
    const d = (Math.max(0, Math.min(100, v ?? 0)) / 100) * r;
    return `${(c + d * Math.cos(a)).toFixed(1)},${(c + d * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

/** How ready the student is per module: five measurable axes drawn as a radar, with the same numbers in a table. */
export default function ReadinessRadar({ refreshKey }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  useEffect(() => {
    Law.examReadiness().then((r) => {
      if (!r.ok) return setData({ modules: [] });
      setData(r.data);
      setSel((cur) => cur || r.data.modules[0]?.id || null);
    });
  }, [refreshKey]);
  if (!data) return null;
  if (!data.modules.length) return <MascotSlot moment="empty" message={tr("افتح مسارك الدراسي لتظهر مواد فصلك هنا.")} />;
  const m = data.modules.find((x) => x.id === sel) || data.modules[0];
  const axes = AXES();
  const vals = axes.map(([k]) => m.axes[k]);
  return (
    <section className="grid gap-3" aria-label={tr("الجاهزية")}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={tr("المادة")}>
        {data.modules.map((x) => <Chip key={x.id} active={x.id === m.id} onClick={() => setSel(x.id)}><bdi>{x.title}</bdi></Chip>)}
      </div>
      <div className="grid items-center gap-4 sm:grid-cols-2">
        <svg viewBox="0 0 200 200" role="img" aria-label={tr("مخطط الجاهزية: {0}", [m.title])} className="mx-auto w-full max-w-xs">
          {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={polygon(axes.map(() => 100 * f))} fill="none" stroke="var(--law-border)" strokeWidth="1" />)}
          {axes.map(([k], i) => { const [x, y] = polygon(axes.map((_, j) => (j === i ? 100 : 0))).split(" ")[i].split(","); return <line key={k} x1="100" y1="100" x2={x} y2={y} stroke="var(--law-border)" strokeWidth="1" />; })}
          <polygon points={polygon(vals)} fill="var(--law-primary)" fillOpacity="0.25" stroke="var(--law-primary)" strokeWidth="2" />
          {axes.map(([k, label], i) => { const [x, y] = polygon(axes.map((_, j) => (j === i ? 100 : 0)), 94).split(" ")[i].split(","); return <text key={k} x={x} y={y} textAnchor="middle" fontSize="9" fill="var(--law-text)">{label}</text>; })}
        </svg>
        <table className="w-full text-sm">
          <caption className="mb-2 text-start font-bold"><bdi>{m.title}</bdi></caption>
          <tbody>
            {axes.map(([k, label]) => (
              <tr key={k} style={{ borderBottom: "1px solid var(--law-border)" }}>
                <th scope="row" className="py-1 text-start font-medium">{label}</th>
                <td className="py-1 text-end font-bold">{m.axes[k] == null ? <span style={{ color: "var(--law-muted)" }}>{tr("لا بيانات")}</span> : <bdi dir="ltr">{m.axes[k]}%</bdi>}</td>
              </tr>
            ))}
            <tr><th scope="row" className="py-1 text-start font-bold">{tr("الإجمالي")}</th><td className="py-1 text-end font-bold">{m.overall == null ? "—" : <bdi dir="ltr">{m.overall}%</bdi>}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
