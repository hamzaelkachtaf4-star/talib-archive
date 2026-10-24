import { useEffect, useState } from "react";
import Law from "@/models/law";
import { Button } from "@/components/LawOS/ui";
import { useLawUser } from "@/components/LawOS/lib/useLawUser";
import { tr } from "@/components/LawOS/lib/i18n";

/** Admin only: accounts, roles, suspension, and whether new students may register. */
export default function UserAdmin({ settings, onSettings }) {
  const me = useLawUser();
  const [users, setUsers] = useState(null);
  const load = () =>
    Law.adminUsers().then((r) => r.ok && setUsers(r.data.users));
  useEffect(() => {
    load();
  }, []);

  async function update(id, body) {
    const r = await Law.adminUpdateUser(id, body);
    if (r.ok) load();
  }

  async function toggleRegistration() {
    const r = await Law.updateSettings({
      registrationOpen: !settings.registrationOpen,
    });
    if (r.ok) onSettings(r.data.settings);
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span>
          {tr("التسجيل:")}{" "}
          <strong>
            {settings.registrationOpen ? tr("مفتوح") : tr("مغلق")}
          </strong>
        </span>
        <Button variant="secondary" onClick={toggleRegistration}>
          {settings.registrationOpen ? tr("إغلاق التسجيل") : tr("فتح التسجيل")}
        </Button>
      </div>
      {!users && <p className="law-muted text-sm">…</p>}
      {users?.map((u) => (
        <div
          key={u.id}
          className="flex flex-wrap items-center justify-between gap-2 py-2"
          style={{ borderTop: "1px solid var(--law-border)" }}
        >
          <div className="min-w-0">
            <p className="font-semibold">{u.fullName}</p>
            <p className="text-xs" style={{ color: "var(--law-muted)" }}>
              <bdi dir="ltr">{u.email || u.username}</bdi>
              {" · "}
              {u.role === "admin" ? tr("مسؤول") : tr("طالب")}
              {u.suspended && tr("· موقوف")}
            </p>
          </div>
          {u.id !== me?.id && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  update(u.id, {
                    role: u.role === "admin" ? "default" : "admin",
                  })
                }
              >
                {u.role === "admin" ? tr("إلغاء الإشراف") : tr("جعله مسؤولاً")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => update(u.id, { suspended: !u.suspended })}
              >
                {u.suspended ? tr("إعادة التفعيل") : tr("إيقاف")}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
