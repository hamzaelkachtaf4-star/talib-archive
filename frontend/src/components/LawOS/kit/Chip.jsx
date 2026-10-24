export default function Chip({ active = false, onClick, className = "", children, ...rest }) {
  const Tag = onClick ? "button" : "span";
  return <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`law-chip ${className}`.trim()} data-active={active || undefined} aria-pressed={onClick && rest.role !== "tab" ? active : undefined} {...rest}>{children}</Tag>;
}
