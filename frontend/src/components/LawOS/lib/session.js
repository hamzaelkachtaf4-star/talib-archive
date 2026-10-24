// Qanouni sessions on the device (docs/plans/qanouni.md §3). The token is upstream's JWT under upstream's
// localStorage key, so upstream pages and baseHeaders() keep working. Offline data in IndexedDB belongs to
// one account: it is wiped on sign-out and whenever a different account signs in on this device.
import { AUTH_TOKEN, AUTH_USER } from "@/utils/constants";
import { wipeAll, count } from "./idb";
import { clearOnboardingFlags } from "./onboarding";

const USER_KEY = "lawos_user"; // last confirmed account, for the offline shell
const LAST_AUTH_KEY = "lawos_last_auth_ok";
const OWNER_KEY = "lawos_device_owner"; // survives sign-out: whose offline data is on this device

export function cachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function cacheUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function wipeDeviceData() {
  try {
    await wipeAll();
  } catch (e) {
    console.warn("[Qanouni] could not clear offline data:", e?.message);
  }
  localStorage.removeItem(LAST_AUTH_KEY);
  clearOnboardingFlags();
}

/** Stores a fresh session; clears the previous account's offline data if it was someone else. */
export async function startSession({ token, user }) {
  const owner = localStorage.getItem(OWNER_KEY);
  const previousId = owner ?? (cachedUser()?.id != null ? String(cachedUser().id) : null);
  if (previousId && previousId !== String(user.id)) await wipeDeviceData();
  localStorage.setItem(OWNER_KEY, String(user.id));
  localStorage.setItem(AUTH_TOKEN, token);
  localStorage.setItem(
    AUTH_USER,
    JSON.stringify({ id: user.id, username: user.username, role: user.role })
  );
  cacheUser(user);
}

/** Work the device has not uploaded yet (reviews, captures). */
export async function pendingCount() {
  try {
    const [r, c, t] = await Promise.all([count("reviewQueue"), count("captures"), count("ttQueue")]);
    return r + c + t;
  } catch {
    return 0;
  }
}

/** Signs out. The offline pack stays on the device by default (signing in as a different account wipes it: see OWNER_KEY);
 *  pass { removeOfflineData: true } to clear it now (shared devices). */
export async function endSession({ removeOfflineData = false } = {}) {
  if (removeOfflineData) {
    await wipeDeviceData();
    localStorage.removeItem(OWNER_KEY);
  }
  localStorage.removeItem(AUTH_TOKEN);
  localStorage.removeItem(AUTH_USER);
  localStorage.removeItem(USER_KEY);
}
