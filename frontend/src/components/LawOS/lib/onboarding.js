// Offline-safe memory of "this device's student finished onboarding", so the guard never redirects when the
// server can't be reached. The server (LawUserProfile.onboardingCompletedAt) stays the source of truth.
const KEY = "lawos_onboarded";
const DISMISS = "lawos_academic_nudge_dismissed";
export const isOnboarded = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const setOnboarded = () => { try { localStorage.setItem(KEY, "1"); } catch {} };
export const nudgeDismissed = () => { try { return localStorage.getItem(DISMISS) === "1"; } catch { return false; } };
export const dismissNudge = () => { try { localStorage.setItem(DISMISS, "1"); } catch {} };
export const clearOnboardingFlags = () => { try { localStorage.removeItem(KEY); localStorage.removeItem(DISMISS); } catch {} };
