import { useState } from "react";
import Sheet from "@/components/LawOS/kit/Sheet";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Field, Input } from "@/components/LawOS/ui";
import { mutate } from "@/components/LawOS/lib/timetableSync";
import { tr } from "@/components/LawOS/lib/i18n";

/** Tap an item: cancel this week / move / edit room / undo; or add a catch-up session (item = null, date given). */
export default function OverrideSheet({ item, addDate, onClose, onDone }) {
  const [mode, setMode] = useState(null); // move | room | add
  const [f, setF] = useState({ newDate: item?.date || addDate || "", startTime: item?.startTime || "", endTime: item?.endTime || "", room: item?.room || "", subject: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const open = !!item || !!addDate;

  async function run(op) {
    setBusy(true);
    setErr(null);
    const r = await mutate(op);
    setBusy(false);
    if (r.error) return setErr(tr("تعذر الحفظ. راجع القيم."));
    onDone(!!r.queued);
  }

  const cancel = () => run({ kind: "create", body: { type: "CANCEL", sessionId: item.sessionId, date: item.date } });
  const undo = () => run({ kind: "delete", id: item.overrideId });
  const room = () => run({ kind: "create", body: { type: "EDIT", sessionId: item.sessionId, date: item.date, data: { room: f.room } } });
  const move = () => run({ kind: "create", body: { type: "MOVE", sessionId: item.sessionId, date: item.date, data: { newDate: f.newDate, startTime: f.startTime, endTime: f.endTime } } });
  const add = () => run({ kind: "create", body: { type: "ADD", date: addDate, data: { subject: f.subject, startTime: f.startTime, endTime: f.endTime, ...(f.room ? { room: f.room } : {}) } } });

  const title = item ? item.subject : tr("حصة تدارك");
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="grid gap-3">
        {item && !mode && item.source !== "custom" && (
          <>
            <Button3D variant="neutral" block onClick={cancel} disabled={busy}>{tr("إلغاء هذا الأسبوع")}</Button3D>
            <Button3D variant="neutral" block onClick={() => setMode("move")}>{tr("نقل الحصة")}</Button3D>
            <Button3D variant="neutral" block onClick={() => setMode("room")}>{tr("تعديل القاعة")}</Button3D>
          </>
        )}
        {item?.overrideId && !mode && <Button3D variant="danger" block onClick={undo} disabled={busy}>{tr("التراجع عن التعديل")}</Button3D>}
        {mode === "move" && (
          <>
            <Field label={tr("التاريخ الجديد")}><Input type="date" dir="ltr" value={f.newDate} onChange={(e) => setF({ ...f, newDate: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tr("من")}><Input type="time" dir="ltr" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
              <Field label={tr("إلى")}><Input type="time" dir="ltr" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field>
            </div>
            <Button3D block onClick={move} disabled={busy || !f.newDate || !f.startTime || !f.endTime}>{tr("حفظ")}</Button3D>
          </>
        )}
        {mode === "room" && (
          <>
            <Field label={tr("القاعة")}><Input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} maxLength={200} /></Field>
            <Button3D block onClick={room} disabled={busy || !f.room.trim()}>{tr("حفظ")}</Button3D>
          </>
        )}
        {!item && addDate && (
          <>
            <Field label={tr("المادة")}><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={200} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tr("من")}><Input type="time" dir="ltr" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
              <Field label={tr("إلى")}><Input type="time" dir="ltr" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field>
            </div>
            <Field label={tr("القاعة")}><Input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} maxLength={200} /></Field>
            <Button3D block onClick={add} disabled={busy || !f.subject.trim() || !f.startTime || !f.endTime || f.endTime <= f.startTime}>{tr("إضافة")}</Button3D>
          </>
        )}
        {err && <p role="alert" className="text-sm" style={{ color: "var(--law-danger)" }}>{err}</p>}
      </div>
    </Sheet>
  );
}
