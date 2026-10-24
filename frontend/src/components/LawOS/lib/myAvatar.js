import { useEffect, useState } from "react";
import Law from "@/models/law";

// The signed-in student's saved avatar config, fetched once and shared by every place that draws it (header, QR card, ...).
// Saving in the studio calls setMyAvatar so the header changes at once. null = nothing saved (initials are shown).
let cache; // undefined = not loaded yet
let pending = null;
const listeners = new Set();

const load = () => {
  if (pending) return pending;
  pending = Law.myProfile().then((r) => { if (r.ok) { cache = r.data.profile?.avatarConfig ?? null; listeners.forEach((f) => f(cache)); } }).finally(() => { pending = null; });
  return pending;
};

export function setMyAvatar(cfg) {
  cache = cfg ?? null;
  listeners.forEach((f) => f(cache));
}

export function useMyAvatar() {
  const [v, setV] = useState(cache);
  useEffect(() => {
    listeners.add(setV);
    if (cache === undefined) load();
    else setV(cache);
    return () => listeners.delete(setV);
  }, []);
  return v === undefined ? null : v;
}
