import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarCheck, HandsClapping, GitFork, Medal, SealCheck, Notebook, Megaphone } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Card, Notice } from "@/components/LawOS/ui";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Avatar from "@/components/LawOS/Squad/Avatar";
import NoteBadges from "@/components/LawOS/Squad/NoteBadges";
import { squadError } from "./Squad";
import { tr } from "@/components/LawOS/lib/i18n";

function badgeLabel(b) {
  if (b.type === "expert") return tr("خبير {0}", [b.module]);
  if (b.type === "verified_author") return tr("صاحب ملخص موثق");
  if (b.type === "publisher") return tr("ناشر نشيط ({0} ملخصات)", [b.count]);
  if (b.type === "reference") return tr("مرجع للفوج ({0} نسخ)", [b.count]);
  if (b.type === "ambassador") return tr("سفير الفوج");
  return b.type;
}
const BADGE_ICON = { expert: Medal, verified_author: SealCheck, publisher: Notebook, reference: GitFork, ambassador: Megaphone };

/** A student's public profile (only when they opted in). */
export default function StudentProfile() {
  const { userId } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    Law.studentProfile(userId).then((r) =>
      r.ok ? setP(r.data.profile) : setError(r.status === 404 ? tr("هذا الملف غير عام.") : squadError(r))
    );
  }, [userId]);

  return (
    <>
      <PageTitle sub={p ? <bdi dir="ltr">{[p.faculty, p.semester, p.tdGroup].filter(Boolean).join(" · ")}</bdi> : null}>
        {p ? <bdi>{p.name}</bdi> : tr("الملف العام")}
      </PageTitle>
      {error && <Notice tone="warn">{error}</Notice>}
      {p?.cardOnly && (
        <Card className="mb-4 flex items-center gap-4 p-4">
          <Avatar person={p} size={56} />
          <p className="law-muted text-sm">{tr("هذا الملف غير عام.")}</p>
        </Card>
      )}
      {p && !p.cardOnly && (
        <>
          {p.me && !p.publicProfile && <Notice tone="warn">{tr("ملفك خاص: لا يراه غيرك. فعّله من الملف الشخصي.")}</Notice>}
          <Card className="mb-4 flex items-center gap-4 p-4">
            <Avatar person={p} size={56} />
            <div className="grid flex-1 grid-cols-2 gap-2 text-center text-sm">
              <div>
                <HandsClapping size={18} className="mx-auto" style={{ color: "var(--law-accent)" }} />
                <div className="font-bold">
                  <bdi dir="ltr">{p.endorsementsReceived}</bdi>
                </div>
                <div className="text-xs" style={{ color: "var(--law-muted)" }}>
                  {tr("توثيق")}
                </div>
              </div>
              <div>
                <CalendarCheck size={18} className="mx-auto" style={{ color: "var(--law-gold-ink)" }} />
                <div className="font-bold">
                  <bdi dir="ltr">{p.streak}</bdi>
                </div>
                <div className="text-xs" style={{ color: "var(--law-muted)" }}>
                  {tr("أيام المواظبة")}
                </div>
              </div>
            </div>
          </Card>
          {p.badges.length > 0 && (
            <Card className="mb-4 flex flex-wrap gap-2 p-4">
              {p.badges.map((b, i) => {
                const Icon = BADGE_ICON[b.type] || Medal;
                return (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold" style={{ background: "var(--law-surface-2)" }}>
                    <Icon size={16} style={{ color: "var(--law-accent)" }} /> <bdi>{badgeLabel(b)}</bdi>
                  </span>
                );
              })}
            </Card>
          )}
          <h2 className="mb-2 font-bold">{tr("الملخصات العامة")}</h2>
          <div className="flex flex-col gap-3">
            {p.notes.map((n) => (
              <Link key={n.id} to={`/law/hub/notes/${n.id}`} className="law-card flex flex-col gap-1 p-4">
                <span className="font-semibold">
                  <bdi>{n.title}</bdi>
                </span>
                <span className="text-xs" style={{ color: "var(--law-muted)" }}>
                  <bdi>{n.moduleName}</bdi> · <bdi>{n.professorName}</bdi>
                </span>
                <NoteBadges note={n} />
              </Link>
            ))}
            {!p.notes.length && <p className="law-muted text-sm">{tr("لا ملخصات عامة بعد.")}</p>}
          </div>
        </>
      )}
    </>
  );
}
