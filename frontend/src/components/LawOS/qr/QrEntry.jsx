import { useState } from "react";
import { QrCode } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";
import useDeviceClass from "@/hooks/useDeviceClass";
import QrShowModal from "./QrShowModal";
import QrChoiceSheet from "./QrChoiceSheet";
import QrScanner from "./QrScanner";

/** Header QR button. Desktop: shows my QR (no camera code runs). Mobile: choose between scanning and showing. */
export default function QrEntry() {
  const device = useDeviceClass();
  const [view, setView] = useState(null); // null | "choice" | "show" | "scan"
  const close = () => setView(null);
  return (
    <>
      <button type="button" onClick={() => setView(device === "desktop" ? "show" : "choice")} aria-label={tr("رمز QR")} title={tr("رمز QR")} className="flex h-11 w-11 items-center justify-center rounded-full" style={{ color: "var(--law-primary)" }}>
        <QrCode size={22} weight="bold" />
      </button>
      <QrChoiceSheet open={view === "choice"} onClose={close} onScan={() => setView("scan")} onShow={() => setView("show")} />
      <QrShowModal open={view === "show"} onClose={close} />
      {view === "scan" && <QrScanner onClose={close} />}
    </>
  );
}
