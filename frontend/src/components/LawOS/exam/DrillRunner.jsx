import { useEffect, useState } from "react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { GeneratedLabel } from "./drillParts";
import DrillQcm from "./DrillQcm";
import DrillCards from "./DrillCards";
import DrillCase from "./DrillCase";
import DrillDirect from "./DrillDirect";
import DrillDissertation from "./DrillDissertation";

export const TYPE_LABEL = () => ({ qcm: tr("أسئلة متعددة الخيارات"), case: tr("نازلة تطبيقية"), direct: tr("أسئلة نظرية مباشرة"), dissertation: tr("موضوع مقالي") });
const BY_TYPE = { qcm: DrillQcm, case: DrillCase, direct: DrillDirect, dissertation: DrillDissertation };

/** Loads one drill and runs it: answer first, then the revealed result. Nothing about the key is on screen before submitting. */
export default function DrillRunner({ drillId, onClose, onSubmitted }) {
  const [drill, setDrill] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [serverErrors, setServerErrors] = useState(null);
  useEffect(() => { Law.examDrillGet(drillId).then((r) => (r.ok ? setDrill(r.data.drill) : setError(tr("تعذر فتح التمرين.")))); }, [drillId]);

  async function submit(body) {
    setBusy(true);
    setError(null);
    setServerErrors(null);
    const r = await Law.examDrillSubmit(drillId, body);
    setBusy(false);
    if (r.ok) { setDrill(r.data.drill); onSubmitted?.(r.data.drill); return; }
    const code = r.data?.error?.code;
    if (code === "invalid_outline") setServerErrors(r.data.error.details?.errors || []);
    setError(
      code === "AI_QUOTA_EXCEEDED" ? tr("استنفدت حصتك اليومية. كتابتك محفوظة؛ سلّم غداً.")
      : code === "ai_unavailable" ? tr("المصحح غير متاح الآن. كتابتك محفوظة؛ أعد التسليم لاحقاً.")
      : code === "critique_unusable" ? tr("لم يكتمل التصحيح هذه المرة. كتابتك محفوظة وحصتك لم تُستهلك؛ أعد التسليم.")
      : code === "already_submitted" ? tr("سُلّم هذا التمرين بالفعل.")
      : code === "missing_sections" ? tr("أكمل الأقسام الأربعة قبل التسليم.")
      : code === "invalid_outline" ? tr("أكمل التصميم وفق الشروط أعلاه.")
      : r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذر التسليم.")
    );
  }

  if (!drill) return error ? <Notice tone="warn">{error}</Notice> : <p role="status">…</p>;
  const View = drill.type === "qcm" && drill.mode === "cards" ? DrillCards : BY_TYPE[drill.type];
  return (
    <section className="grid gap-3" aria-label={TYPE_LABEL()[drill.type]}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{TYPE_LABEL()[drill.type]}</h2>
        <Button3D variant="neutral" onClick={onClose}>{drill.status === "submitted" ? tr("إغلاق") : tr("لاحقاً")}</Button3D>
      </div>
      <p className="flex flex-wrap items-center gap-2"><GeneratedLabel /></p>
      {drill.unverifiedCitations?.length > 0 && <Notice tone="warn">{tr("حُذفت إحالات قانونية لا يمكن التحقق منها في مصادرك.")}</Notice>}
      <View drill={drill} onSubmit={submit} busy={busy} error={error} serverErrors={serverErrors} />
    </section>
  );
}
