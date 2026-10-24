import { tr } from "@/components/LawOS/lib/i18n";
// Small shared UI primitives for LAW-OS screens. Styling lives in lawos.css (CSS variables, dark mode).

export function Button({ variant = "primary", className = "", ...props }) {
  return (
    <button
      type="button"
      className={`law-btn law-btn-${variant} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", ...props }) {
  return <div className={`law-card ${className}`} {...props} />;
}

export function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="law-muted text-xs">{hint}</span>}
    </label>
  );
}

export function Input(props) {
  return <input className="law-input" {...props} />;
}

export function Textarea(props) {
  return <textarea className="law-input" {...props} />;
}

export function Select({ options, ...props }) {
  return (
    <select className="law-input" {...props}>
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function Notice({ tone = "muted", children }) {
  const color =
    tone === "warn"
      ? "var(--law-warn)"
      : tone === "ok"
        ? "var(--law-ok)"
        : "var(--law-muted)";
  return (
    <p className="my-3 text-sm leading-7" style={{ color }}>
      {children}
    </p>
  );
}

export const ORIGIN_LABELS = {
  failed_retrieval: tr("خطأ في الاسترجاع"),
  prof_emphasis: tr("تأكيد الأستاذ"),
  definition: tr("تعريف"),
  elements_list: tr("شروط / عناصر"),
  deadline: tr("أجل / رقم"),
  manual: tr("يدوي"),
  squad: tr("بطاقة الفرقة"),
};

export const TYPE_LABELS = {
  basic: tr("عادية"),
  cloze: tr("ملء الفراغ"),
  qualification: tr("تكييف"),
};

export const WEEKDAYS = [
  "",
  tr("الإثنين"),
  tr("الثلاثاء"),
  tr("الأربعاء"),
  tr("الخميس"),
  tr("الجمعة"),
  tr("السبت"),
  tr("الأحد"),
];
