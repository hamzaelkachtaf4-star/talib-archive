import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Law from "@/models/law";
import AuthLayout, { authErrorMessage } from "@/components/LawOS/Auth/AuthLayout";
import VerifyCode from "@/components/LawOS/Auth/VerifyCode";
import PasswordChecklist from "@/components/LawOS/Auth/PasswordChecklist";
import { Button, Field, Input } from "@/components/LawOS/ui";
import { startSession } from "@/components/LawOS/lib/session";
import { checkPassword } from "@/components/LawOS/lib/passwordPolicy";
import { tr } from "@/components/LawOS/lib/i18n";

/** Forgotten password: email → 6-digit code + new password (same policy as sign-up) → signed in. */
export default function Forgot() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function request(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await Law.forgotPassword(email.trim());
    setBusy(false);
    if (r.ok) return setSent(r.data);
    setError(authErrorMessage(r));
  }

  return (
    <AuthLayout
      title={tr("إعادة تعيين كلمة المرور")}
      subtitle={sent ? null : tr("أدخل بريدك الإلكتروني وسنرسل لك رمزاً لإعادة التعيين.")}
    >
      {sent ? (
        <VerifyCode
          email={sent.email}
          sent={sent}
          ready={checkPassword(password).ok}
          verify={(code) => Law.resetPassword({ email: sent.email, code, newPassword: password })}
          resend={() => Law.forgotPassword(sent.email)}
          onDone={async (r) => {
            await startSession(r.data);
            navigate("/law/today", { replace: true });
          }}
          onBack={() => setSent(null)}
          submitLabel={tr("تغيير كلمة المرور والدخول")}
        >
          <Field label={tr("كلمة المرور الجديدة")}>
            <Input
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={password}
              maxLength={64}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <PasswordChecklist password={password} />
        </VerifyCode>
      ) : (
        <form onSubmit={request} className="flex flex-col gap-4" noValidate>
          <Field label={tr("البريد الإلكتروني")}>
            <Input
              type="email"
              dir="ltr"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm" style={{ color: "var(--law-warn)" }}>
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !email.includes("@")}>
            {busy ? "…" : tr("أرسل الرمز")}
          </Button>
          <Link to="/law/login" className="text-center text-sm font-bold" style={{ color: "var(--law-primary)" }}>
            {tr("العودة إلى تسجيل الدخول")}
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
