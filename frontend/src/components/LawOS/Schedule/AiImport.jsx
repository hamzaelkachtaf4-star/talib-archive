import { useState } from "react";
import { Camera, MagicWand, TextAa } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Notice, Textarea } from "@/components/LawOS/ui";
import { resizeImage } from "@/components/LawOS/lib/media";
import { tr } from "@/components/LawOS/lib/i18n";
import ImportReview from "./ImportReview";

const AI_ERRORS = {
  ai_budget_reached: tr("بلغ استهلاك الذكاء الاصطناعي حدّه الشهري. أدخل الجدول باليد أو تواصل مع المسؤول."),
  ai_unavailable: tr("الذكاء الاصطناعي غير مفعّل على الخادم. أدخل الجدول باليد."),
  ai_failed: tr("تعذّرت قراءة الجدول. أعد المحاولة بصورة أوضح."),
  unsupported_image: tr("نوع الصورة غير مدعوم."),
  image_too_large: tr("الصورة كبيرة جداً."),
  nothing_to_parse: tr("أضف صورة أو الصق نص الجدول."),
};

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Mode 2: a photo of the faculty timetable (resized on the phone first) or pasted text → Gemini Flash →
 * a preview the student corrects and confirms. Unknown subjects can be created on the way.
 */
export default function AiImport({ modules, semester, current, onSaved }) {
  const [text, setText] = useState("");
  const [image, setImage] = useState(null); // { dataUrl, preview }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState(null);
  const [notes, setNotes] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const { blob } = await resizeImage(file); // protect the server: never upload full-size photos
      const dataUrl = await blobToDataUrl(blob);
      setImage({ dataUrl, preview: URL.createObjectURL(blob) });
    } catch {
      setError(tr("تعذّرت قراءة الصورة."));
    }
  }

  async function analyse() {
    setBusy(true);
    setError(null);
    setRows(null);
    const r = await Law.parseTimetableAi({
      ...(image ? { image: image.dataUrl } : {}),
      ...(text.trim() ? { text } : {}),
    });
    setBusy(false);
    if (!r.ok) return setError(r.offline ? tr("لا يوجد اتصال بالخادم.") : AI_ERRORS[r.data?.error] || tr("حدث خطأ. أعد المحاولة."));
    if (!r.data.slots.length) return setError(tr("لم نجد أي حصة في الجدول. جرّب صورة أوضح أو الصق النص."));
    setNotes(r.data.notes);
    setRows(r.data.slots);
  }

  if (rows)
    return (
      <ImportReview
        candidates={rows}
        notes={notes}
        modules={modules} semester={semester}
        current={current}
        onBack={() => setRows(null)}
        onSaved={(saved) => { setRows(null); setImage(null); setText(""); onSaved(saved); }}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-7" style={{ color: "var(--law-muted)" }}>
        {tr("صوّر جدول الحصص (المطبوع أو المعلّق في الكلية) أو الصق نصّه، وسيستخرج الذكاء الاصطناعي الأيام والأوقات والمواد والقاعات.")}
      </p>
      <label
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center font-semibold"
        style={{ border: "2px dashed var(--law-border)", color: "var(--law-primary)" }}
      >
        {image ? (
          <img src={image.preview} alt={tr("صورة الجدول")} className="max-h-56 rounded-xl" />
        ) : (
          <>
            <Camera size={36} />
            {tr("التقط صورة أو اختر صورة للجدول")}
          </>
        )}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      </label>
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-bold">
          <TextAa size={18} /> {tr("أو الصق نص الجدول")}
        </p>
        <Textarea
          rows={5}
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={20000}
          placeholder={"Lundi 8h30-10h Droit civil Amphi 3\nالأربعاء 14:00-15:30 القانون الجنائي TD قاعة 12"}
        />
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
      <Button
        type="button"
        onClick={analyse}
        disabled={busy || (!image && !text.trim())}
        className="flex items-center justify-center gap-2"
      >
        <MagicWand size={20} /> {busy ? tr("جارٍ التحليل…") : tr("استخراج الجدول بالذكاء الاصطناعي")}
      </Button>
    </div>
  );
}
