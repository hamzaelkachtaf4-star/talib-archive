export default function Card3D({ as: Tag = "div", interactive = false, className = "", children, ...rest }) {
  return <Tag className={`law-card3d ${className}`.trim()} data-interactive={interactive || undefined} {...rest}>{children}</Tag>;
}
