// Device preferences for Qanouni (technical settings): theme and sounds. Stored on the device only.
const THEME_KEY = "qanouni_theme"; // system | light | dark
const SOUND_KEY = "qanouni_sound"; // on | off

function read(key, allowed, fallback) {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export const THEMES = ["system", "light", "dark"];

export function getTheme() {
  return read(THEME_KEY, THEMES, "dark"); // Talib (L-0049): Dark Navy is the default; the OS colour scheme never switches it
}

/** Applies the theme to <html> (lawos.css reads data-law-theme). */
export function applyTheme(theme = getTheme()) {
  const html = document.documentElement;
  html.setAttribute("data-law-theme", theme === "light" ? "light" : "dark"); // "system" is not followed: it means the default (dark)
}

export const THEME_EVENT = "lawos-theme";

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  write(THEME_KEY, theme);
  applyTheme(theme);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(THEME_EVENT)); // header toggle and menu stay in step
}

// Apply as soon as the module loads so the first paint is already in the chosen theme.
if (typeof document !== "undefined") applyTheme();

export function soundOn() {
  return read(SOUND_KEY, ["on", "off"], "on") === "on";
}

export function setSound(on) {
  write(SOUND_KEY, on ? "on" : "off");
}

let ctx = null;
const TONES = {
  good: [[660, 0.08], [880, 0.12]],
  again: [[300, 0.14]],
  levelUp: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.2]],
};

/** A short feedback chime (Web Audio, no files). Silent when sounds are off or audio is unavailable. */
export function playSound(kind = "good") {
  if (!soundOn()) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    let t = ctx.currentTime;
    for (const [freq, dur] of TONES[kind] || TONES.good) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur;
    }
  } catch {}
}
