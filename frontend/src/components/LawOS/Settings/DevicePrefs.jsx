import { useState } from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import { getTheme, setTheme, soundOn, setSound, playSound } from "@/components/LawOS/lib/prefs";
import { pushPrefs } from "@/components/LawOS/lib/prefsSync";
import { tr } from "@/components/LawOS/lib/i18n";

// Dark Navy is the default; the device colour scheme never decides (Brain L-0049), so there is no "automatic" choice.
const THEME_OPTIONS = [
  ["dark", tr("داكن (الافتراضي)"), Moon],
  ["light", tr("فاتح"), Sun],
];

/** Theme and sound, stored on this device. */
export default function DevicePrefs() {
  const [theme, setThemeState] = useState(getTheme() === "light" ? "light" : "dark");
  const [sound, setSoundState] = useState(soundOn());
  return (
    <div className="flex flex-col gap-4 py-3">
      <div>
        <p className="mb-2 text-sm">{tr("المظهر")}</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tr("المظهر")}>
          {THEME_OPTIONS.map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => {
                setTheme(value);
                pushPrefs({ theme: value });
                setThemeState(value);
              }}
              className="flex flex-col items-center gap-1 rounded-xl py-3 text-sm font-semibold"
              style={
                theme === value
                  ? { background: "var(--law-primary)", color: "var(--law-on-primary)" }
                  : { background: "var(--law-surface-2)" }
              }
            >
              <Icon size={22} />
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between gap-4">
        <span className="text-sm">{tr("أصوات المراجعة")}</span>
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={sound}
          onChange={(e) => {
            setSound(e.target.checked);
            pushPrefs({ soundEnabled: e.target.checked });
            setSoundState(e.target.checked);
            if (e.target.checked) playSound("good");
          }}
        />
      </label>
    </div>
  );
}
