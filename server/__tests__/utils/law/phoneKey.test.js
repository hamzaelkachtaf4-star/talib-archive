// RC2 1.3: keyed phone hashing.
const ENV = process.env;
afterEach(() => { process.env = ENV; });
const KEY = "k".repeat(32);

test("missing or short key with the feature on -> refuses to start", () => {
  process.env = { ...ENV, FEATURE_CONTACT_MATCH: "true" };
  delete process.env.PHONE_HASH_KEY; delete process.env.PHONE_HASH_PEPPER;
  const { assertPhoneKeyConfigured } = require("../../../utils/law/phoneKey");
  expect(() => assertPhoneKeyConfigured()).toThrow(/PHONE_HASH_KEY/);
  process.env.PHONE_HASH_KEY = "short";
  expect(() => assertPhoneKeyConfigured()).toThrow(/PHONE_HASH_KEY/);
  process.env.PHONE_HASH_KEY = KEY;
  expect(() => assertPhoneKeyConfigured()).not.toThrow();
});

test("feature off -> no key needed", () => {
  process.env = { ...ENV, FEATURE_CONTACT_MATCH: "false" };
  delete process.env.PHONE_HASH_KEY; delete process.env.PHONE_HASH_PEPPER;
  expect(() => require("../../../utils/law/phoneKey").assertPhoneKeyConfigured()).not.toThrow();
});

test("same number in every format -> same HMAC; different key -> different hash; raw number never inside", () => {
  process.env = { ...ENV, PHONE_HASH_KEY: KEY };
  const { LawSocial } = require("../../../models/lawSocial");
  const { normalizePhone, phoneHash } = LawSocial;
  const forms = ["0661234567", "+212661234567", "00212661234567", "212661234567", "661234567", "06 61-23 45 67"];
  const hashes = new Set(forms.map((f) => phoneHash(normalizePhone(f))));
  expect(hashes.size).toBe(1);
  const h = [...hashes][0];
  expect(h).toMatch(/^[0-9a-f]{64}$/);
  expect(h).not.toContain("661234567");
  process.env.PHONE_HASH_KEY = "z".repeat(32);
  expect(phoneHash(normalizePhone("0661234567"))).not.toBe(h);
});

test("a key under 32 chars hashes nothing", () => {
  process.env = { ...ENV, PHONE_HASH_KEY: "short-key" };
  delete process.env.PHONE_HASH_PEPPER;
  const { phoneHash } = require("../../../models/lawSocial").LawSocial;
  expect(phoneHash("+212661234567")).toBeNull();
});
