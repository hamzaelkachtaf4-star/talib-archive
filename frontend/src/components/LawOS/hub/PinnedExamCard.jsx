import { useEffect, useState } from "react";
import { Exam } from "@phosphor-icons/react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import Avatar from "./../Squad/Avatar";
import { tr } from "@/components/LawOS/lib/i18n";

/** The most tried exam a colleague shared with the faculty, pinned above the forum feed. Nothing shows when none exists. */
export default function PinnedExamCard() {
  const [exam, setExam] = useState(null);
  useEffect(() => {
    Law.sharedExams().then((r) => r.ok && setExam(r.data.exams.find((e) => e.id === r.data.pinnedId) || null));
  }, []);
  if (!exam) return null;
  const chip = "whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold";
  const chipStyle = { background: "var(--law-surface-2)", border: "1px solid var(--law-border)" };
  return (
    <section className="law-card mb-4 grid gap-3 p-4" aria-label={tr("امتحان مثبّت")} style={{ borderColor: "var(--law-gold)" }}>
      <div className="flex items-center gap-2 text-sm">
        <Avatar person={exam.author} size={28} />
        <span className="min-w-0 truncate"><bdi className="font-bold">{exam.author.name}</bdi> · {tr("نشر امتحاناً تجريبياً")} · <bdi dir="ltr">{exam.semester}</bdi> · <bdi>{exam.moduleTitle}</bdi></span>
      </div>
      <h2 className="flex items-center gap-2 text-base font-bold"><Exam size={22} weight="duotone" style={{ color: "var(--law-gold)" }} /><bdi>{exam.title}</bdi></h2>
      <div className="flex flex-wrap items-center gap-2">
        <span className={chip} style={chipStyle}>QCM</span>
        <span className={chip} style={chipStyle}><bdi dir="ltr">{exam.questionCount}</bdi> {tr("أسئلة")}</span>
        <span className="ms-auto whitespace-nowrap text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{exam.tries}</bdi> {tr("جربوه")} · <bdi dir="ltr">{exam.helpful}</bdi> {tr("مفيد")}</span>
      </div>
      <div><Button3D to="/law/exam?tab=peers" variant="gold">{tr("جرب الامتحان")}</Button3D></div>
    </section>
  );
}
