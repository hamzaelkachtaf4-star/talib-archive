jest.mock("../../utils/prisma", () => {
  return new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] });
});

const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { lawEndpoints } = require("../../endpoints/law");
const { resetRateLimits } = require("../../endpoints/law/auth");
const { LawAccount } = require("../../models/lawAccount");
const { setFacebookVerifier } = require("../../utils/law/facebookAuth");
const { setMailTransport } = require("../../utils/law/mailer");
const { closeFts } = require("../../utils/law/fts");

jest.setTimeout(30000);
let tmp;
let server;
let base;

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json };
}

beforeAll(async () => {
  process.env.JWT_SECRET = "jwt-secret-testing-32-bytes-long";
  process.env.FACEBOOK_APP_ID = "123456789012345";
  process.env.FACEBOOK_APP_SECRET = "test-secret";
  process.env.QANOUNI_DEV_CODES = "true";

  tmp = await createTempDb();
  globalThis.__lawTestPrisma = tmp.client;

  const app = express();
  app.use(bodyParser.json());
  const router = express.Router();
  lawEndpoints(router);
  app.use("/api", router);

  server = http.createServer(app);
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  base = `http://127.0.0.1:${server.address().port}`;

  // Initial owner setup so multi-user mode is active
  await LawAccount.setupOwner({
    fullName: "عميد الكلية",
    email: "dean@qanouni.ma",
    password: "Password-Solide-1",
  });
});

afterAll(async () => {
  await closeFts();
  await new Promise((res) => server.close(res));
  await tmp?.cleanup?.();
});

beforeEach(() => {
  resetRateLimits();
});

describe("Facebook Authentication & Auth Config", () => {
  test("returns facebookAppId in /law/auth/config", async () => {
    const res = await call("GET", "/law/auth/config");
    expect(res.status).toBe(200);
    expect(res.body.multiUser).toBe(true);
    expect(res.body.facebookAppId).toBe("123456789012345");
  });

  test("new student signs in with Facebook", async () => {
    setFacebookVerifier(async (token) => {
      expect(token).toBe("valid-fb-token-1");
      return { id: "fb-uid-100", email: "student.fb@fsjes.ma", name: "طالب فيسبوك" };
    });

    const res = await call("POST", "/law/auth/facebook", {
      body: { accessToken: "valid-fb-token-1" },
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("student.fb@fsjes.ma");
    expect(res.body.user.fullName).toBe("طالب فيسبوك");
    expect(res.body.user.facebookLinked).toBe(true);
  });

  test("existing email is NOT silently linked on Facebook sign-in (takeover guard)", async () => {
    const registered = await LawAccount.register(
      { fullName: "فاطمة الزهراء", email: "fatima@fsjes.ma", password: "Password-Solide-2" }
    );
    expect(registered.error).toBeNull();
    setFacebookVerifier(async () => ({ id: "fb-uid-200", email: "fatima@fsjes.ma", name: "Attacker" }));

    const res = await call("POST", "/law/auth/facebook", { body: { accessToken: "valid-fb-token-2" } });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("facebook_link_required");
    expect(res.body.token).toBeUndefined();
    const again = await LawAccount.facebookSignIn({ id: "fb-uid-200", email: "fatima@fsjes.ma", name: "x" });
    expect(again.error).toBe("facebook_link_required");
  });

  test("a signed-in user links Facebook explicitly, then Facebook sign-in works by id", async () => {
    const login = await call("POST", "/law/auth/login", {
      body: { email: "fatima@fsjes.ma", password: "Password-Solide-2" },
    });
    expect(login.status).toBe(200);
    const headers = { Authorization: `Bearer ${login.body.token}` };
    setFacebookVerifier(async () => ({ id: "fb-uid-200", email: "other-address@x.ma", name: "Fatima FB" }));

    const link = await call("POST", "/law/auth/facebook/link", { headers, body: { accessToken: "valid-fb-token-2" } });
    expect(link.status).toBe(200);
    expect(link.body.user.facebookLinked).toBe(true);

    const res = await call("POST", "/law/auth/facebook", { body: { accessToken: "valid-fb-token-2" } });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("fatima@fsjes.ma");
  });

  test("a Facebook id already bound to another account cannot be linked again", async () => {
    const reg = await LawAccount.register({ fullName: "Other", email: "other2@fsjes.ma", password: "Password-Solide-3" });
    expect(reg.error).toBeNull();
    const login = await call("POST", "/law/auth/login", { body: { email: "other2@fsjes.ma", password: "Password-Solide-3" } });
    const link = await call("POST", "/law/auth/facebook/link", {
      headers: { Authorization: `Bearer ${login.body.token}` },
      body: { accessToken: "valid-fb-token-2" },
    });
    expect(link.status).toBe(409);
    expect(link.body.error).toBe("facebook_account_mismatch");
  });

  test("placeholder (phone-only) emails never link to an account by email", async () => {
    const r = await LawAccount.facebookSignIn({ id: "fb-uid-300", email: "fb_fb-uid-300@facebook.qanouni.local", name: "P" });
    expect(r.created).toBe(true);
    expect(r.account.facebookLinked).toBe(true);
  });

  test("a Facebook binding made under an unproven email dies when the real owner proves the email (Google)", async () => {
    const atk = await LawAccount.facebookSignIn({ id: "fb-atk-1", email: "victim1@fsjes.ma", name: "Atk" });
    expect(atk.created).toBe(true);
    const g = await LawAccount.googleSignIn({ sub: "g-victim-1", email: "victim1@fsjes.ma", emailVerified: true, name: "V" });
    expect(g.error).toBeNull();
    const again = await LawAccount.facebookSignIn({ id: "fb-atk-1", email: "victim1@fsjes.ma", name: "Atk" });
    expect(again.error).toBe("facebook_link_required");
  });

  test("a Facebook binding is cleared when the email owner resets the password by OTP", async () => {
    await LawAccount.facebookSignIn({ id: "fb-atk-2", email: "victim2@fsjes.ma", name: "Atk" });
    const r = await LawAccount.resetPassword("victim2@fsjes.ma", "Password-Solide-9");
    expect(r.error).toBeNull();
    const again = await LawAccount.facebookSignIn({ id: "fb-atk-2", email: "victim2@fsjes.ma", name: "Atk" });
    expect(again.error).toBe("facebook_link_required");
  });

  test("rejects invalid or rejected Facebook token", async () => {
    setFacebookVerifier(async () => {
      throw new Error("invalid_facebook_token");
    });

    const res = await call("POST", "/law/auth/facebook", {
      body: { accessToken: "bad-or-expired-token" },
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_facebook_token");
  });

  test("returns devCode when QANOUNI_DEV_CODES is active and mail is unconfigured", async () => {
    setMailTransport(null);
    const r = await call("POST", "/law/auth/register", {
      body: { fullName: "يوسف التيست", email: "youssef.test@example.ma", password: "Password-Solide-1" },
    });
    expect(r.status).toBe(202);
    expect(r.body.verification).toBe("email");
    expect(r.body.devCode).toMatch(/^\d{6}$/);

    // Can immediately verify using that devCode
    const v = await call("POST", "/law/auth/register/verify", {
      body: { email: "youssef.test@example.ma", code: r.body.devCode },
    });
    expect(v.status).toBe(201);
    expect(v.body.user.fullName).toBe("يوسف التيست");
  });
});
