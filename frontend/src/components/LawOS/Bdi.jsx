import { toWesternDigits } from "./lib/digits";

/**
 * Isolates a Latin-script legal term (e.g. "la responsabilité délictuelle") inside Arabic text so
 * punctuation and neighbouring numbers do not reorder.
 */
export function Fr({ children, className = "" }) {
  return (
    <bdi dir="ltr" lang="fr" className={`law-fr ${className}`}>
      {children}
    </bdi>
  );
}

/**
 * An article number such as "77", "٧٧" or "88-1", always shown with Western digits and isolated
 * so "88-1" never renders as "1-88" in RTL.
 */
export function ArticleNum({ value, className = "" }) {
  return (
    <bdi dir="ltr" className={`law-fr tabular-nums ${className}`}>
      {toWesternDigits(value)}
    </bdi>
  );
}
