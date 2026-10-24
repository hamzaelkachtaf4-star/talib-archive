/** Initials avatar; Phase 3 swaps in the layered AvatarBuilder via `src`. */
export default function Avatar({ name = "", src, size = 40, className = "" }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (w) => [...w.normalize("NFC")].find((c) => /\p{L}/u.test(c)) || "";
  const initials = (words.length > 1 ? letters(words[0]) + letters(words[1]) : letters(words[0] || "")) || "؟";
  const style = { inlineSize: size, blockSize: size, borderRadius: "50%", flex: "none" };
  if (src) return <img src={src} alt={name} style={{ ...style, objectFit: "cover" }} className={className} />;
  return <span role="img" aria-label={name || undefined} className={`grid place-items-center font-bold ${className}`} style={{ ...style, background: "var(--law-surface-2)", border: "1px solid var(--law-border)" }}>{initials}</span>;
}
