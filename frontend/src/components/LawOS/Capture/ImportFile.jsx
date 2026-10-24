import { useState } from "react";
import { FileArrowUp } from "@phosphor-icons/react";
import { Notice } from "../ui";
import { audioDuration, formatBytes } from "../lib/media";
import { queueImport } from "../lib/captureQueue";
import SubjectPicker from "./SubjectPicker";
import { tr } from "@/components/LawOS/lib/i18n";

/** Import a recording from the native recorder, a polycopié PDF, or images (spec §6.1). */
export default function ImportFile({ subjects, onDone }) {
  const [subjectId, setSubjectId] = useState("");
  const [busy, setBusy] = useState(null);

  async function pick(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    for (const f of files) {
      setBusy(`${f.name} (${formatBytes(f.size)})`);
      const durationSec = f.type.startsWith("audio/")
        ? await audioDuration(f)
        : null;
      await queueImport(f, { subjectId, durationSec });
    }
    setBusy(null);
    onDone?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <SubjectPicker
        subjects={subjects}
        value={subjectId}
        onChange={setSubjectId}
      />
      <label
        className="law-btn law-btn-primary cursor-pointer"
        style={{ minHeight: 56 }}
      >
        <FileArrowUp size={22} /> {tr("اختيار ملف (تسجيل، PDF، صورة)")}
        <input
          type="file"
          accept="audio/*,application/pdf,image/*"
          multiple
          className="hidden"
          onChange={pick}
          disabled={!!busy}
        />
      </label>
      {busy && (
        <Notice>
          {tr("جارٍ الحفظ على الهاتف:")} {busy}
        </Notice>
      )}
      <Notice>
        {tr(
          "تُحفظ الملفات على الهاتف أولا، ثم تُرفع تلقائيا عند توفر الاتصال، ولو أُغلق التطبيق أثناء الرفع."
        )}
      </Notice>
    </div>
  );
}
