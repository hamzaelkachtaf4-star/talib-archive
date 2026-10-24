// RC3 Phase 6 (client): the Library shows legal texts only, in three categories; non-corpus features moved.
const fs = require("fs");
const path = require("path");
const { IDBFactory } = require("fake-indexeddb");
const { loadEsm, mountJsx } = require("../../utils/law/testing/renderJsx");

const FR = require("../../../frontend/src/locales/qanouni/fr.json");
const json = (body, ok = true, status) => ({ ok, status: status || (ok ? 200 : 400), json: async () => body });
const settle = (m) => m.idle(); // waits for the requests in flight, not for a fixed time
const click = (m, el) => m.act(async () => { el.dispatchEvent(new m.window.MouseEvent("click", { bubbles: true })); });
const SRC = path.resolve(__dirname, "../../../frontend/src");

const catalog = { categories: [
  { id: "basic", titleAr: "القوانين الأساسية", titleFr: "Textes fondamentaux", titleEn: "Core laws", entries: [
    { slug: "DOC", titleAr: "ظهير الالتزامات والعقود", titleFr: "Dahir des obligations et des contrats", status: "ingested", articleCount: 250, reviewed: true, consolidatedAsOf: "2026-09-30" },
  ] },
  { id: "organic_framework", titleAr: "القوانين التنظيمية والقوانين الإطار", titleFr: "Lois organiques et lois-cadres", titleEn: "Organic and framework laws", entries: [{ slug: "ORG-REGIONS", titleAr: "القانون التنظيمي المتعلق بالجهات", titleFr: "Loi organique relative aux régions", status: "pending_source", articleCount: 0, reviewed: false, consolidatedAsOf: null }] },
  { id: "dahirs_decrees", titleAr: "أهم الظهائر والمراسيم", titleFr: "Principaux dahirs et décrets", titleEn: "Key dahirs and decrees", entries: [] },
] };

describe("Library page", () => {
  const entry = `import { MemoryRouter } from "react-router-dom";\nimport Library from "@/pages/LawOS/Library";\nconst __default = () => <MemoryRouter initialEntries={["/law/library"]}><Library /></MemoryRouter>;`;
  const mount = (fetchImpl, lang = "fr") => { globalThis.indexedDB = new IDBFactory(); return mountJsx(entry, { lang, fetch: fetchImpl }); };
  const online = async (url) => (String(url).includes("/corpus/catalog") ? json(catalog) : json({}, false, 404));

  test("renders exactly the three categories, in order, with ingested counts", async () => {
    const m = await mount(online);
    await settle(m);
    const sections = [...m.container.querySelectorAll("section[aria-label]")];
    expect(sections.every((s) => s.querySelector("li") === null)).toBe(true); // the 7-level tree is collapsed by default
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["Textes fondamentaux", "Lois organiques et lois-cadres", "Principaux dahirs et décrets"]);
    expect(sections[0].textContent).toContain("(1)");
    expect(sections[2].textContent).toContain("(0)");
    await m.unmount();
  });

  test("an ingested text shows its article count, consolidation date and read/offline actions; the API lists imported texts only, so no placeholder row exists", async () => {
    const m = await mount(online);
    await settle(m);
    await click(m, m.container.querySelector("section > button"));
    const rows = m.container.querySelectorAll("section")[0].querySelectorAll("li");
    expect(rows[0].textContent).toContain("250");
    expect(rows[0].textContent).toContain("2026-09-30");
    expect(rows[0].querySelector("a[href='/law/library/corpus?code=DOC']")).not.toBeNull();
    expect(rows[0].querySelector("button")).not.toBeNull();
    expect(rows.length).toBe(1);
    await m.unmount();
  });

  test("an ingested text links to its official source (https only) so the promise 'texts with their sources' holds", async () => {
    const withSrc = JSON.parse(JSON.stringify(catalog));
    withSrc.categories[0].entries[0].sourceUrl = "https://sgg.example.invalid/doc.pdf";
    withSrc.categories[0].entries[1] = { ...withSrc.categories[0].entries[1], status: "ingested", articleCount: 3, sourceUrl: "javascript:alert(1)" };
    const m = await mount(async (url) => (String(url).includes("/corpus/catalog") ? json(withSrc) : json({}, false, 404)));
    await settle(m);
    await click(m, m.container.querySelector("section > button"));
    const rows = m.container.querySelectorAll("section")[0].querySelectorAll("li");
    const a = rows[0].querySelector("a[target=_blank]");
    expect(a.getAttribute("href")).toBe("https://sgg.example.invalid/doc.pdf");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(rows[1].querySelector("a[target=_blank]")).toBeNull(); // a non-https value is never rendered as a link
    await m.unmount();
  });

  test("categories open and close; every category starts collapsed", async () => {
    const m = await mount(online);
    await settle(m);
    const heads = m.container.querySelectorAll("section > button");
    expect(heads[0].getAttribute("aria-expanded")).toBe("false");
    expect(heads[1].getAttribute("aria-expanded")).toBe("false");
    expect(m.container.querySelectorAll("section")[1].querySelector("li")).toBeNull();
    await click(m, heads[1]);
    expect(m.container.querySelectorAll("section")[1].querySelector("li").textContent).toContain("Loi organique relative aux régions");
    await m.unmount();
  });

  test("the page is for legal texts only: no courses, capture or legal-notice cards; the notice is a footer link", async () => {
    const m = await mount(online);
    await settle(m);
    const hrefs = [...m.container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/law/library/courses");
    expect(hrefs).not.toContain("/law/path/courses");
    expect(hrefs).not.toContain("/law/capture");
    expect(m.container.querySelector("footer a[href='/law/legal']")).not.toBeNull();
    expect(hrefs).toContain("/law/library/chat"); // asking questions about these texts stays here
    await m.unmount();
  });

  test("offline, the saved packs are the library and a notice says so", async () => {
    const m = await mount(async () => { throw new Error("offline"); });
    await settle(m);
    expect(m.container.textContent).toContain(FR["بدون اتصال: تظهر النصوص المحفوظة فقط."]);
    expect(m.container.querySelector("section")).not.toBeNull();
    await m.unmount();
  });

  test("a French reader sees French titles, an Arabic reader Arabic ones", async () => {
    const fr = await mount(online, "fr");
    await settle(fr);
    await click(fr, fr.container.querySelector("section > button"));
    expect(fr.container.textContent).toContain("Dahir des obligations et des contrats");
    await fr.unmount();
    const ar = await mount(online, "ar");
    await settle(ar);
    await click(ar, ar.container.querySelector("section > button"));
    expect(ar.container.textContent).toContain("ظهير الالتزامات والعقود");
    expect(ar.container.textContent).not.toContain("Dahir des obligations");
    await ar.unmount();
  });
});

describe("opening state: search box, recents, module texts", () => {
  const entry = `import { MemoryRouter } from "react-router-dom";\nimport Library from "@/pages/LawOS/Library";\nconst __default = () => <MemoryRouter initialEntries={["/law/library"]}><Library /></MemoryRouter>;`;
  const type = (m, el, v) => m.act(async () => {
    Object.getOwnPropertyDescriptor(m.window.HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new m.window.Event("input", { bubbles: true }));
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const articleLinks = (m) => [...m.container.querySelectorAll("[role=search] a")].map((a) => a.getAttribute("href")).filter((h) => h.startsWith("/law/corpus/a/"));
  const api = (articles) => async (url) => {
    const u = String(url);
    if (u.includes("/corpus/catalog")) return json(catalog);
    if (u.includes("/corpus/articles/")) {
      const id = decodeURIComponent(u.split("/corpus/articles/")[1].split("?")[0]);
      return articles[id] ? json({ article: articles[id], links: [] }) : json({ error: "not_found" }, false, 404);
    }
    return json({}, false, 404);
  };
  const doc230 = { "DOC:230": { articleNumber: "230", code: { numberingLabel: "الفصل", titleAr: "ظهير الالتزامات والعقود" } } };

  test("a typed citation («م 230 د.ع») links straight to that article", async () => {
    globalThis.indexedDB = new IDBFactory();
    const m = await mountJsx(entry, { lang: "ar", fetch: api(doc230) });
    await settle(m);
    await type(m, m.container.querySelector("[role=search] input"), "م 230 د.ع");
    await m.act(async () => { await wait(350); });
    await settle(m);
    expect(articleLinks(m)).toEqual(["/law/corpus/a/DOC%3A230"]);
    await m.unmount();
  });

  test("a citation to a number that is not in the corpus says so and never opens another article", async () => {
    globalThis.indexedDB = new IDBFactory();
    const m = await mountJsx(entry, { lang: "ar", fetch: api(doc230) });
    await settle(m);
    await type(m, m.container.querySelector("[role=search] input"), "م 325 د.ع");
    await m.act(async () => { await wait(350); });
    await settle(m);
    expect(articleLinks(m)).toEqual([]);
    expect(m.container.querySelector("[role=search]").textContent).toContain("غير موجود في النص المستورد");
    await m.unmount();
  });

  test("a server error is not reported as «article does not exist»", async () => {
    globalThis.indexedDB = new IDBFactory();
    const m = await mountJsx(entry, { lang: "ar", fetch: async (url) => (String(url).includes("/corpus/articles/") ? json({}, false, 500) : String(url).includes("/corpus/catalog") ? json(catalog) : json({}, false, 404)) });
    await settle(m);
    await type(m, m.container.querySelector("[role=search] input"), "م 230 د.ع");
    await m.act(async () => { await wait(350); });
    await settle(m);
    expect(m.container.querySelector("[role=search]").textContent).not.toContain("غير موجود في النص المستورد");
    expect(m.container.querySelector("[role=search]").textContent).toContain("تعذر البحث الآن");
    await m.unmount();
  });

  test("editing a citation clears the previous result at once (no stale tappable row)", async () => {
    globalThis.indexedDB = new IDBFactory();
    const m = await mountJsx(entry, { lang: "ar", fetch: api(doc230) });
    await settle(m);
    const input = m.container.querySelector("[role=search] input");
    await type(m, input, "م 230 د.ع");
    await m.act(async () => { await wait(350); });
    await settle(m);
    expect(articleLinks(m)).toEqual(["/law/corpus/a/DOC%3A230"]);
    await type(m, input, "م 2300 د.ع");
    expect(articleLinks(m)).toEqual([]);
    await m.unmount();
  });

  test("with nothing typed, recents saved by this account are listed", async () => {
    globalThis.indexedDB = new IDBFactory();
    const idb = await loadEsm('export * from "@/components/LawOS/lib/idb";');
    await idb.setMeta("libraryRecents", [{ canonicalId: "DOC:230", label: "الفصل 230 · ظهير الالتزامات والعقود" }]);
    const m = await mountJsx(entry, { lang: "ar", fetch: api(doc230) });
    await settle(m);
    expect(articleLinks(m)).toEqual(["/law/corpus/a/DOC%3A230"]);
    await m.unmount();
  });
});

describe("relocated features", () => {
  test("courses and capture are reachable from their new homes", async () => {
    const path_ = fs.readFileSync(path.join(SRC, "pages/LawOS/Path.jsx"), "utf8");
    const today = fs.readFileSync(path.join(SRC, "pages/LawOS/Today.jsx"), "utf8");
    expect(path_).toContain('to="/law/path/courses"');
    expect(today).toContain('to="/law/capture?tab=inbox"'); // the inbox card is Today's door to capture
    const settings = fs.readFileSync(path.join(SRC, "pages/LawOS/Settings.jsx"), "utf8");
    expect(settings).toContain('to="/law/capture"'); // capture, squads and community are tucked into Settings
    expect(settings).toContain('to="/law/community/squads"');
  });

  test("old course links redirect (exact and with an id) and the pages are registered under the study path", async () => {
    const routes = fs.readFileSync(path.join(SRC, "pages/LawOS/routes.jsx"), "utf8");
    expect(routes).toMatch(/"path\/courses":\s*\(\) => import\("\.\/Courses"\)/);
    expect(routes).toMatch(/"path\/courses\/:id":\s*\(\) => import\("\.\/Course"\)/);
    expect(routes).not.toMatch(/"library\/courses[^"]*":\s*\(\) => import/); // no page of its own any more, only redirects
    expect(routes).toMatch(/path: "library\/courses\/:id", element: <CourseRedirect/);
    const { LEGACY_REDIRECTS } = await loadEsm('export * from "@/navigation/legacyRedirects";');
    expect(LEGACY_REDIRECTS).toContainEqual(["library/courses", "/law/path/courses"]);
    for (const f of ["components/LawOS/Course/ImportNotebook.jsx", "pages/LawOS/Courses.jsx", "pages/LawOS/Course.jsx"]) expect(fs.readFileSync(path.join(SRC, f), "utf8")).not.toContain("/law/library/courses");
  });

  test("navigation highlights follow the move: capture belongs to Today, courses to the study path", async () => {
    const nav = await loadEsm('export * from "@/navigation/nav.config";');
    const hub = (id) => nav.NAV_HUBS.find((h) => h.id === id);
    expect(nav.isHubActive(hub("today"), "/law/capture")).toBe(true);
    expect(nav.isHubActive(hub("library"), "/law/capture")).toBe(false);
    expect(nav.isHubActive(nav.PATH_HUB, "/law/path/courses/abc")).toBe(true);
    expect(nav.isHubActive(hub("library"), "/law/library/corpus")).toBe(true);
    expect(nav.isHubActive(hub("library"), "/law/legal")).toBe(true);
  });
});

describe("source hygiene", () => {
  test("no hex colours, physical-direction classes or typed arrows in the library", () => {
    const src = fs.readFileSync(path.join(SRC, "pages/LawOS/Library.jsx"), "utf8");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/(^|[^\w-])-?(ml|mr|pl|pr|left|right)-[\w[]/);
    expect(src).not.toMatch(/[←→]/);
  });
});
