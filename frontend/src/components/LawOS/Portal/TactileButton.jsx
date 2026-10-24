import { forwardRef } from "react";
import { Link } from "react-router-dom";

/**
 * Duolingo-style tactile button: a solid face with a darker bottom edge that depresses on press.
 * Renders a <button>, an <a> (href) or a router <Link> (to). Pressing gives a tiny haptic tick where supported.
 */
const TactileButton = forwardRef(function TactileButton(
  { variant = "primary", size = "lg", block = false, to, href, className = "", onClick, children, ...rest },
  ref,
) {
  const cls = `tactile tactile-${variant} tactile-${size}${block ? " tactile-block" : ""} ${className}`.trim();
  const tick = (e) => {
    try {
      navigator.vibrate?.(8);
    } catch {}
    onClick?.(e);
  };
  if (to) return <Link ref={ref} to={to} className={cls} onClick={tick} {...rest}>{children}</Link>;
  if (href) return <a ref={ref} href={href} className={cls} onClick={tick} {...rest}>{children}</a>;
  return (
    <button ref={ref} type="button" className={cls} onClick={tick} {...rest}>
      {children}
    </button>
  );
});

export default TactileButton;
