// Qanouni e2e sign-in. The app now requires an account, so every e2e script:
//   await session.init(BASE)   → finishes first-run setup (or logs in) and adds the Bearer token to every
//                                Node fetch() to BASE/api;
//   await session.attach(page) → puts the same session in the page's localStorage before any script runs.
// Credentials: E2E_EMAIL / E2E_PASSWORD (defaults are for local test databases only).
const EMAIL = process.env.E2E_EMAIL || "e2e-owner@example.com";
const PASSWORD = process.env.E2E_PASSWORD || "Qanouni-e2e-pass-1";
let current = null;

async function post(base, path, body) {
  const res = await fetch(`${base}/api/law/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** A new account is sent to /law/welcome until the wizard is done: finish it through the API so scripts reach the app. */
async function completeOnboarding(base, token) {
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const st = await (await fetch(`${base}/api/law/onboarding`, { headers: h })).json().catch(() => null);
  if (!st || st.completed) return;
  const step = (n, data) => fetch(`${base}/api/law/onboarding/step`, { method: "POST", headers: h, body: JSON.stringify({ step: n, data }) });
  await step(3, { facultyCode: "FSJES_AIN_CHOCK" });
  await step(4, { track: "PRIVE", language: "AR", semester: "S3", groupCode: "G01" });
  await step(5, { dailyGoalMin: 20 });
  await fetch(`${base}/api/law/onboarding/complete`, { method: "POST", headers: h });
}

async function init(base) {
  const config = await (await fetch(`${base}/api/law/auth/config`)).json();
  const r = config.setupRequired
    ? await post(base, "setup", { fullName: "مالك الاختبار", email: EMAIL, password: PASSWORD })
    : await post(base, "login", { email: EMAIL, password: PASSWORD });
  if (!r.body?.token) throw new Error(`e2e sign-in failed: HTTP ${r.status} ${JSON.stringify(r.body)}`);
  current = r.body;
  // Qanouni Collab: accept the legal notice for the test account so the consent modal never covers the UI.
  await fetch(`${base}/api/law/auth/consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${current.token}` },
    body: JSON.stringify({ termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" }),
  });
  await completeOnboarding(base, current.token);
  const plain = globalThis.fetch;
  globalThis.fetch = (url, opts = {}) => {
    if (typeof url === "string" && url.startsWith(`${base}/api/`)) {
      const headers = { ...(opts.headers || {}) };
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "authorization"))
        headers.Authorization = `Bearer ${current.token}`;
      return plain(url, { ...opts, headers });
    }
    return plain(url, opts);
  };
  return current;
}

async function attach(page) {
  if (!current) throw new Error("session.init() first");
  await page.evaluateOnNewDocument((s) => {
    localStorage.setItem("anythingllm_authToken", s.token);
    localStorage.setItem("anythingllm_user", JSON.stringify({ id: s.user.id, username: s.user.username, role: s.user.role }));
    localStorage.setItem("lawos_user", JSON.stringify(s.user));
  }, current);
}

module.exports = { init, attach, completeOnboarding };
