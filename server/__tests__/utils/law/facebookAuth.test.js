const { verifyFacebookToken } = require("../../../utils/law/facebookAuth");

const TOKEN = "EAAB_user_token_123456";
let calls;
function mockGraph({ debug, me, meOk = true, debugOk = true }) {
  calls = [];
  global.fetch = jest.fn(async (url) => {
    calls.push(String(url));
    if (String(url).includes("/debug_token"))
      return { ok: debugOk, json: async () => ({ data: debug }) };
    return { ok: meOk, json: async () => me };
  });
}

beforeEach(() => {
  process.env.FACEBOOK_APP_ID = "111";
  process.env.FACEBOOK_APP_SECRET = "topsecret";
});
afterEach(() => {
  delete process.env.FACEBOOK_APP_SECRET;
  delete process.env.FACEBOOK_APP_ID;
});

describe("verifyFacebookToken binds the token to our own app", () => {
  test("accepts a valid token issued to our app", async () => {
    mockGraph({ debug: { is_valid: true, app_id: "111", user_id: "9" }, me: { id: "9", name: "A", email: "a@x.ma" } });
    await expect(verifyFacebookToken(TOKEN)).resolves.toEqual({ id: "9", email: "a@x.ma", name: "A" });
  });

  test("rejects a token minted for another app (confused deputy)", async () => {
    mockGraph({ debug: { is_valid: true, app_id: "999", user_id: "9" }, me: { id: "9", email: "victim@x.ma" } });
    await expect(verifyFacebookToken(TOKEN)).rejects.toThrow("invalid_facebook_token");
    expect(calls.some((u) => u.includes("/me"))).toBe(false);
  });

  test("rejects expired / invalid tokens", async () => {
    mockGraph({ debug: { is_valid: false, app_id: "111" }, me: { id: "9" } });
    await expect(verifyFacebookToken(TOKEN)).rejects.toThrow("invalid_facebook_token");
  });

  test("rejects when /me returns a different user than the token's user", async () => {
    mockGraph({ debug: { is_valid: true, app_id: "111", user_id: "9" }, me: { id: "10", email: "z@x.ma" } });
    await expect(verifyFacebookToken(TOKEN)).rejects.toThrow("invalid_facebook_token");
  });

  test("fails closed without an app secret, and never sends it in a URL", async () => {
    delete process.env.FACEBOOK_APP_SECRET;
    mockGraph({ debug: { is_valid: true, app_id: "111", user_id: "9" }, me: { id: "9" } });
    await expect(verifyFacebookToken(TOKEN)).rejects.toThrow("facebook_not_configured");
    process.env.FACEBOOK_APP_SECRET = "topsecret";
    await verifyFacebookToken(TOKEN);
    expect(calls.join("\n")).not.toContain("topsecret");
  });

  test("a graph outage is an error, not a pass", async () => {
    mockGraph({ debug: null, me: {}, debugOk: false });
    await expect(verifyFacebookToken(TOKEN)).rejects.toThrow("invalid_facebook_token");
  });

  test("phone-only accounts get a non-routable placeholder email", async () => {
    mockGraph({ debug: { is_valid: true, app_id: "111", user_id: "9" }, me: { id: "9", name: "A" } });
    const r = await verifyFacebookToken(TOKEN);
    expect(r.email).toBe("fb_9@facebook.qanouni.local");
  });
});
