import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button3D from "@/components/LawOS/kit/Button3D";
import Sheet from "@/components/LawOS/kit/Sheet";
import { endSession, pendingCount } from "@/components/LawOS/lib/session";
import { tr } from "@/components/LawOS/lib/i18n";

/** Sign-out with a confirm sheet. Offline data stays on the device unless the student ticks the box. */
export function useSignOut() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [wipe, setWipe] = useState(false);
  const ask = async () => {
    setPending(await pendingCount());
    setWipe(false);
    setOpen(true);
  };
  const confirm = async () => {
    await endSession({ removeOfflineData: wipe });
    navigate("/law/login", { replace: true });
  };
  const sheet = (
    <Sheet open={open} onClose={() => setOpen(false)} title={tr("تسجيل الخروج؟")}>
      <div className="grid gap-4">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} className="mt-1" />
          <span>{tr("احذف بياناتي غير المتصلة من هذا الجهاز")}</span>
        </label>
        {wipe && pending > 0 && (
          <p role="alert" className="text-sm" style={{ color: "var(--law-warn)" }}>
            {tr("لديك {0} عنصر لم يُرفع بعد إلى الخادم وسيُحذف من هذا الجهاز.", [pending])}
          </p>
        )}
        <div className="flex gap-3">
          <Button3D variant="danger" onClick={confirm}>{tr("تسجيل الخروج")}</Button3D>
          <Button3D variant="neutral" onClick={() => setOpen(false)}>{tr("إلغاء")}</Button3D>
        </div>
      </div>
    </Sheet>
  );
  return { ask, sheet };
}
