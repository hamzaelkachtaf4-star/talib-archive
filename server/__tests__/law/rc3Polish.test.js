// RC3 Phase 9: elite academic positioning (no inflated claims), complete locales, mascot empty states, responsive and bidi guards.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { mountJsx } = require("../../utils/law/testing/renderJsx");

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "frontend/src");
const LOC = (l) => JSON.parse(fs.readFileSync(path.join(SRC, `locales/qanouni/${l}.json`), "utf8"));
const walk = (dir, out = []) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|css)$/.test(f)) out.push(p);
  }
  return out;
};
const lawosFiles = () => [...walk(path.join(SRC, "components/LawOS")), ...walk(path.join(SRC, "pages/LawOS")), path.join(SRC, "config/brand.js")];
const click = (m, el) => m.act(async () => { el.dispatchEvent(new m.window.MouseEvent("click", { bubbles: true })); });
const json = (body, ok = true, status) => ({ ok, status: status || (ok ? 200 : 400), json: async () => body });

// The claims the product no longer makes. "مجان" is matched at a word start (it also occurs inside "يُدمجان", "to merge").
const BANNED = [
  [/1[,٬.]?500\s*(?:\+|مادة|articles|articles de loi)|\+\s*1[,٬]?500/, "1500 articles"],
  [/800\s*(?:\+)?\s*(?:نازلة|cas|cases)|\+\s*800\b/, "800 explained cases"],
  [/مواظبة يومية/, "daily assiduity"],
  // "مجان" opening a word, with any of the usual prefixes (ال، بال، لل، و…) and any ending (مجاني، مجانية، مجاناً، مجانًا، بالمجان). It also
  // occurs inside "يُدمجان" (to merge), where a letter precedes it, so a word start is required.
  [/(?:^|[^\u0600-\u06FF])(?:بال|وال|فال|لل|ال|ب|ل|و|ف)?مجان/, "free (مجاني)"],
  [/\bfree (?:account|sign|trial|plan|of charge|forever)|\bfor free\b|\b100% free\b|\bgratuit(?:e|ement)?\b|\bfree\b(?= to)/i, "free (translation)"],
  [/آلاف الطلبة|مئات النوازل|\b(?:thousands|hundreds) of (?:students|cases|solved)|\b(?:milliers|centaines) d['’]/i, "inflated numbers"],
  [/عمل جماعي/, "group work"],
  [/لا تراجع (?:وحدك|لوحدك)/, "never revise alone"],
  [/Daily assiduity|Assiduité quotidienne/i, "daily assiduity in a translation"],
];

describe("removed claims", () => {
  test("no LAW-OS source file or Qanouni locale carries a removed claim", () => {
    const hits = [];
    for (const f of [...lawosFiles(), path.join(ROOT, "frontend/index.html"), path.join(ROOT, "frontend/public/manifest.json"), path.join(ROOT, "server/utils/law/brand.js")]) {
      const src = fs.readFileSync(f, "utf8");
      for (const [re, name] of BANNED) if (re.test(src)) hits.push(`${path.relative(ROOT, f)}: ${name}`);
    }
    for (const l of ["fr", "en", "ary"]) {
      for (const [k, v] of Object.entries(LOC(l))) for (const [re, name] of BANNED) if (re.test(k) || re.test(String(v))) hits.push(`locale ${l}: ${name}: ${k.slice(0, 40)}`);
    }
    expect(hits).toEqual([]);
  });
  test("the guard itself catches what it should (and not 'يُدمجان')", () => {
    const hit = (s) => BANNED.some(([re]) => re.test(s));
    for (const bad of ["+1,500 مادة قانونية", "800 نازلة مشروحة", "مواظبة يومية", "ابدأ الآن مجاناً", "أنشئ حسابك المجاني", "صاوب حسابك بالمجان", "بدا دابا بالمجان", "خدمة مجانية", "مجانًا", "عمل جماعي", "لا تراجع لوحدك", "Create your free account", "Start now for free", "Free account", "100% free", "Commencer gratuitement", "Join thousands of students", "des centaines d'étudiants", "آلاف الطلبة", "مئات النوازل"]) expect({ bad, hit: hit(bad) }).toEqual({ bad, hit: true });
    for (const ok of ["لا يتعارضان وسيُدمجان.", "الحقوق", "مجموعة", "يدمجان", "Free text field", "error-free", "Sync between phone and computer"]) expect({ ok, hit: hit(ok) }).toEqual({ ok, hit: false });
  });
});

describe("positioning", () => {
  const HERO = 'import HeroDuolingo from "@/components/LawOS/Portal/HeroDuolingo";\nconst __default = () => <HeroDuolingo onSignup={() => {}} onLogin={() => {}} />;';
  test("the hero states the new positioning in Arabic and in French, and keeps no counters", async () => {
    const ar = await mountJsx(HERO, { lang: "ar" });
    expect(ar.container.querySelector("h1").textContent).toBe("المنصة الذكية التي ترافقك في تفكيك المنهجية القانونية والتحضير المتين للامتحانات والمباريات");
    expect(ar.container.querySelector(".portal-lede").textContent).toBe("منهجية قانونية رصينة · مواكبة دقيقة لكل مادة · تلخيص ومراجعة توافق أسلوب أساتذتك");
    expect(ar.container.textContent).not.toMatch(/\d{3,}/);
    await ar.unmount();
    const fr = await mountJsx(HERO, { lang: "fr" });
    expect(fr.container.querySelector("h1").textContent).toContain("méthodologie juridique");
    expect(fr.container.querySelector(".portal-lede").textContent).toContain("rigoureuse");
    await fr.unmount();
  });
});

describe("locale completeness", () => {
  for (const l of ["fr", "en", "ary"]) {
    test(`${l}: every Arabic tr() key used in LAW-OS has a translation`, () => {
      const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/i18n-missing.mjs"), l], { cwd: ROOT, encoding: "utf8" });
      expect(r.stderr).toMatch(/^\d+ missing in /m); // the script really ran (a crash would otherwise look like "nothing missing")
      const out = r.stdout;
      // Data values and Arabic legal templates stay Arabic in every language (pinned by utils/law/i18n.test.js).
      const KEEP = ["محكمة النقض", "الفصل 1 …", "المبحث الأول: … المطلب الأول: … المطلب الثاني: … المبحث الثاني: …"];
      const missing = out.split("\n").filter(Boolean).map((line) => line.split("\t")[1]).filter((k) => !KEEP.includes(k));
      expect(missing).toEqual([]);
    });
  }
  test("Darija keeps every key it translates in sync with the source (no key without a source use)", () => {
    const fr = LOC("fr");
    const ary = LOC("ary");
    const orphan = Object.keys(ary).filter((k) => !(k in fr));
    expect(orphan).toEqual([]);
  });
});

describe("empty states use the mascot", () => {
  test("both EmptyState components render a MascotSlot with the message", async () => {
    const m = await mountJsx(`import K from "@/components/LawOS/kit/EmptyState";\nimport L from "@/components/LawOS/EmptyState";\nconst __default = () => <><K title="فارغ" hint="تلميح" /><L title="فارغ ٢">وصف</L></>;`, { lang: "fr" });
    const slots = m.container.querySelectorAll(".law-mascot-slot");
    expect(slots).toHaveLength(2);
    expect(slots[0].textContent).toContain("فارغ");
    expect(slots[0].textContent).toContain("تلميح");
    expect(slots[1].textContent).toContain("وصف");
    for (const s of slots) expect(s.querySelector("svg")).toBeNull(); // academic tone: no illustration
    await m.unmount();
  });
  test("on the desktop week grid an empty day uses the compact slot (a full one does not fit a 100px column)", async () => {
    const m = await mountJsx(`import MascotSlot from "@/components/LawOS/kit/MascotSlot";\nconst __default = () => <><MascotSlot compact message="a" /><MascotSlot message="b" /></>;`, { lang: "fr" });
    const [c, f] = m.container.querySelectorAll(".law-mascot-slot");
    expect(c.getAttribute("data-compact")).toBe("true");
    expect(f.getAttribute("data-compact")).toBeNull();
    expect(c.className).toContain("p-2");
    expect(f.className).toContain("p-6");
    expect(fs.readFileSync(path.join(SRC, "pages/LawOS/Schedule.jsx"), "utf8")).toContain("<MascotSlot compact={wide}");
    await m.unmount();
  });
  test("the empty-state titles are real headings again", async () => {
    const m = await mountJsx(`import K from "@/components/LawOS/kit/EmptyState";\nimport L from "@/components/LawOS/EmptyState";\nconst __default = () => <><K title="ك" /><L title="ل" /></>;`, { lang: "fr" });
    expect(m.container.querySelector("h3").textContent).toBe("ك");
    expect(m.container.querySelector("h2").textContent).toBe("ل");
    await m.unmount();
  });
  test("the hubs' bare 'nothing here' paragraphs are gone from the hub and squad pages that had them", () => {
    for (const f of ["Schedule", "Hub", "Squad", "SquadWorkspace"]) {
      const src = fs.readFileSync(path.join(SRC, `pages/LawOS/${f}.jsx`), "utf8");
      expect(src).toContain("MascotSlot");
      expect(src).not.toMatch(/<p className="law-muted[^"]*">\{tr\("لا (?:حصص في هذا اليوم|ملخصات عامة هنا|مواد بعد|محاضرات بعد)/);
    }
  });
});

describe("responsive guard (360 / 768 / 1280 / 1920)", () => {
  const HUB_PAGES = ["Today", "Path", "ExamCenter", "Timetable", "Schedule", "Library", "Community", "Campus", "Friends", "Squad", "SquadDocs", "SquadDoc", "SquadChangeRequest"];
  test("the hub and community pages have no fixed pixel width wider than a 360px phone and no unprefixed grid of four or more columns", () => {
    const bad = [];
    for (const p of HUB_PAGES) {
      const src = fs.readFileSync(path.join(SRC, `pages/LawOS/${p}.jsx`), "utf8");
      for (const m of src.matchAll(/\b(?:min-w|w|min-inline|inline)-\[(\d+)px\]/g)) if (Number(m[1]) > 360) bad.push(`${p}: ${m[0]}`);
      for (const m of src.matchAll(/\b(?:minWidth|width|inlineSize|minInlineSize)\s*:\s*["']?(\d{3,})(?:px)?\b/g)) if (Number(m[1]) > 360) bad.push(`${p}: ${m[0]}`);
      for (const m of src.matchAll(/(?<![:\w-])grid-cols-([4-9]|1\d)\b/g)) bad.push(`${p}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
  test("the global stylesheets never force a width wider than a phone outside a min-width media query", () => {
    const bad = [];
    for (const f of ["components/LawOS/lawos.css", "components/LawOS/kit/ui.css", "pages/LawOS/portal.css"]) {
      const css = fs.readFileSync(path.join(SRC, f), "utf8").replace(/@media[^{]*min-width[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
      for (const m of css.matchAll(/(?:^|[;{\s])(min-width|min-inline-size|width|inline-size)\s*:\s*(\d{3,})px/g)) if (Number(m[2]) > 360) bad.push(`${f}: ${m[0].trim()}`);
    }
    expect(bad).toEqual([]);
  });
  test("the campus wall isolates names and titles that mix Latin, digits and Arabic (bdi) in both writing directions", async () => {
    const mixed = "Article 123 ق.ل.ع — Code civil";
    const wall = async (url) => (String(url).includes("/campus/posts") ? json({ posts: [{ id: "p1", kind: "td_thread", title: mixed, body: "b", author: { userId: 2, name: "Youssef بنعلي" }, mine: false, createdAt: "2026-10-01T10:00:00Z", replyCount: 0 }], next: null }) : json({}, false, 404));
    for (const lang of ["ar", "fr"]) {
      const m = await mountJsx(`import { MemoryRouter } from "react-router-dom";\nimport Campus from "@/pages/LawOS/Campus";\nconst __default = () => <MemoryRouter><Campus /></MemoryRouter>;`, { lang, fetch: wall });
      await m.idle();
      const inBdi = [...m.container.querySelectorAll("bdi")].map((b) => b.textContent);
      expect(inBdi).toContain(mixed);
      expect(inBdi).toContain("Youssef بنعلي");
      await m.unmount();
    }
  });
});
