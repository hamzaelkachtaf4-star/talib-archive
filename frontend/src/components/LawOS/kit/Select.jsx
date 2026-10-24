/** Native select styled as a .law-input (best mobile UX, RTL-safe). options: [{ value, label }] */
export default function Select({ value, onChange, options, label, className = "", ...rest }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange?.(e.target.value)} className={`law-input ${className}`.trim()} {...rest}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
