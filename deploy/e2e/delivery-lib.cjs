// Shared helpers for the delivery walk (RC4): create verified accounts through the API (dev code on screen), finish onboarding,
// and open pages signed in. Needs a server started with NODE_ENV=development (or QANOUNI_DEV_CODES=true) and the Vite dev server.
const API = process.env.API || "http://127.0.0.1:3001/api";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const PASSWORD = "Delivery-pass-2026!x";

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function account(tag, fullName) {
  const email = `${tag}@example.com`;
  let r = await call("POST", "/law/auth/login", null, { email, password: PASSWORD });
  if (!r.body?.token) {
    const reg = await call("POST", "/law/auth/register", null, { fullName, email, password: PASSWORD });
    if (!reg.body?.devCode) throw new Error(`register failed ${reg.status} ${JSON.stringify(reg.body)}`);
    r = await call("POST", "/law/auth/register/verify", null, { email, code: reg.body.devCode });
  }
  if (!r.body?.token) throw new Error(`sign-in failed ${r.status} ${JSON.stringify(r.body)}`);
  const { token, user } = r.body;
  await call("POST", "/law/auth/consent", token, { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" });
  const st = (await call("GET", "/law/onboarding", token)).body;
  if (st && !st.completed) {
    await call("POST", "/law/onboarding/step", token, { step: 3, data: { facultyCode: "FSJES_AIN_CHOCK" } });
    await call("POST", "/law/onboarding/step", token, { step: 4, data: { track: "PRIVE", language: "AR", semester: "S3", groupCode: "G01" } });
    await call("POST", "/law/onboarding/step", token, { step: 5, data: { dailyGoalMin: 20 } });
    await call("POST", "/law/onboarding/complete", token);
  }
  return { token, user, email };
}

async function open(browser, acct, { width = 1440, height = 900, dark = false, lang } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? "dark" : "light", locale: "ar-MA", acceptDownloads: true, permissions: [] });
  await ctx.addInitScript((s) => {
    localStorage.setItem("anythingllm_authToken", s.token);
    localStorage.setItem("anythingllm_user", JSON.stringify({ id: s.user.id, username: s.user.username, role: s.user.role }));
    localStorage.setItem("lawos_user", JSON.stringify(s.user));
    if (s.dark) localStorage.setItem("lawos_theme", "dark");
  }, { ...acct, dark });
  return ctx;
}

module.exports = { API, BASE, PASSWORD, call, account, open };
