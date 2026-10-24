import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Law from "@/models/law";
import { Button, Field, Input } from "@/components/LawOS/ui";
import { useLawUser } from "@/components/LawOS/lib/useLawUser";
import {
  cacheUser,
} from "@/components/LawOS/lib/session";
import { authErrorMessage } from "@/components/LawOS/Auth/AuthLayout";
import { tr } from "@/components/LawOS/lib/i18n";
import PasswordChecklist from "@/components/LawOS/Auth/PasswordChecklist";
import { checkPassword } from "@/components/LawOS/lib/passwordPolicy";

/** Name and password of the signed-in account (Settings → Account). */
export default function AccountSettings() {
  const user = useLawUser();
  const [profile, setProfile] = useState({
    fullName: user?.fullName || "",
    university: user?.university || "",
    section: user?.section || "",
  });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState(null);
  const [ac, setAc] = useState(null);
  useEffect(() => { Law.myAcademic().then((r) => r.ok && setAc(r.data.academic)); }, []);

  async function saveProfile() {
    const r = await Law.updateMe(profile);
    if (r.ok) cacheUser(r.data.user);
    setMsg(r.ok ? tr("تم الحفظ.") : authErrorMessage(r));
  }

  async function savePassword() {
    const r = await Law.changePassword(pw);
    setMsg(r.ok ? tr("تم تغيير كلمة المرور.") : authErrorMessage(r));
    if (r.ok) setPw({ currentPassword: "", newPassword: "" });
  }

  if (!user) return null;
  return (
    <div className="flex flex-col gap-4 py-3">
      <p className="text-sm" style={{ color: "var(--law-muted)" }}>
        <bdi dir="ltr">{user.email}</bdi>
        {user.role === "admin" && tr("· مسؤول")}
        {user.googleLinked && tr("· مرتبط بـ Google")}
      </p>
      {(
        <div className="rounded-2xl p-3 text-sm" style={{ background: "var(--law-surface-2)", border: "1px solid var(--law-border)" }}>
          <p className="mb-1 font-bold">{tr("ملفي الدراسي")}</p>
          <p style={{ color: "var(--law-muted)" }}>
            {[ac?.facultyCode, ac?.track, ac?.semester, ac?.groupCode].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && " · "}<bdi dir="ltr">{x}</bdi></span>)}
            {!ac?.facultyCode && tr("لم يكتمل بعد")}
          </p>
          <Link to="/law/welcome?condensed=1" className="mt-1 inline-block font-bold" style={{ color: "var(--law-accent)" }}>{tr("تعديل الملف الدراسي")}</Link>
        </div>
      )}
      <Field label={tr("الاسم الكامل")}>
        <Input
          value={profile.fullName}
          onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
        />
      </Field>
      <Field label={tr("الجامعة / الكلية")}>
        <Input
          dir="auto"
          value={profile.university}
          onChange={(e) =>
            setProfile({ ...profile, university: e.target.value })
          }
        />
      </Field>
      <Field label={tr("الفصل / الفوج")}>
        <Input
          dir="auto"
          value={profile.section}
          onChange={(e) => setProfile({ ...profile, section: e.target.value })}
        />
      </Field>
      <Button variant="secondary" onClick={saveProfile} className="self-start">
        {tr("حفظ الملف الشخصي")}
      </Button>
      <Field label={tr("كلمة المرور الحالية")}>
        <Input
          type="password"
          dir="ltr"
          autoComplete="current-password"
          value={pw.currentPassword}
          onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
        />
      </Field>
      <Field label={tr("كلمة المرور الجديدة")}>
        <Input
          type="password"
          dir="ltr"
          autoComplete="new-password"
          maxLength={64}
          value={pw.newPassword}
          onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
        />
      </Field>
      {pw.newPassword && <PasswordChecklist password={pw.newPassword} />}
      <Button
        variant="secondary"
        onClick={savePassword}
        disabled={!pw.currentPassword || !checkPassword(pw.newPassword).ok}
        className="self-start"
      >
        {tr("تغيير كلمة المرور")}
      </Button>
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
    </div>
  );
}
