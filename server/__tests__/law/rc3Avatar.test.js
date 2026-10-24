// RC3 Phase 8: the avatar studio: closed-vocabulary validation (client and server agree), layered render, no hard-coded colours in the art.
const fs = require("fs");
const path = require("path");
const { loadEsm, mountJsx } = require("../../utils/law/testing/renderJsx");
const { LawPreferences } = require("../../models/lawPreferences");

const DIR = path.resolve(__dirname, "../../../frontend/src/components/LawOS/avatar");
let A;
beforeAll(async () => { A = await loadEsm('export * from "@/components/LawOS/avatar/avatarConfig";'); });
const click = (m, el) => m.act(async () => { el.dispatchEvent(new m.window.MouseEvent("click", { bubbles: true })); });

describe("avatar vocabulary", () => {
  test("every default, preset, legal set and random result is valid", () => {
    expect(A.isValidAvatar(A.DEFAULT_AVATAR)).toBe(true);
    for (const p of A.PRESETS) expect(A.isValidAvatar(p)).toBe(true);
    for (const s of A.LEGAL_SETS) expect(A.isValidAvatar(A.applySet(A.DEFAULT_AVATAR, s.id))).toBe(true);
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) expect(A.isValidAvatar(A.randomAvatar(rng))).toBe(true);
    expect(A.isValidAvatar(A.randomAvatar(() => 0.999999))).toBe(true);
    expect(A.isValidAvatar(A.randomAvatar(() => 0))).toBe(true);
  });
  test("unknown keys, values, shapes and prototype keys are refused; null clears", () => {
    for (const bad of [{ outfit: "crown" }, { headwear: "turban" }, { evil: "x" }, { base: "x".repeat(40) }, [], "str", 3, undefined, { outfit: ["judge"] }, JSON.parse('{"__proto__":"x"}'), { constructor: "x" }])
      expect(A.isValidAvatar(bad)).toBe(false);
    expect(A.isValidAvatar(null)).toBe(true);
    expect(A.isValidAvatar({})).toBe(true);
  });
  test("sanitize turns anything stored into a drawable config", () => {
    expect(A.sanitizeAvatar({ outfit: "crown", skinTone: "red", hair: "long", extra: 1 })).toEqual({ ...A.DEFAULT_AVATAR, hair: "long" });
    for (const junk of [null, undefined, "x", 5, [], {}]) expect(A.isValidAvatar(A.sanitizeAvatar(junk))).toBe(true);
  });
  test("the closed vocabulary is identical on the server, in both directions: an option added on one side only fails here", async () => {
    // every client option is restricted on the server with the same values, and the server restricts nothing the client does not draw
    expect(Object.keys(A.OPTIONS).sort()).toEqual(Object.keys(LawPreferences.AVATAR).sort());
    for (const [k, list] of Object.entries(LawPreferences.AVATAR)) expect(A.OPTIONS[k]).toEqual(list);
    expect(LawPreferences.AVATAR_FREE.sort()).toEqual([...A.FREE_KEYS].sort());
    // what the studio can produce, the server accepts: every value, every random config, every legal set, every preset
    for (const [k, list] of Object.entries(A.OPTIONS)) for (const v of list) expect((await LawPreferences.validateAvatar({ [k]: v })).error).toBeUndefined();
    let seed = 11;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const samples = [A.DEFAULT_AVATAR, ...A.PRESETS, ...A.LEGAL_SETS.map((s) => A.applySet({}, s.id)), ...Array.from({ length: 200 }, () => A.randomAvatar(rng))];
    for (const c of samples) expect((await LawPreferences.validateAvatar(c)).error).toBeUndefined();
    // the two validators give the same verdict on values outside the vocabulary
    for (const bad of [{ outfit: "crown" }, { expression: "angry" }, { skinTone: "red" }, { bg: "#000000" }, { hair: "mohawk" }, { headwear: "turban" }, { beard: "long" }, { base: "x".repeat(40) }]) {
      expect((await LawPreferences.validateAvatar(bad)).error).toBe("invalid_avatar");
      expect(A.isValidAvatar(bad)).toBe(false);
    }
  });
  test("the five Moroccan legal sets exist, each with its own outfit", () => {
    expect(A.LEGAL_SETS.map((s) => s.id)).toEqual(["judge", "lawyer", "adoul", "professor", "student"]);
    expect(new Set(A.LEGAL_SETS.map((s) => s.config.outfit)).size).toBe(5);
  });
});

describe("avatar art", () => {
  const draw = (cfg) => mountJsx(`import AvatarArt from "@/components/LawOS/avatar/AvatarArt";\nconst __default = () => <AvatarArt config={${JSON.stringify(cfg)}} size={64} title="x" />;`, { lang: "fr" });
  const layers = (m) => [...m.container.querySelectorAll("[data-layer]")].map((n) => n.getAttribute("data-layer"));
  test("layers are drawn back to front: background, outfit, neck, face, [hair], [headwear], eyes, brows, expression, [facial hair], [accessory]", async () => {
    const m = await draw({ outfit: "judge", hair: "short", headwear: "none", accessory: "gavel" });
    expect(layers(m)).toEqual(["bg", "outfit", "neck", "face", "hair", "eyes", "brows", "expression", "accessory"]);
    expect(m.container.querySelector("[data-outfit='judge']")).not.toBeNull();
    await m.unmount();
    const bare = await draw({ hair: "none", accessory: "none", headwear: "none" });
    expect(layers(bare)).toEqual(["bg", "outfit", "neck", "face", "eyes", "brows", "expression"]);
    await bare.unmount();
    const bearded = await draw({ hair: "none", accessory: "none", headwear: "none", facialHair: "beard", eyes: "almond", brows: "thick" });
    expect(layers(bearded)).toEqual(["bg", "outfit", "neck", "face", "eyes", "brows", "expression", "facialHair"]);
    expect(bearded.container.querySelector("[data-eyes=almond]")).not.toBeNull();
    expect(bearded.container.querySelector("[data-brows=thick]")).not.toBeNull();
    await bearded.unmount();
  });
  test("each legal outfit renders a distinct drawing and none carries an emblem, text or image", async () => {
    const seen = new Set();
    for (const s of A.LEGAL_SETS) {
      const m = await draw(A.applySet({}, s.id));
      const outfit = m.container.querySelector("[data-layer=outfit]").innerHTML;
      expect(seen.has(outfit)).toBe(false);
      seen.add(outfit);
      await m.unmount();
    }
    expect(seen.size).toBe(5);
    // no element that could carry an emblem, a lettering or a picture, whichever value of any option is drawn
    for (const [key, list] of Object.entries(A.OPTIONS)) for (const v of list) {
      const m = await draw({ ...A.DEFAULT_AVATAR, [key]: v });
      expect({ key, v, forbidden: m.container.querySelectorAll("image, text, tspan, use, foreignObject, script, a").length }).toEqual({ key, v, forbidden: 0 });
      await m.unmount();
    }
  }, 30000);
  test("hijab and rezza replace the hair layer; every expression and face draws", async () => {
    for (const headwear of ["hijab", "rezza"]) {
      const m = await draw({ hair: "long", headwear });
      expect(layers(m).filter((l) => l === "hair")).toHaveLength(1); // only the long hair behind the head: the cap-shaped hair is replaced by the headwear
      expect(m.container.querySelector("[data-layer=headwear]")).not.toBeNull();
      await m.unmount();
    }
    for (const face of A.OPTIONS.face) for (const expression of A.OPTIONS.expression) {
      const m = await draw({ face, expression });
      expect(m.container.querySelector(`[data-face=${face}]`)).not.toBeNull();
      expect(m.container.querySelector(`[data-expression=${expression}]`)).not.toBeNull();
      await m.unmount();
    }
  });
  test("stored junk still renders the default avatar", async () => {
    const m = await draw({ outfit: "crown", bg: "url(javascript:1)" });
    expect(m.container.querySelector("[data-outfit=casual]")).not.toBeNull();
    expect(m.container.querySelector("[data-layer=bg]").getAttribute("fill")).toBe(A.DEFAULT_AVATAR.bg);
    await m.unmount();
  });
  test("no hard-coded colour in the art or the studio components: colours come from the palette and the config", () => {
    for (const f of ["AvatarArt.jsx", "AvatarBuilder.jsx"]) {
      const src = fs.readFileSync(path.join(DIR, f), "utf8");
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/);
      // a fill or stroke is a palette reference, "none" or currentColor, never a literal colour name
      expect([...src.matchAll(/\b(?:fill|stroke)=(["'])([^"']*)\1/g)].map((m) => m[2]).filter((v) => !/^(none|currentColor)$/.test(v))).toEqual([]);
    }
  });
});

describe("avatar studio", () => {
  const studio = (props = "") => mountJsx(`import AvatarBuilder from "@/components/LawOS/avatar/AvatarBuilder";\nglobalThis.__saved = [];\nconst __default = () => <AvatarBuilder value={{ outfit: "casual" }} onSave={(c) => globalThis.__saved.push(c)} onCancel={() => {}} ${props} />;`, { lang: "fr" });
  const FR = require("../../../frontend/src/locales/qanouni/fr.json");
  const btn = (m, text) => [...m.container.querySelectorAll("button")].find((b) => b.textContent.includes(text));
  test("live preview on the light and the dark surface; both follow the edits", async () => {
    const m = await studio();
    const prev = [...m.container.querySelectorAll("[data-preview]")];
    expect(prev.map((p) => p.getAttribute("data-preview"))).toEqual(["light", "dark"]);
    await click(m, btn(m, FR["بذلة القاضي"]));
    for (const p of m.container.querySelectorAll("[data-preview]")) expect(p.querySelector("[data-outfit=judge]")).not.toBeNull();
    await m.unmount();
  });
  test("category tabs switch the options shown", async () => {
    const m = await studio();
    const tabs = [...m.container.querySelectorAll("[role=tab]")];
    expect(tabs).toHaveLength(7); // sets, face, eyes and brows, hair/headwear/facial hair, outfit, accessory, background
    await click(m, tabs[2]);
    expect(btn(m, FR["لوزية"])).toBeDefined();
    expect(btn(m, FR["مقوّس"])).toBeDefined();
    await click(m, tabs[3]);
    expect(btn(m, FR["لحية"])).toBeDefined();
    await click(m, tabs[4]);
    expect(btn(m, FR["روب المحاماة"])).toBeDefined();
    await click(m, tabs[5]);
    expect(btn(m, FR["ميزان"])).toBeDefined();
    expect(btn(m, FR["بذلة القاضي"])).toBeUndefined();
    await m.unmount();
  });
  test("choosing what is already chosen is not an undo step; a failed save keeps the studio open with the reason; tabs work from the keyboard", async () => {
    const m = await studio('error="تعذر حفظ"');
    expect(m.container.textContent).toContain("تعذر حفظ");
    const undo = () => btn(m, FR["تراجع"]);
    await click(m, btn(m, FR["بذلة القاضي"]));
    await click(m, btn(m, FR["بذلة القاضي"]));
    await click(m, undo());
    expect(undo().disabled).toBe(true); // one real change, one undo
    const tabs = [...m.container.querySelectorAll("[role=tab]")];
    expect(tabs.map((t) => t.getAttribute("aria-controls"))).toEqual(Array(7).fill("avatar-panel"));
    expect(m.container.querySelector("#avatar-panel").getAttribute("aria-labelledby")).toBe("avatar-tab-sets");
    await m.act(async () => { tabs[0].dispatchEvent(new m.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect([...m.container.querySelectorAll("[role=tab]")].filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
    await m.act(async () => { m.container.querySelector("[role=tablist]").dispatchEvent(new m.window.KeyboardEvent("keydown", { key: "End", bubbles: true })); });
    expect(m.container.querySelector("[role=tab][aria-selected=true]").id).toBe("avatar-tab-bg");
    await m.unmount();
  });
  test("undo walks back through every change; randomize is a change that can be undone; saved config is always valid", async () => {
    const m = await studio();
    const undo = () => btn(m, FR["تراجع"]);
    expect(undo().disabled).toBe(true);
    await click(m, btn(m, FR["بذلة القاضي"]));
    await click(m, btn(m, FR["عشوائي"]));
    expect(undo().disabled).toBe(false);
    await click(m, undo());
    expect(m.container.querySelector("[data-preview=light] [data-outfit=judge]")).not.toBeNull();
    await click(m, undo());
    expect(m.container.querySelector("[data-preview=light] [data-outfit=casual]")).not.toBeNull();
    expect(undo().disabled).toBe(true);
    await click(m, btn(m, FR["بذلة القاضي"]));
    await click(m, btn(m, FR["حفظ"]));
    expect(globalThis.__saved).toHaveLength(1);
    expect(globalThis.__saved[0].outfit).toBe("judge");
    expect(A.isValidAvatar(globalThis.__saved[0])).toBe(true);
    await m.unmount();
  });
});
