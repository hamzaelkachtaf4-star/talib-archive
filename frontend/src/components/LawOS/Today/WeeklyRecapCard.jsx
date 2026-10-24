import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck } from "@phosphor-icons/react";
import Law from "@/models/law";
import { tr } from "@/components/LawOS/lib/i18n";

/** Shown on Sundays and Mondays when this week's recap exists (spec §10.2 WeeklyRecapCard). */
export default function WeeklyRecapCard() {
  const [recap, setRecap] = useState(null);
  useEffect(() => {
    const wd = new Date().getDay(); // 0 Sunday, 1 Monday
    if (wd !== 0 && wd !== 1) return;
    Law.latestRecap().then((r) => {
      const x = r.ok ? r.data.recap : null;
      if (x && Date.now() - new Date(x.generatedAt).getTime() < 3 * 86400000)
        setRecap(x);
    });
  }, []);
  if (!recap) return null;
  const c = recap.content;
  return (
    <Link to="/law/recap" className="law-card flex items-center gap-3 p-4">
      <CalendarCheck size={28} style={{ color: "var(--law-accent)" }} />
      <span className="flex-1 text-sm">
        <span className="block font-bold">{tr("ملخص الأسبوع")}</span>
        <span className="law-muted">
          <bdi dir="ltr">{c.minutes}</bdi> {tr("دقيقة ·")}{" "}
          <bdi dir="ltr">{c.cardsLearned}</bdi> {tr("بطاقة جديدة")}
        </span>
      </span>
    </Link>
  );
}
