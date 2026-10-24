import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, X } from "@phosphor-icons/react";
import { Button, Notice } from "@/components/LawOS/ui";
import { tr, lang } from "@/components/LawOS/lib/i18n";
import { brandName } from "@/config/brand";
import useDeviceClass from "@/hooks/useDeviceClass";

const TOKEN_IN_LINK = /\/law\/qr\/([A-Za-z0-9_-]{32})(?:[/?#]|$)/;

const FRIEND_LINK = /[?&]add=([A-Za-z0-9-]{4,40})(?:[&#]|$)/;
const BARE_CODE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+){1,3}$/;

/** The QR token in a scanned text (the QR holds a link to /law/qr/<token>), or null. */
export function qrTokenFrom(text) {
  return String(text || "").match(TOKEN_IN_LINK)?.[1] || null;
}

/** What a scan or a typed code means: a desktop sign-in approval, a friend code, or nothing we understand. */
export function parseScan(text) {
  const t = String(text || "").trim();
  const token = qrTokenFrom(t);
  if (token) return { kind: "login", token };
  const link = t.match(FRIEND_LINK)?.[1];
  if (link) return { kind: "friend", code: link.toUpperCase() };
  if (BARE_CODE.test(t) && t.length <= 40) return { kind: "friend", code: t.toUpperCase() };
  return null;
}

/** Native BarcodeDetector when the WebView has it, otherwise jsQR (loaded only then). */
async function makeDecoder() {
  if ("BarcodeDetector" in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes("qr_code")) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        return async (source) => (await detector.detect(source))[0]?.rawValue || null;
      }
    } catch {}
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (source) => {
    const w = source.videoWidth || source.naturalWidth || source.width;
    const h = source.videoHeight || source.naturalHeight || source.height;
    if (!w || !h) return null;
    const scale = Math.min(1, 800 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height)?.data || null;
  };
}

/** Full-screen camera that reads a login QR and opens its approval screen. */
export default function QrScanner({ onClose }) {
  const navigate = useNavigate();
  const video = useRef(null);
  const [error, setError] = useState(null);
  const [cameraOk, setCameraOk] = useState(true);
  const [manual, setManual] = useState("");

  function found(text) {
    const hit = parseScan(text);
    if (!hit) {
      setError(tr("هذا ليس رمز QR صادراً عن {0}.", [brandName(lang())]));
      return false;
    }
    onClose?.();
    navigate(hit.kind === "login" ? `/law/qr/${hit.token}` : `/law/profile?add=${encodeURIComponent(hit.code)}`);
    return true;
  }

  useEffect(() => {
    let stream;
    let stopped = false;
    let timer;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        setCameraOk(false);
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      const decode = await makeDecoder();
      const loop = async () => {
        if (stopped) return;
        try {
          const text = await decode(video.current);
          if (text && found(text)) return;
        } catch {}
        timer = setTimeout(loop, 250);
      };
      loop();
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // No live camera (permission refused, desktop without webcam): decode a photo instead.
  async function fromPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const text = await (await makeDecoder())(bitmap);
      if (!text) return setError(tr("لم نعثر على رمز QR في الصورة. أعد المحاولة."));
      found(text);
    } catch {
      setError(tr("تعذّرت قراءة الصورة."));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),1rem)]">
        <span className="font-bold">{tr("مسح رمز QR")}</span>
        <button type="button" onClick={onClose} aria-label={tr("إغلاق")} className="p-2">
          <X size={26} />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {cameraOk ? (
          <>
            <video ref={video} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute h-64 w-64 rounded-3xl border-4 border-white/80" />
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 p-6 text-center">
            <Camera size={48} />
            <p className="text-sm leading-7">{tr("تعذّر فتح الكاميرا. التقط صورة لرمز QR بدلاً من ذلك.")}</p>
            <label className="law-btn law-btn-primary cursor-pointer px-5">
              {tr("التقاط صورة")}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={fromPhoto} />
            </label>
            <form className="flex w-full max-w-xs gap-2" onSubmit={(e) => { e.preventDefault(); found(manual); }}>
              <input value={manual} onChange={(e) => setManual(e.target.value)} dir="ltr" autoComplete="off" aria-label={tr("أو اكتب رمز الصديق")} placeholder={tr("أو اكتب رمز الصديق")} className="law-input min-w-0 flex-1 text-black" />
              <button type="submit" className="law-btn law-btn-secondary px-4">{tr("تأكيد")}</button>
            </form>
          </div>
        )}
      </div>
      <div className="p-4 pb-[max(env(safe-area-inset-bottom),1rem)] text-center text-sm">
        {error ? (
          <Notice tone="warn">{error}</Notice>
        ) : (
          <p className="opacity-80">{tr("وجّه الكاميرا نحو رمز QR (رمز صديق أو رمز الاتصال بالحاسوب).")}</p>
        )}
      </div>
    </div>
  );
}

/** Profile shortcut. Scanning needs a camera that moves: it is a phone feature, never shown (or requested) on desktop. */
export function ScanQrButton() {
  const [open, setOpen] = useState(false);
  const device = useDeviceClass();
  if (device === "desktop") return null;
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2">
        <Camera size={20} /> {tr("مسح رمز QR")}
      </Button>
      {open && <QrScanner onClose={() => setOpen(false)} />}
    </>
  );
}
