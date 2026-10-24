import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Desktop, CheckCircle, XCircle } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Card, Notice } from "@/components/LawOS/ui";
import { PageTitle } from "@/components/LawOS/EmptyState";
import { useLawUser } from "@/components/LawOS/lib/useLawUser";
import { authErrorMessage } from "@/components/LawOS/Auth/AuthLayout";
import { tr } from "@/components/LawOS/lib/i18n";

/** Signed-in side of QR quick login: confirm (or refuse) signing in the device that shows the QR. */
export default function QrApprove() {
  const { token } = useParams();
  const user = useLawUser();
  const [info, setInfo] = useState(null);
  const [result, setResult] = useState(null); // approved | denied
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Law.qrInspect(token).then((r) => (r.ok ? setInfo(r.data) : setError(authErrorMessage(r))));
  }, [token]);

  async function decide(approve) {
    setBusy(true);
    const r = await Law.qrAuthorize(token, approve);
    setBusy(false);
    if (!r.ok) return setError(authErrorMessage(r));
    setResult(approve ? "approved" : "denied");
  }

  return (
    <>
      <PageTitle>{tr("تسجيل الدخول على جهاز آخر")}</PageTitle>
      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        {result === "approved" ? (
          <>
            <CheckCircle size={56} style={{ color: "var(--law-ok)" }} />
            <p className="font-bold">{tr("تم تسجيل الدخول على الجهاز الآخر.")}</p>
          </>
        ) : result === "denied" ? (
          <>
            <XCircle size={56} style={{ color: "var(--law-warn)" }} />
            <p className="font-bold">{tr("تم رفض الطلب.")}</p>
          </>
        ) : error ? (
          <Notice tone="warn">{error}</Notice>
        ) : !info ? (
          <p className="law-muted">…</p>
        ) : (
          <>
            <Desktop size={56} style={{ color: "var(--law-primary)" }} />
            <p className="leading-8">
              {tr("هل تريد تسجيل الدخول إلى حسابك على هذا الجهاز؟")}
              <br />
              <bdi dir="ltr" className="font-bold">
                {info.requesterAgent || tr("جهاز غير معروف")}
              </bdi>
            </p>
            <p className="text-sm" style={{ color: "var(--law-muted)" }}>
              {tr("الحساب:")} <bdi>{user?.fullName}</bdi> · <bdi dir="ltr">{user?.email}</bdi>
            </p>
            <Notice tone="warn">{tr("وافق فقط إذا كان الجهاز أمامك وأنت من عرض الرمز.")}</Notice>
            <div className="grid w-full grid-cols-2 gap-3">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => decide(false)}>
                {tr("رفض")}
              </Button>
              <Button type="button" disabled={busy} onClick={() => decide(true)}>
                {tr("موافقة")}
              </Button>
            </div>
          </>
        )}
        <Link to="/law/profile" className="text-sm font-bold" style={{ color: "var(--law-primary)" }}>
          {tr("العودة إلى الملف الشخصي")}
        </Link>
      </Card>
    </>
  );
}
