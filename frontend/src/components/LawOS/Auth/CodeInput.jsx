import { useEffect, useRef } from "react";
import { toWesternDigits } from "@/components/LawOS/lib/digits";

/**
 * Six one-digit boxes: auto-advance, backspace to the previous box, paste of the whole code anywhere,
 * Arabic-Indic digits accepted. Always left-to-right. Calls onComplete(code) when all six are filled.
 */
export default function CodeInput({ value, onChange, onComplete, disabled, autoFocus = true }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function setAt(i, text) {
    const clean = toWesternDigits(text).replace(/\D/g, "");
    if (!clean) return;
    const next = [...digits];
    for (let k = 0; k < clean.length && i + k < 6; k++) next[i + k] = clean[k];
    const code = next.join("");
    onChange(code);
    const focusAt = Math.min(5, i + clean.length);
    refs.current[focusAt]?.focus();
    if (code.length === 6 && !next.includes("")) onComplete?.(code);
  }

  function onKeyDown(i, e) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) next[i] = "";
      else if (i > 0) {
        next[i - 1] = "";
        refs.current[i - 1]?.focus();
      }
      onChange(next.join(""));
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  }

  return (
    <div dir="ltr" className="flex justify-center gap-2" role="group">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={6}
          aria-label={`${i + 1} / 6`}
          className="law-input h-14 w-11 text-center text-2xl font-bold tabular-nums"
          onChange={(e) => setAt(i, e.target.value.slice(-6))}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => {
            e.preventDefault();
            setAt(0, e.clipboardData.getData("text"));
          }}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
