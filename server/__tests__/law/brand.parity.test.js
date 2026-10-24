const fs = require("fs");
const path = require("path");
const { BRAND: serverBrand } = require("../../utils/law/brand");
const { renderJsx } = require("../../utils/law/testing/renderJsx");

// The frontend brand file is an ES module; evaluate it as plain JS to compare it with the server mirror.
function frontendBrand() {
  const src = fs.readFileSync(path.resolve(__dirname, "../../../frontend/src/config/brand.js"), "utf8")
    .replace(/export const /g, "const ").replace(/export function /g, "function ");
  return new Function(`${src}; return { BRAND };`)().BRAND;
}

describe("brand parity", () => {
  const front = frontendBrand();
  test.each(["name", "shortName", "tagline"])("%s is identical on server and client", (k) => {
    expect(serverBrand[k]).toEqual(front[k]);
  });
  test("product is Talib in every language", () => {
    expect(front.name).toEqual({ ar: "طالب", ary: "طالب", fr: "Talib", en: "Talib" });
  });
  test("brand objects are deeply frozen", () => {
    for (const b of [front, serverBrand]) {
      expect(Object.isFrozen(b)).toBe(true);
      expect(Object.isFrozen(b.name)).toBe(true);
      expect(Object.isFrozen(b.tagline)).toBe(true);
      expect(() => { "use strict"; b.name.ar = "x"; }).toThrow();
    }
  });
});

describe("logo and mascot slot", () => {
  const logo = (lang) => renderJsx(`import BrandLogo from "@/components/LawOS/kit/BrandLogo";\nconst __default = () => <BrandLogo locale="${lang}" />;\nexport { __default };`);
  test.each([["ar", "طالب"], ["ary", "طالب"], ["fr", "Talib"], ["en", "Talib"]])("BrandLogo renders the %s name", async (lang, name) => {
    const html = await logo(lang);
    expect(html).toContain(name);
    expect(html).not.toMatch(/رفيق|Rafiq/);
  });
  test("logo tree has no opaque background (works on paper and midnight)", async () => {
    const html = await logo("fr");
    expect(html).not.toMatch(/\bbg-|background(-color)?:\s*(?!transparent)/);
    expect(html).toContain("/lawos/icons/mascot.svg");
    const svg = fs.readFileSync(path.resolve(__dirname, "../../../frontend/public/lawos/icons/mascot.svg"), "utf8");
    expect(svg).not.toMatch(/<rect[^>]*width="(64|100%)"[^>]*height="(64|100%)"/); // no full-bleed tile
  });
  test("MascotSlot (kept as the empty-state block) draws no illustration and keeps the message as text", async () => {
    const html = await renderJsx(`import MascotSlot from "@/components/LawOS/kit/MascotSlot";\nconst __default = () => <MascotSlot moment="celebrate" message="Bravo" />;`);
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("qm-");
    expect(html).toContain(">Bravo<");
  });
});
