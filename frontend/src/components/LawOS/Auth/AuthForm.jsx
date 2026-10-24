import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Law from "@/models/law";
import { Button, Field, Input, Notice } from "@/components/LawOS/ui";
import { startSession } from "@/components/LawOS/lib/session";
import GoogleButton from "./GoogleButton";
import FacebookButton from "./FacebookButton";
import { authErrorMessage } from "./AuthLayout";
import { tr, lang } from "@/components/LawOS/lib/i18n";
import { brandName } from "@/config/brand";
import { checkPassword } from "@/components/LawOS/lib/passwordPolicy";
import PasswordChecklist from "./PasswordChecklist";
import VerifyCode from "./VerifyCode";
import QrLogin from "./QrLogin";

const DEFAULT_UNIVERSITY = "FSJES Aïn Chock";
const DEFAULT_SECTION = "S3 Droit privé G01";

/** Only same-app paths are accepted as the post-login destination (no open redirect). */
function safeNext(next) {
  return typeof next === "string" && /^\/law\/[\w\-/?=&%.]*$/.test(next)
    ? next
    : "/law/today";
}

export function useAuthConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    Law.authConfig().then((r) => setConfig(r.ok ? r.data : { offline: true }));
  }, []);
  return config;
}

/**
 * mode: "login" | "register" | "setup". Submits, stores the session and continues into the app.
 */
export default function AuthForm({ mode }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Phase C: invite link /law/register?ref=INV-XXXXXX (kept for a Google sign-up too).
  const referralCode = params.get("ref") || null;
  useEffect(() => {
    if (!referralCode) return;
    try {
      sessionStorage.setItem("qanouni_ref", referralCode);
    } catch {}
  }, [referralCode]);
  const config = useAuthConfig();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirm: "",
    university: DEFAULT_UNIVERSITY,
    section: DEFAULT_SECTION,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Sign-up step 2: the server answered 202 and emailed a code.
  const [pending, setPending] = useState(null);
  const [qr, setQr] = useState(false);
  const [googleDown, setGoogleDown] = useState(false);
  const isMobile =
    typeof window !== "undefined" &&
    (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      window.innerWidth < 768);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!config || config.offline) return;
    if (config.setupRequired && mode !== "setup")
      navigate("/law/setup", { replace: true });
    if (!config.setupRequired && mode === "setup")
      navigate("/law/login", { replace: true });
  }, [config, mode]);

  async function finish(r) {
    if (!r.ok || !r.data?.token) return setError(authErrorMessage(r));
    await startSession(r.data);
    navigate(safeNext(params.get("next")), { replace: true });
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (mode !== "login" && !checkPassword(form.password).ok)
      return setError(tr("كلمة المرور لا تستوفي الشروط أدناه."));
    if (mode !== "login" && form.password !== form.confirm)
      return setError(tr("كلمتا المرور غير متطابقتين."));
    setBusy(true);
    const body =
      mode === "login"
        ? { email: form.email, password: form.password }
        : {
            fullName: form.fullName,
            email: form.email,
            password: form.password,
            university: form.university || undefined,
            section: form.section || undefined,
            ...(mode === "register" && referralCode ? { referralCode } : {}),
          };
    const r = await (mode === "login"
      ? Law.login(body)
      : mode === "register"
        ? Law.register(body)
        : Law.setup(body));
    setBusy(false);
    if (mode === "register" && r.status === 202) return setPending(r.data);
    await finish(r);
  }

  const showGoogle = mode !== "setup" && config?.googleClientId;
  const showFacebook = mode !== "setup" && !!config?.facebookAppId;
  const closed = mode === "register" && config && !config.registrationOpen;

  if (pending)
    return (
      <VerifyCode
        email={pending.email}
        sent={pending}
        verify={(code) => Law.verifyRegistration({ email: pending.email, code })}
        resend={() => Law.resendRegistration(pending.email)}
        onDone={finish}
        onBack={() => setPending(null)}
        submitLabel={tr("تأكيد وإنشاء الحساب")}
      />
    );

  if (qr) return <QrLogin onDone={finish} onCancel={() => setQr(false)} />;

  return (
    <>
      {config?.offline && (
        <Notice tone="warn">
          {tr(
            "لا يوجد اتصال بالخادم. تحقّق من الإنترنت أو من تفعيل Tailscale."
          )}
        </Notice>
      )}
      {closed && <Notice tone="warn">{tr("التسجيل مغلق حالياً.")}</Notice>}
      {mode === "register" && referralCode && !closed && (
        <Notice tone="ok">{tr("دعاك زميل إلى {0}. مرحباً بك!", [brandName(lang())])}</Notice>
      )}
      {(showGoogle || showFacebook) && (
        <div className="flex flex-col gap-2.5">
          {showGoogle && (
            <GoogleButton
              clientId={config.googleClientId}
              onResult={finish}
              onError={() => setGoogleDown(true)}
            />
          )}
          {showGoogle && googleDown && (
            <Notice tone="warn">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>{tr("تسجيل الدخول عبر البريد أو رمز الهاتف متاح فوراً")}</span>
                <button
                  type="button"
                  className="font-bold underline"
                  onClick={() =>
                    mode === "login" && config?.multiUser && !isMobile
                      ? setQr(true)
                      : document.getElementById("auth-email")?.focus()
                  }
                >
                  {mode === "login" && config?.multiUser && !isMobile
                    ? tr("مسح رمز الهاتف")
                    : tr("المتابعة بالبريد")}
                </button>
              </span>
            </Notice>
          )}
          {showFacebook && (
            <FacebookButton appId={config.facebookAppId} onResult={finish} />
          )}
          <div
            className="flex items-center gap-3 text-xs"
            style={{ color: "var(--law-muted)" }}
          >
            <span
              className="h-px flex-1"
              style={{ background: "var(--law-border)" }}
            />
            {tr("أو بالبريد الإلكتروني")}
            <span
              className="h-px flex-1"
              style={{ background: "var(--law-border)" }}
            />
          </div>
        </div>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {mode !== "login" && (
          <Field label={tr("الاسم الكامل")}>
            <Input
              value={form.fullName}
              onChange={set("fullName")}
              autoComplete="name"
              required
              maxLength={120}
            />
          </Field>
        )}
        <Field label={tr("البريد الإلكتروني")}>
          <Input
            id="auth-email"
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
            required
          />
        </Field>
        <Field
          label={tr("كلمة المرور")}
        >
          <Input
            type="password"
            dir="ltr"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            value={form.password}
            onChange={set("password")}
            required
            minLength={mode === "login" ? undefined : 8}
            maxLength={mode === "login" ? undefined : 64}
          />
        </Field>
        {mode !== "login" && <PasswordChecklist password={form.password} />}
        {mode === "login" && (
          <Link
            to="/law/forgot"
            className="-mt-2 self-end text-xs font-semibold"
            style={{ color: "var(--law-primary)" }}
          >
            {tr("نسيت كلمة المرور؟")}
          </Link>
        )}
        {mode !== "login" && (
          <>
            <Field label={tr("تأكيد كلمة المرور")}>
              <Input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={form.confirm}
                onChange={set("confirm")}
                required
              />
            </Field>
            <Field label={tr("الجامعة / الكلية")}>
              <Input
                dir="auto"
                value={form.university}
                onChange={set("university")}
                maxLength={160}
              />
            </Field>
            <Field label={tr("الفصل / الفوج")}>
              <Input
                dir="auto"
                value={form.section}
                onChange={set("section")}
                maxLength={160}
              />
            </Field>
          </>
        )}
        {error && (
          <p
            role="alert"
            className="text-sm leading-7"
            style={{ color: "var(--law-warn)" }}
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || closed || config?.offline}>
          {busy
            ? "…"
            : mode === "login"
              ? tr("تسجيل الدخول")
              : mode === "register"
                ? tr("إنشاء الحساب")
                : tr("إنشاء حساب المسؤول")}
        </Button>
      </form>
      {/* The computer shows the QR; a phone that is already signed in scans it (Profile → scan). A signed-out
          phone has nothing to approve with, so it never offers QR here. */}
      {mode === "login" && config?.multiUser && !isMobile && (
        <Button type="button" variant="secondary" onClick={() => setQr(true)}>
          {tr("تسجيل الدخول السريع عبر رمز QR")}
        </Button>
      )}
      {mode === "login" && config?.registrationOpen && (
        <p className="text-center text-sm">
          {tr("ليس لديك حساب؟")}{" "}
          <Link
            to={`/law/register${window.location.search}`}
            className="font-bold"
            style={{ color: "var(--law-primary)" }}
          >
            {tr("أنشئ حساباً")}
          </Link>
        </p>
      )}
      {mode === "register" && (
        <p className="text-center text-sm">
          {tr("لديك حساب؟")}{" "}
          <Link
            to={`/law/login${window.location.search}`}
            className="font-bold"
            style={{ color: "var(--law-primary)" }}
          >
            {tr("سجّل الدخول")}
          </Link>
        </p>
      )}
    </>
  );
}
