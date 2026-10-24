import { Check, X } from "@phosphor-icons/react";
import {
  checkPassword,
  passwordStrength,
} from "@/components/LawOS/lib/passwordPolicy";
import { tr } from "@/components/LawOS/lib/i18n";

const LABELS = {
  length: () => tr("من 8 إلى 64 حرفاً"),
  upper: () => tr("حرف كبير واحد على الأقل (A-Z)"),
  lower: () => tr("حرف صغير واحد على الأقل (a-z)"),
  digit: () => tr("رقم واحد على الأقل (0-9)"),
  special: () => tr("رمز خاص واحد على الأقل (!@#$%^&*…)"),
};

const STRENGTH = [
  null,
  { label: () => tr("ضعيفة"), color: "var(--law-warn)", width: "33%" },
  { label: () => tr("متوسطة"), color: "var(--law-accent)", width: "66%" },
  { label: () => tr("قوية"), color: "var(--law-ok)", width: "100%" },
];

/** Live password rules and a Faible / Moyen / Fort meter (rules mirror the server's). */
export default function PasswordChecklist({ password }) {
  const { failed } = checkPassword(password);
  const level = STRENGTH[passwordStrength(password)];
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full"
          style={{ background: "var(--law-surface-2)" }}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={3}
          aria-valuenow={passwordStrength(password)}
          aria-label={tr("قوة كلمة المرور")}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: level?.width || "0%",
              background: level?.color,
            }}
          />
        </div>
        <span
          className="min-w-14 text-xs font-bold"
          style={{ color: level?.color || "var(--law-muted)" }}
        >
          {level ? level.label() : "—"}
        </span>
      </div>
      <ul className="grid gap-1 text-xs">
        {Object.entries(LABELS).map(([rule, label]) => {
          const ok = !!password && !failed.includes(rule);
          return (
            <li
              key={rule}
              className="flex items-center gap-2"
              style={{ color: ok ? "var(--law-ok)" : "var(--law-muted)" }}
            >
              {ok ? (
                <Check size={14} weight="bold" aria-label={tr("محقَّق")} />
              ) : (
                <X size={14} aria-label={tr("غير محقَّق")} />
              )}
              <span>{label()}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
