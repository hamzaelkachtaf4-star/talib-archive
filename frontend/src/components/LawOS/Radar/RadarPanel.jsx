import { useEffect, useState } from "react";
import Law from "@/models/law";
import { Button, Card, Notice } from "../ui";
import { fmtDate } from "../Corpus/shared";
import { tr } from "@/components/LawOS/lib/i18n";

const STATUS = {
  watch: [tr("قيد المتابعة"), "var(--law-muted)"],
  draft: [tr("مسودة"), "var(--law-muted)"],
  bill_in_parliament: [tr("في البرلمان"), "var(--law-warn)"],
  adopted: [tr("مصادق عليه"), "var(--law-warn)"],
  published: [tr("منشور"), "var(--law-accent)"],
  in_force: [tr("ساري"), "var(--law-ok)"],
};

/** Reform Radar (spec §3.7) + scraper sources status (spec §6.5). */
export default function RadarPanel() {
  const [reforms, setReforms] = useState([]);
  const [sources, setSources] = useState([]);
  const [msg, setMsg] = useState(null);
  const load = () => {
    Law.reforms().then((r) => r.ok && setReforms(r.data.reforms));
    Law.sourcesStatus().then((r) => r.ok && setSources(r.data.sources));
  };
  useEffect(load, []);

  async function scan() {
    const r = await Law.scanSources();
    setMsg(
      r.ok
        ? tr("بدأ الفحص. ستظهر الوثائق الجديدة في صندوق الوارد.")
        : tr("تعذر الفحص.")
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-bold">{tr("الإصلاحات التشريعية")}</h2>
      {reforms.map((r) => (
        <Card key={r.id} className="flex flex-col gap-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold">{r.title}</span>
            <span
              className="shrink-0 text-xs font-bold"
              style={{ color: STATUS[r.status][1] }}
            >
              {STATUS[r.status][0]}
            </span>
          </div>
          {r.inForceAt && (
            <span className="law-muted text-xs">
              {tr("ساري منذ")} {fmtDate(r.inForceAt)}
            </span>
          )}
          {r.status === "watch" && !r.summary && (
            <span className="law-muted text-xs">
              {tr("لا يوجد نص مشروع بعد.")}
            </span>
          )}
          {r.summary && (
            <span className="text-sm leading-7">
              {r.summary}{" "}
              {!r.summaryVerified && (
                <span style={{ color: "var(--law-warn)" }}>
                  {tr("(غير مُتحقق)")}
                </span>
              )}
            </span>
          )}
        </Card>
      ))}
      <h2 className="mt-2 text-sm font-bold">{tr("مصادر الرصد")}</h2>
      {sources.map((s) => (
        <Card
          key={s.id}
          className="flex items-center justify-between gap-2 p-3 text-sm"
        >
          <span>
            <span className="block font-semibold">{s.label}</span>
            <span className="law-muted text-xs">
              {!s.enabled
                ? s.disabledReason || tr("معطل في الإعدادات")
                : s.state.disabled
                  ? tr("متوقف بعد أخطاء: {0}", [s.state.lastError || ""])
                  : s.state.lastScanAt
                    ? tr("آخر فحص: {0}", [fmtDate(s.state.lastScanAt)])
                    : tr("لم يُفحص بعد")}
            </span>
          </span>
          {s.enabled && s.state.disabled && (
            <Button
              variant="secondary"
              onClick={() => Law.enableSource(s.id).then(load)}
              style={{ minHeight: 36 }}
            >
              {tr("إعادة التفعيل")}
            </Button>
          )}
        </Card>
      ))}
      <Button variant="secondary" onClick={scan} className="self-start">
        {tr("فحص الآن")}
      </Button>
      {msg && <Notice>{msg}</Notice>}
      <Notice>
        {tr(
          "الرصد يقرأ صفحات القوائم فقط، مرة يوميا، بفاصل لا يقل عن 10 ثوان بين الطلبات. لا يدخل أي نص إلى المرجع دون مراجعتك."
        )}
      </Notice>
    </div>
  );
}
