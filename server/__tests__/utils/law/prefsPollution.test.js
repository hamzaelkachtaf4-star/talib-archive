// RC2 1.4: closed-vocabulary validation means a __proto__/constructor payload can neither pollute nor be stored.
const { LawPreferences } = require("../../../models/lawPreferences");

test("avatar payload with __proto__/constructor/prototype keys is rejected and nothing is polluted", async () => {
  for (const raw of ['{"__proto__":{"polluted":true}}', '{"constructor":{"prototype":{"polluted":true}}}', '{"base":"x","prototype":{"polluted":1}}']) {
    const r = await LawPreferences.validateAvatar(JSON.parse(raw));
    expect(r.error).toBe("invalid_avatar");
  }
  expect({}.polluted).toBeUndefined();
});
