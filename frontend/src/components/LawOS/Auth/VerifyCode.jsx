import { useEffect, useState } from "react";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { Button, Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import CodeInput from "./CodeInput";
import { authErrorMessage } from "./AuthLayout";

function useCountdown(initial) {
  const [left, setLeft] = useState(initial || 0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft];
}

const clock = (s) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Step 2 of sign-up and of password reset: the 6-digit emailed code.
 * verify(code) and resend() return API results; children render extra fields (the new password on reset)
 * and `ready` says whether they are valid.
 */
export default function VerifyCode({
  email,
  sent,
  verify,
  resend,
  onDone,
  onBack,
  submitLabel,
  ready = true,
  children,
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [devCode, setDevCode] = useState(sent?.devCode || null);
  const [resendIn, setResendIn] = useCountdown(sent?.resendInSec ?? 60);
  const [lockedFor, setLockedFor] = useCountdown(0);

  async function submit(value = code) {
    if (value.length !== 6 || busy || lockedFor > 0 || !ready) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const r = await verify(value);
    setBusy(false);
    if (r.ok) return onDone(r);
    const e = r.data?.error;
    if (e === "invalid_code" && r.data?.attemptsLeft > 0)
      setError(tr("الرمز غير صحيح. تبقّى لك {0} محاولات.", [r.data.attemptsLeft]));
    else if (e === "invalid_code")
      setError(tr("الرمز غير صحيح. اطلب رمزاً جديداً."));
    else if (e === "code_expired")
      setError(tr("انتهت صلاحية الرمز. اطلب رمزاً جديداً."));
    else if (e === "locked") {
      setLockedFor(r.data?.retryAfterSec || 900);
      setError(tr("محاولات خاطئة كثيرة. تم إيقاف التحقق مؤقتاً لمدة 15 دقيقة."));
    } else setError(authErrorMessage(r));
    setCode("");
  }

  async function again() {
    setError(null);
    setInfo(null);
    const r = await resend();
    if (r.ok) {
      setResendIn(r.data?.resendInSec ?? 60);
      setDevCode(r.data?.devCode || null);
      setCode("");
      return setInfo(tr("أرسلنا رمزاً جديداً."));
    }
    if (r.data?.error === "cooldown") return setResendIn(r.data.retryAfterSec || 60);
    if (r.data?.error === "locked") return setLockedFor(r.data.retryAfterSec || 900);
    setError(authErrorMessage(r));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: "var(--law-surface-2)", color: "var(--law-primary)" }}
        >
          <EnvelopeSimple size={28} />
        </span>
        <p className="text-sm leading-7">
          {tr("أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى")}{" "}
          <bdi dir="ltr" className="font-bold">
            {email}
          </bdi>
        </p>
        <p className="text-xs" style={{ color: "var(--law-muted)" }}>
          {tr("الرمز صالح لمدة 10 دقائق.")}
        </p>
      </div>
      {devCode && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-3 text-center text-xs">
          <p>
            {tr("وضع التطوير / الاختبار: البريد الصادر غير مُهيأ في .env. الرمز هو:")}{" "}
            <bdi dir="ltr" className="font-mono text-base font-bold text-amber-300">
              {devCode}
            </bdi>
          </p>
          <button
            type="button"
            onClick={() => {
              setCode(devCode);
              submit(devCode);
            }}
            className="rounded-lg bg-amber-600/30 px-3 py-1 font-bold text-amber-200 ring-1 ring-amber-500/50 hover:bg-amber-600/50"
          >
            {tr("تعبئة وتأكيد الرمز تلقائياً")}
          </button>
        </div>
      )}
      {sent && !sent.delivered && !devCode && (
        <Notice tone="warn">
          {tr("البريد غير مُعَدّ على الخادم بعد: اطلب الرمز من المسؤول.")}
        </Notice>
      )}
      <CodeInput
        value={code}
        onChange={setCode}
        onComplete={(c) => ready && submit(c)}
        disabled={busy || lockedFor > 0}
      />
      {children}
      {error && (
        <p role="alert" className="text-center text-sm leading-7" style={{ color: "var(--law-warn)" }}>
          {error}
          {lockedFor > 0 && (
            <>
              {" "}
              <bdi dir="ltr">{clock(lockedFor)}</bdi>
            </>
          )}
        </p>
      )}
      {info && (
        <p role="status" className="text-center text-sm" style={{ color: "var(--law-ok)" }}>
          {info}
        </p>
      )}
      <Button
        type="button"
        onClick={() => submit()}
        disabled={busy || code.length !== 6 || lockedFor > 0 || !ready}
      >
        {busy ? "…" : submitLabel}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onBack}
          className="font-semibold"
          style={{ color: "var(--law-muted)" }}
        >
          {tr("تغيير البريد الإلكتروني")}
        </button>
        <button
          type="button"
          onClick={again}
          disabled={resendIn > 0 || lockedFor > 0}
          className="font-bold disabled:opacity-60"
          style={{ color: "var(--law-primary)" }}
        >
          {resendIn > 0 ? (
            <>
              {tr("إعادة الإرسال بعد")} <bdi dir="ltr">{clock(resendIn)}</bdi>
            </>
          ) : (
            tr("لم يصلك الرمز؟ أعد الإرسال")
          )}
        </button>
      </div>
    </div>
  );
}
