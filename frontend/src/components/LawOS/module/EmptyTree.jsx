import { useState } from "react";
import MascotSlot from "@/components/LawOS/kit/MascotSlot";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Input } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

/** Shown by the reader, tree and axes views while the module has no notes: a first lecture, or ask the mentor to build them. */
export default function EmptyTree({ tree, onMentor }) {
  const [title, setTitle] = useState("");
  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const r = await tree.add({ title, kind: "lecture" });
    if (r.ok) setTitle("");
  }
  return (
    <MascotSlot moment="empty" message={tr("لا ملاحظات في هذه المادة بعد")}>
      <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("ابدأ بمحاضرة، أو أضف مصادرك واطلب من المرشد أن يقترح عليك بناء الملاحظات.")}</p>
      <form onSubmit={add} className="flex w-full max-w-md gap-2">
        <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={tr("عنوان المحاضرة الأولى")} aria-label={tr("عنوان المحاضرة الأولى")} dir="auto" />
        <Button3D type="submit">{tr("إضافة")}</Button3D>
      </form>
      {onMentor && <Button3D variant="neutral" onClick={onMentor}>{tr("اطلب من المرشد")}</Button3D>}
    </MascotSlot>
  );
}
