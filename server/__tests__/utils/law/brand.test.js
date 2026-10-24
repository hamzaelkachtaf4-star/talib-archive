const fs = require("fs");
const path = require("path");
const { BRAND, brandName } = require("../../../utils/law/brand");
const { lawManifest } = require("../../../utils/law/manifest");

describe("brand constant (L-0003)", () => {
  test("manifest and index page derive from BRAND", () => {
    const m = lawManifest();
    expect(m.short_name).toBe(BRAND.name.ar);
    expect(m.name).toContain(BRAND.tagline.ar);
    expect(m.theme_color).toBe(BRAND.themeColor);
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
    const { TITLE } = require("../../../utils/law/indexPage");
    expect(TITLE).toContain(BRAND.name.ar);
    expect(TITLE).toContain(BRAND.tagline.ar);
  });

  test("server and frontend brand files agree on names", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../../../frontend/src/config/brand.js"), "utf8");
    for (const [loc, name] of Object.entries(BRAND.name)) expect(src).toContain(`${loc}: "${name}"`);
  });

  test("brandName falls back to French for unknown locales", () => {
    expect(brandName("zz")).toBe(BRAND.name.fr);
    expect(brandName()).toBe(BRAND.name.ar);
  });
});

test("RC2 1.4: index page ships a CSP without unsafe-inline, pinned to the one inline script", () => {
  const { CSP, serveLawIndex } = require("../../../utils/law/indexPage");
  expect(CSP).toMatch(/script-src 'self' https:\/\/accounts\.google\.com https:\/\/connect\.facebook\.net 'sha256-[A-Za-z0-9+/=]+'/);
  expect(CSP).not.toMatch(/unsafe-inline|unsafe-eval/);
  const headers = {};
  serveLawIndex({}, { setHeader: (k, v) => { headers[k] = v; }, type() { return this; }, status() { return this; }, send() {} });
  expect(headers["Content-Security-Policy"]).toBe(CSP);
});
