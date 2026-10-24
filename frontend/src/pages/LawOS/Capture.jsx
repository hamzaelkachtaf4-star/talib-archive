import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import * as idb from "@/components/LawOS/lib/idb";
import CameraBatchCapture from "@/components/LawOS/Capture/CameraBatchCapture";
import AudioRecorder from "@/components/LawOS/Capture/AudioRecorder";
import ImportFile from "@/components/LawOS/Capture/ImportFile";
import UploadQueueStatus from "@/components/LawOS/Capture/UploadQueueStatus";
import InboxList from "@/components/LawOS/Inbox/InboxList";
import { tr } from "@/components/LawOS/lib/i18n";

const MODES = [
  ["photos", tr("صور")],
  ["audio", tr("تسجيل")],
  ["import", tr("استيراد")],
  ["inbox", tr("صندوق الوارد")],
];

export default function Capture() {
  const [params, setParams] = useSearchParams();
  const mode = params.get("tab") || "photos";
  const [subjects, setSubjects] = useState([]);

  useEffect(() => {
    Law.subjects().then(async (r) =>
      setSubjects(
        r.ok ? r.data.subjects : (await idb.getMeta("subjects")) || []
      )
    );
  }, []);

  return (
    <>
      <PageTitle
        sub={tr("صوّر، سجّل أو استورد. يُحفظ كل شيء على الهاتف أولا.")}
      >
        {tr("التقاط")}
      </PageTitle>
      <div
        className="mb-4 flex gap-1 rounded-xl p-1"
        style={{ background: "var(--law-surface-2)" }}
        role="tablist"
      >
        {MODES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setParams({ tab: key }, { replace: true })}
            className="min-h-[40px] flex-1 rounded-lg text-sm font-semibold"
            style={
              mode === key
                ? { background: "var(--law-surface)" }
                : { color: "var(--law-muted)" }
            }
          >
            {label}
          </button>
        ))}
      </div>
      {mode !== "inbox" && (
        <div className="mb-4">
          <UploadQueueStatus />
        </div>
      )}
      {mode === "photos" && <CameraBatchCapture subjects={subjects} />}
      {mode === "audio" && <AudioRecorder subjects={subjects} />}
      {mode === "import" && <ImportFile subjects={subjects} />}
      {mode === "inbox" && <InboxList subjects={subjects} />}
    </>
  );
}
