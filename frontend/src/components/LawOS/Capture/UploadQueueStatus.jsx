import { useEffect, useState } from "react";
import { CloudArrowUp, CheckCircle, Warning } from "@phosphor-icons/react";
import { pendingStatus, onUploadEvent, kick } from "../lib/captureQueue";
import { formatBytes } from "../lib/media";
import { tr } from "@/components/LawOS/lib/i18n";

/** Persistent pending-uploads count with a retry control (spec §6.2). */
export default function UploadQueueStatus() {
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    const refresh = () =>
      pendingStatus()
        .then(setStatus)
        .catch(() => {});
    refresh();
    const off = onUploadEvent((e) => {
      if (e.type === "progress") setProgress(e);
      if (
        ["uploaded", "batch-complete", "idle", "error", "queued"].includes(
          e.type
        )
      ) {
        setProgress(null);
        refresh();
      }
    });
    const t = setInterval(refresh, 5000);
    return () => {
      off();
      clearInterval(t);
    };
  }, []);

  if (!status) return null;
  const empty = status.captures === 0 && status.batches === 0;
  return (
    <div className="law-card flex items-center gap-3 p-3 text-sm">
      {empty ? (
        <CheckCircle size={22} style={{ color: "var(--law-ok)" }} />
      ) : status.lastError ? (
        <Warning size={22} style={{ color: "var(--law-warn)" }} />
      ) : (
        <CloudArrowUp size={22} style={{ color: "var(--law-accent)" }} />
      )}
      <span className="flex-1">
        {empty ? (
          tr("كل الملفات مرفوعة")
        ) : (
          <>
            {tr("بانتظار الرفع:")} <bdi dir="ltr">{status.captures}</bdi>{" "}
            {tr("ملف (")}
            <bdi dir="ltr">{formatBytes(status.bytes)}</bdi>)
            {status.openRecordings > 0 && tr("· تسجيل جارٍ")}
            {progress && (
              <span className="law-muted block text-xs">
                {tr("جزء")}{" "}
                <bdi dir="ltr">
                  {progress.chunk}/{progress.of}
                </bdi>
              </span>
            )}
            {status.lastError && !progress && (
              <span
                className="block text-xs"
                style={{ color: "var(--law-warn)" }}
              >
                {navigator.onLine
                  ? tr("توقف الرفع، ستُعاد المحاولة.")
                  : tr("بدون اتصال، سيُستأنف تلقائيا.")}
              </span>
            )}
          </>
        )}
      </span>
      {!empty && (
        <button
          type="button"
          onClick={() => kick()}
          className="law-btn law-btn-secondary"
          style={{ minHeight: 36 }}
        >
          {tr("إعادة المحاولة")}
        </button>
      )}
    </div>
  );
}
