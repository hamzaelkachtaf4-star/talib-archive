import { forwardRef } from "react";
import { Link } from "react-router-dom";

/** Tactile 3D button. variant: brand | accent | neutral | danger | gold. Renders <Link> when `to` is set. */
const Button3D = forwardRef(function Button3D({ variant = "brand", block = false, to, className = "", children, type = "button", ...rest }, ref) {
  const props = { ref, className: `law-btn3d ${className}`.trim(), "data-variant": variant === "brand" ? undefined : variant, "data-block": block || undefined, ...rest };
  if (to) return <Link to={to} {...props}>{children}</Link>;
  return <button type={type} {...props}>{children}</button>;
});
export default Button3D;
