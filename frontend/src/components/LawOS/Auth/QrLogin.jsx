import { useEffect, useRef, useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Notice } from "@/components/LawOS/ui";
import { tr, lang } from "@/components/LawOS/lib/i18n";
import { brandName } from "@/config/brand";
import { authErrorMessage } from "./AuthLayout";

const POLL_MS = 2000;
const QR_TTL_S = 300;

/**
 * Signed-out side of QR quick login: shows a QR, then waits (polling with the private poll secret) until a
 * signed-in phone approves it. onDone receives the same shape as a sign-in response.
 */
export default function QrLogin({ onDone, onCancel, compact = false }) {
  const [qr, setQr] = useState(null);
  const [state, setState] = useState("loading"); // loading | waiting | expired | denied | error
  const [error, setError] = useState(null);
  const [left, setLeft] = useState(QR_TTL_S);
  const alive = useRef(true);

  async function generate() {
    setState("loading");
    setError(null);
    const r = await Law.qrGenerate();
    if (!alive.current) return;
    if (!r.ok) {
      setError(authErrorMessage(r));
      return setState("error");
    }
    setQr(r.data);
    setLeft(QR_TTL_S);
    setState("waiting");
  }

  useEffect(() => {
    alive.current = true;
    generate();
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (state !== "waiting" || !qr) return;
    let timer;
    const tick = async () => {
      const r = await Law.qrStatus(qr.qrToken, qr.pollSecret);
      if (!alive.current) return;
      const status = r.data?.status;
      if (r.ok && status === "approved") {
        const outcome = await onDone({ ok: true, status: 200, data: r.data });
        if (outcome === false && alive.current) {
          // The token is consumed server-side; show a retry instead of waiting forever.
          setError(authErrorMessage({ ok: false, status: 500, data: {} }));
          setState("error");
        }
        return;
      }
      if (status === "expired" || r.status === 404) return setState("expired");
      if (status === "denied") return setState("denied");
      if (r.status === 403) {
        setError(authErrorMessage(r));
        return setState("error");
      }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => clearTimeout(timer);
  }, [state, qr]);

  // Compact (portal modal) mode shows a live 5-minute countdown and expires locally when it runs out.
  useEffect(() => {
    if (!compact || state !== "waiting") return;
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [compact, state, qr]);
  useEffect(() => {
    if (compact && state === "waiting" && left === 0) setState("expired");
  }, [compact, state, left]);
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {!compact && <h2 className="text-lg font-bold">{tr("تسجيل الدخول السريع عبر رمز QR")}</h2>}
      <ol className="list-inside list-decimal text-start text-sm leading-7" style={{ color: "var(--law-muted)" }}>
        <li>{tr("افتح {0} على هاتفك (حساب مسجَّل الدخول).", [brandName(lang())])}</li>
        <li>{tr("اذهب إلى الملف الشخصي ثم «مسح رمز QR للاتصال بالحاسوب».")}</li>
        <li>{tr("وجّه الكاميرا نحو هذا الرمز ثم وافق.")}</li>
      </ol>
      <div
        className="relative flex h-60 w-60 items-center justify-center rounded-2xl bg-white p-3"
        style={{ border: "1px solid var(--law-border)" }}
      >
        {qr?.svg && state !== "loading" ? (
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(qr.svg)}`}
            alt={tr("رمز QR لتسجيل الدخول")}
            className="h-full w-full"
            style={{ opacity: state === "waiting" ? 1 : 0.15 }}
          />
        ) : (
          <span className="text-sm text-gray-500">…</span>
        )}
        {(state === "expired" || state === "denied" || state === "error") && (
          <button
            type="button"
            onClick={generate}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 font-bold"
            style={{ color: "var(--law-primary)" }}
          >
            <ArrowsClockwise size={32} />
            {tr("رمز جديد")}
          </button>
        )}
      </div>
      {state === "waiting" && (
        <p role="status" className="text-sm" style={{ color: "var(--law-muted)" }}>
          {tr("في انتظار الموافقة من هاتفك…")}
        </p>
      )}
      {compact && state === "waiting" && (
        <p aria-hidden="true" className="text-sm" style={{ color: "var(--law-muted)" }}>
          <bdi dir="ltr">{clock}</bdi>
        </p>
      )}
      {state === "expired" && <Notice tone="warn">{tr("انتهت صلاحية الرمز (5 دقائق).")}</Notice>}
      {state === "denied" && <Notice tone="warn">{tr("تم رفض تسجيل الدخول من الهاتف.")}</Notice>}
      {error && <Notice tone="warn">{error}</Notice>}
      {!compact && (
        <Button type="button" variant="secondary" onClick={onCancel} className="w-full">
          {tr("الدخول بالبريد الإلكتروني وكلمة المرور")}
        </Button>
      )}
    </div>
  );
}
