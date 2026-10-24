import { Camera, QrCode } from "@phosphor-icons/react";
import Sheet from "@/components/LawOS/kit/Sheet";
import { tr } from "@/components/LawOS/lib/i18n";

/** Mobile entry: scan someone's code, or show mine. The camera is only asked for after "scan" is tapped. */
export default function QrChoiceSheet({ open, onClose, onScan, onShow }) {
  const row = "flex w-full items-center gap-3 rounded-xl p-4 text-start font-semibold";
  const style = { background: "var(--law-surface-2)", border: "1px solid var(--law-border)" };
  return (
    <Sheet open={open} onClose={onClose} title={tr("رمز QR")}>
      <div className="grid gap-3">
        <button type="button" className={row} style={style} onClick={onScan}><Camera size={24} />{tr("مسح رمز QR")}</button>
        <button type="button" className={row} style={style} onClick={onShow}><QrCode size={24} />{tr("إظهار رمزي")}</button>
      </div>
    </Sheet>
  );
}
