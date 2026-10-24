const sc = require("../../../utils/law/shareCode");

describe("friend share codes", () => {
  test("shape XXXX-XXXX, only unambiguous characters", () => {
    for (let i = 0; i < 500; i++) {
      const c = sc.generate();
      expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(c).not.toMatch(/[01OILUV]/);
    }
  });
  test("no collisions in a large sample", () => {
    const seen = new Set();
    for (let i = 0; i < 20000; i++) seen.add(sc.generate());
    expect(seen.size).toBe(20000);
  });
  test("normalize accepts spacing and case, rejects ambiguous or malformed input", () => {
    expect(sc.normalize("abcd efgh")).toBe("ABCD-EFGH");
    expect(sc.normalize(" abcdefgh ")).toBe("ABCD-EFGH");
    expect(sc.normalize("ABCD-EFG")).toBeNull();
    expect(sc.normalize("ABCD-EFG0")).toBeNull();
    expect(sc.normalize("ABCD-EFGO")).toBeNull();
    expect(sc.normalize("QAN-BADR-1234")).toBeNull();
    expect(sc.normalize(null)).toBeNull();
    expect(sc.normalize("")).toBeNull();
  });
  test("the WhatsApp link encodes the message", () => {
    const u = sc.whatsappUrl("Join me: ABCD-EFGH & مرحبا");
    expect(u.startsWith("https://wa.me/?text=")).toBe(true);
    expect(u).not.toMatch(/\s/);
    expect(decodeURIComponent(u.split("text=")[1])).toBe("Join me: ABCD-EFGH & مرحبا");
  });
});
