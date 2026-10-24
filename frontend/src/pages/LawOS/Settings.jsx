import { useEffect, useState } from "react";
import { Forward } from "@/components/LawOS/kit/DirArrow";
import { Link } from "react-router-dom";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Law from "@/models/law";
import AiUsage from "@/components/LawOS/Settings/AiUsage";
import PushToggle from "@/components/LawOS/Settings/PushToggle";
import DevicePrefs from "@/components/LawOS/Settings/DevicePrefs";
import LanguagePicker from "@/components/LawOS/Settings/LanguagePicker";
import AccountSettings from "@/components/LawOS/Settings/AccountSettings";
import GoalSettings from "@/components/LawOS/Settings/GoalSettings";
import { PrivacySettings, NotificationSettings } from "@/components/LawOS/Settings/PrivacyNotifications";
import { useSignOut } from "@/components/LawOS/Settings/SignOut";
import Button3D from "@/components/LawOS/kit/Button3D";
import AiQuotaAdmin from "@/components/LawOS/Settings/AiQuotaAdmin";
import TimetableAdmin from "@/components/LawOS/Settings/TimetableAdmin";
import UserAdmin from "@/components/LawOS/Settings/UserAdmin";
import { useIsAdmin } from "@/components/LawOS/lib/useLawUser";
import { tr } from "@/components/LawOS/lib/i18n";

function Row({ label, children }) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-3"
      style={{ borderBottom: "1px solid var(--law-border)" }}
    >
      <span>{label}</span>
      <span className="font-semibold">{children}</span>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section
      className="mb-4 rounded-2xl px-4 py-2"
      style={{ background: "var(--law-surface)" }}
    >
      <h2
        className="pt-2 text-sm font-bold"
        style={{ color: "var(--law-muted)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

const yes = (v) => (
  <span style={{ color: v ? "var(--law-ok)" : "var(--law-warn)" }}>
    {v ? tr("يعمل") : tr("غير مفعّل")}
  </span>
);

export default function Settings() {
  const [health, setHealth] = useState(null);
  const [cfg, setCfg] = useState(null);
  const isAdmin = useIsAdmin();
  const signOut = useSignOut();

  useEffect(() => {
    if (isAdmin) Law.health().then(setHealth);
    Law.settings().then(setCfg);
  }, [isAdmin]);

  const offline = health?.offline || cfg?.offline;
  const checks = health?.data?.checks;
  const ai = cfg?.data?.config?.ai;

  return (
    <>
      <PageTitle sub={tr("اللغة والمظهر والصوت والإشعارات")}>
        {tr("الإعدادات")}
      </PageTitle>
      {offline && (
        <p className="mb-4 text-sm" style={{ color: "var(--law-warn)" }}>
          {tr("الخادم غير متاح الآن. ستظهر الإعدادات عند عودة الاتصال.")}
        </p>
      )}
      <Card title={tr("الحساب")}>
        <AccountSettings />
      </Card>
      <Card title={tr("اللغة")}>
        <LanguagePicker />
      </Card>
      <Card title={tr("المظهر والصوت")}>
        <DevicePrefs />
      </Card>
      <Card title={tr("الأهداف")}>
        {cfg?.data?.settings ? <GoalSettings settings={cfg.data.settings} /> : <p className="law-muted py-3 text-sm">…</p>}
      </Card>
      <Card title={tr("الخصوصية")}>
        <PrivacySettings />
      </Card>
      <Card title={tr("ذاكرتي")}>
        <Link to="/law/memory" className="block py-3 font-bold" style={{ color: "var(--law-primary)" }}>{tr("ما يتذكره التطبيق عنك: عرض وحذف وتصدير وإيقاف")}</Link>
      </Card>
      <Card title={tr("الإشعارات")}>
        <PushToggle />
        <NotificationSettings />
      </Card>
      <Card title={tr("السياسات")}>
        <div className="grid gap-2 py-3">
          <Link to="/law/legal" className="font-semibold">{tr("الإشعار القانوني")} · <bdi dir="ltr">Mentions légales</bdi></Link>
        </div>
      </Card>
      <Card title={tr("أدوات إضافية")}>
        <Row label={tr("التقاط محاضرة")}><Link to="/law/capture" className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("التقاط")}</Link></Row>
        <Row label={tr("فرق الدراسة")}><Link to="/law/community/squads" className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("فتح")}</Link></Row>
        <Row label={tr("المجتمع")}><Link to="/law/community" className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("فتح")}</Link></Row>
      </Card>
      <Card title={tr("المساعدة")}>
        <Row label={tr("الجدول الزمني")}><Link to="/law/timetable" className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("الجدول")}</Link></Row>
        <Row label={tr("الحساب والإحصاءات")}><Link to="/law/profile" className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("الملف الشخصي")}</Link></Row>
      </Card>
      {/* Server and AI details are for the admin only (admin-only, per the accounts plan). */}
      {isAdmin && (
        <>
          <Card title={tr("حالة الخادم")}>
            <Row label={tr("قاعدة البيانات")}>
              {checks ? yes(checks.db && checks.wal) : "…"}
            </Row>
            <Row label={tr("فهرس البحث")}>{checks ? yes(checks.fts) : "…"}</Row>
            <Row label={tr("المساحة الحرة")}>
              {checks?.disk ? (
                <bdi dir="ltr">
                  {(checks.disk.freeBytes / 1e9).toFixed(1)} GB
                </bdi>
              ) : (
                "…"
              )}
            </Row>
          </Card>
          <Card title={tr("الذكاء الاصطناعي")}>
            <Row label={<bdi dir="ltr">Gemini</bdi>}>
              {ai ? yes(ai.geminiEnabled) : "…"}
            </Row>
            <Row label={<bdi dir="ltr">DeepSeek</bdi>}>
              {ai ? yes(ai.deepseekEnabled) : "…"}
            </Row>
            {ai && !ai.geminiEnabled && !ai.deepseekEnabled && (
              <p
                className="py-3 text-sm leading-7"
                style={{ color: "var(--law-muted)" }}
              >
                {tr(
                  "يعمل التطبيق بدون ذكاء اصطناعي. أضف مفاتيح API الخاصة بالخادم في ملف الإعدادات لتفعيله."
                )}
              </p>
            )}
          </Card>
          <Card title={tr("استهلاك الذكاء الاصطناعي")}>
            {cfg?.data?.settings ? (
              <AiUsage settings={cfg.data.settings} />
            ) : (
              <p className="law-muted py-3 text-sm">…</p>
            )}
          </Card>
          <Card title={tr("الإشراف")}>
            <Link to="/law/admin/corrections" className="block py-3 font-bold" style={{ color: "var(--law-primary)" }}>{tr("أخطاء المساعد المبلَّغ عنها")}</Link>
            <Link to="/law/admin/concepts" className="block py-3 font-bold" style={{ color: "var(--law-primary)" }}>{tr("تصنيف المفاهيم وأزواج الخلط")}</Link>
            <Link to="/law/admin/moderation" className="block py-3 font-bold" style={{ color: "var(--law-primary)" }}>{tr("قائمة الإشراف على المنصة")}</Link>
          </Card>
          <Card title={tr("حصة الاستشارات القانونية")}>
            <AiQuotaAdmin />
          </Card>
          <Card title={tr("الجداول الرسمية")}>
            <TimetableAdmin />
          </Card>
          <Card title={tr("المستخدمون")}>
            {cfg?.data?.settings ? (
              <UserAdmin
                settings={cfg.data.settings}
                onSettings={(settings) =>
                  setCfg((c) => ({ ...c, data: { ...c.data, settings } }))
                }
              />
            ) : (
              <p className="law-muted py-3 text-sm">…</p>
            )}
          </Card>
          <Card title={tr("إعدادات متقدمة")}>
            <a
              href="/settings/llm-preference"
              className="block py-3 font-semibold"
              style={{ color: "var(--law-primary)" }}
            >
              {tr("إعدادات النظام المتقدمة")} <Forward />
            </a>
          </Card>
        </>
      )}
      <Button3D variant="danger" block onClick={signOut.ask} className="mb-6">{tr("تسجيل الخروج")}</Button3D>
      {signOut.sheet}
    </>
  );
}
