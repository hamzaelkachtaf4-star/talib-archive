import { useIsAdmin } from "@/components/LawOS/lib/useLawUser";
import { Forward } from "@/components/LawOS/kit/DirArrow";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Waveform,
  ListBullets,
  Warning,
  PauseCircle,
  Tray,
  Lightbulb,
} from "@phosphor-icons/react";
import Law from "@/models/law";
import EmptyState from "../EmptyState";
import { Button, Card, Notice } from "../ui";
import { onUploadEvent } from "../lib/captureQueue";
import DerivativeReview from "./DerivativeReview";
import NewSourceItem from "../Radar/NewSourceItem";
import { intlLocale, tr } from "@/components/LawOS/lib/i18n";

const KIND = {
  ocr_text: { label: tr("نص صفحات للمراجعة"), Icon: FileText },
  transcript: { label: tr("تفريغ محاضرة للمراجعة"), Icon: Waveform },
  segments: { label: tr("مواضيع محاضرة للمراجعة"), Icon: ListBullets },
  candidate_atoms: { label: tr("أفكار مقترحة للحفظ"), Icon: Lightbulb },
  polycopie_map: { label: tr("ربط المطبوع بالتصميم"), Icon: ListBullets },
};
const JOB_LABELS = {
  ocr_photo_batch: tr("قراءة الصفحات"),
  transcribe_audio: tr("تفريغ التسجيل"),
  segment_transcript: tr("تقسيم المحاضرة"),
  extract_pdf: tr("استخراج نص PDF"),
  candidate_atoms: tr("اقتراح الأفكار"),
  align_polycopie: tr("ربط المطبوع"),
};

const dateFmt = new Intl.DateTimeFormat(intlLocale(), {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Africa/Casablanca",
});

export default function InboxList({ subjects = [] }) {
  const isAdmin = useIsAdmin();
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    const r = await Law.inbox();
    setOffline(r.offline);
    if (r.ok) setData(r.data);
  }, []);

  useEffect(() => {
    load();
    const off = onUploadEvent(
      (e) => e.type === "batch-complete" && setTimeout(load, 1500)
    );
    const t = setInterval(load, 15000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [load]);

  async function retry(id) {
    await Law.retryJob(id);
    load();
  }

  if (open)
    return (
      <DerivativeReview
        subjects={subjects}
        id={open}
        onBack={(changed) => {
          setOpen(null);
          if (changed) load();
        }}
      />
    );
  if (offline)
    return (
      <Notice tone="warn">{tr("صندوق الوارد يحتاج اتصالا بالخادم.")}</Notice>
    );
  if (!data) return null;

  const nothing =
    !data.newSources?.length &&
    !data.stoppedSources?.length &&
    !data.derivatives.length &&
    !data.failedJobs.length &&
    !data.pausedJobs.length;
  return (
    <div className="flex flex-col gap-3">
      {data.pausedJobs.length > 0 && (
        <Card
          className="flex items-start gap-3 p-3"
          style={{ borderColor: "var(--law-warn)" }}
        >
          <PauseCircle size={24} style={{ color: "var(--law-warn)" }} />
          <div className="flex-1 text-sm leading-7">
            <bdi dir="ltr">{data.pausedJobs.length}</bdi> {tr("مهمة متوقفة:")}{" "}
            {isAdmin
              ? tr("بلغت ميزانية الذكاء الاصطناعي حدها الشهري.")
              : tr(
                  "المساعد القانوني الذكي غير متاح مؤقتاً، وستُستأنف تلقائياً."
                )}{" "}
            {tr("لم يُحذف أي شيء.")}
            {isAdmin && (
              <Link
                to="/law/settings"
                className="block font-semibold"
                style={{ color: "var(--law-accent)" }}
              >
                {tr("تعديل الميزانية")} <Forward />
              </Link>
            )}
          </div>
        </Card>
      )}
      {data.processingCount > 0 && (
        <Notice>
          {tr("قيد المعالجة:")} <bdi dir="ltr">{data.processingCount}</bdi>
        </Notice>
      )}
      {nothing && (
        <EmptyState Icon={Tray} title={tr("صندوق الوارد فارغ")}>
          {tr(
            "عندما تُقرأ صورك أو يُفرّغ تسجيلك، ستجد النص هنا لمراجعته وقبوله قبل استعماله في الدراسة."
          )}
        </EmptyState>
      )}
      {data.derivatives.map((d) => {
        const k = KIND[d.kind] || { label: d.kind, Icon: FileText };
        return (
          <Card key={d.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(d.id)}
              className="flex w-full items-center gap-3 p-3 text-start"
            >
              <k.Icon
                size={24}
                style={{ color: d.subject?.color || "var(--law-accent)" }}
              />
              <span className="flex-1">
                <span className="block font-semibold">{k.label}</span>
                <span className="law-muted text-xs">
                  {d.subject?.name || tr("بدون مادة")} ·{" "}
                  {dateFmt.format(new Date(d.batch?.capturedAt || d.createdAt))}
                </span>
              </span>
            </button>
          </Card>
        );
      })}
      {data.stoppedSources?.map((s) => (
        <Notice key={s.id} tone="warn">
          {tr("توقف رصد «")}
          {s.label}
          {tr("» بعد أخطاء متكررة. أعد تفعيله من تبويب الرادار.")}
        </Notice>
      ))}
      {data.newSources?.map((s) => (
        <NewSourceItem key={s.id} source={s} onDone={load} />
      ))}
      {data.failedJobs.map((j) => (
        <Card key={j.id} className="flex items-center gap-3 p-3">
          <Warning size={22} style={{ color: "var(--law-warn)" }} />
          <span className="flex-1 text-sm">
            <span className="block font-semibold">
              {tr("فشل:")} {JOB_LABELS[j.type] || j.type}
            </span>
            <bdi dir="ltr" className="law-muted block text-xs">
              {j.error?.slice(0, 140)}
            </bdi>
          </span>
          <Button
            variant="secondary"
            onClick={() => retry(j.id)}
            style={{ minHeight: 36 }}
          >
            {tr("إعادة")}
          </Button>
        </Card>
      ))}
    </div>
  );
}
