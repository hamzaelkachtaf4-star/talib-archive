import { useEffect, useState } from "react";
import Law from "@/models/law";
import { Card, Notice } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

const DAY_LABELS = [tr("اليوم"), tr("غدا"), "+2", "+3", "+4", "+5", "+6"];

export default function ReviewStats() {
  const [stats, setStats] = useState(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    Law.cardStats().then((r) =>
      r.ok ? setStats(r.data) : setOffline(r.offline)
    );
  }, []);
  if (offline)
    return (
      <Notice tone="warn">{tr("الإحصائيات تحتاج اتصالا بالخادم.")}</Notice>
    );
  if (!stats) return null;
  const max = Math.max(1, ...stats.forecast);
  return (
    <div className="flex flex-col gap-3">
      <Card className="grid grid-cols-2 gap-4 p-4 text-center">
        <div>
          <p className="text-2xl font-bold tabular-nums">
            {stats.retention30d === null ? (
              "—"
            ) : (
              <bdi dir="ltr">{Math.round(stats.retention30d * 100)}%</bdi>
            )}
          </p>
          <p className="law-muted text-xs">{tr("نسبة التذكر (30 يوما)")}</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">
            <bdi dir="ltr">{stats.reviews30d}</bdi>
          </p>
          <p className="law-muted text-xs">{tr("مراجعة (30 يوما)")}</p>
        </div>
      </Card>
      <Card className="p-4">
        <p className="mb-3 text-sm font-bold">
          {tr("عبء المراجعة في الأيام القادمة")}
        </p>
        <div className="flex h-32 items-end gap-2">
          {stats.forecast.map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs tabular-nums">
                <bdi dir="ltr">{n}</bdi>
              </span>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${(n / max) * 80}px`,
                  background: "var(--law-accent)",
                  minHeight: 2,
                }}
              />
              <span className="law-muted text-[10px]">{DAY_LABELS[i]}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
