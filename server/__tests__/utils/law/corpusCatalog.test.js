const fs = require("fs");
const C = require("../../../utils/law/corpusCatalog");

const shipped = () => JSON.parse(fs.readFileSync(C.FILE, "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));

describe("top-40 list", () => {
  beforeEach(() => C.reset());
  test("40 unique catalog slugs, all in force, mixing conventions and national texts, flagged by build()", () => {
    const top = C.topSlugs();
    expect(top).toHaveLength(40);
    expect(new Set(top).size).toBe(40);
    const cat = C.load();
    const bySlug = new Map(cat.entries.map((e) => [e.slug, e]));
    for (const s of top) {
      expect(bySlug.has(s)).toBe(true);
      expect(bySlug.get(s).status).not.toBe("repealed");
    }
    expect(top.filter((s) => bySlug.get(s).levelSlug === "treaties").length).toBeGreaterThanOrEqual(8);
    expect(top.filter((s) => bySlug.get(s).levelSlug === "ordinary-laws-codes").length).toBeGreaterThanOrEqual(15);
    const built = C.build([], new Map(), { includeAll: true });
    const flagged = built.flatMap((c) => c.entries).filter((e) => e.topRank >= 0); // a level's `entries` already holds its groups' items
    expect(flagged).toHaveLength(40);
    expect(flagged.map((e) => e.topRank).sort((a, b) => a - b)).toEqual([...Array(40).keys()]);
  });
});

describe("shipped 7-level Moroccan legal hierarchy catalog", () => {
  beforeEach(() => C.reset());

  test("7 levels in authentic constitutional order with Arabic, French, and English titles", () => {
    const cat = C.load();
    expect(cat.levels.map((l) => l.slug || l.id)).toEqual([
      "constitution",
      "treaties",
      "organic-laws",
      "framework-laws",
      "ordinary-laws-codes",
      "decrees",
      "orders-regulatory-decisions",
    ]);
    expect(cat.levels[0].title.ar).toBe("الدستور");
    expect(cat.levels[1].title.ar).toBe("الاتفاقيات والمعاهدات الدولية المصادق عليها");
    expect(cat.levels[2].title.ar).toBe("القوانين التنظيمية");
    expect(cat.levels[3].title.ar).toBe("القوانين الإطار");
    expect(cat.levels[4].title.ar).toBe("التشريع العادي والمدونات الأساسية");
    expect(cat.levels[5].title.ar).toBe("المراسيم التنظيمية");
    expect(cat.levels[6].title.ar).toBe("القرارات التنظيمية والنصوص التطبيقية");

    for (const l of cat.levels) {
      expect(l.title.ar && l.title.fr && l.title.en).toBeTruthy();
    }
  });

  test("holds 137 catalog entries with unique slugs and no raw article bodies", () => {
    const cat = C.load();
    expect(cat.entries.length).toBe(137);
    const slugs = cat.entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const e of cat.entries) {
      for (const k of ["text", "articles", "body", "content", "sourceUrl", "sha256"]) {
        expect(e).not.toHaveProperty(k);
      }
      expect(e.titleAr).toBeTruthy();
      expect(e.titleFr).toBeTruthy();
    }
  });

  test("all seeded codes are mapped and resolvable via entry()", () => {
    const { CODE_REGISTRY } = require("../../../models/lawCorpus").LawCorpus;
    for (const c of CODE_REGISTRY) {
      const found = C.entry(c.slug);
      expect(found).not.toBeNull();
    }
    expect(C.entry("DOC").titleAr).toBe("ظهير الالتزامات والعقود");
    expect(C.entry("CONST-2011").titleAr).toContain("دستور");
    expect(C.entry("ORG-REGIONS").titleAr).toContain("الجهات");
  });

  test("data integrity: replaced_by integrity, unique dbSlugs, valid ISO dates, and watch flags", () => {
    const cat = C.load();
    const slugSet = new Set(cat.entries.map((e) => e.slug));
    const dbSlugs = cat.entries.filter((e) => e.dbSlug).map((e) => e.dbSlug);

    expect(new Set(dbSlugs).size).toBe(dbSlugs.length);

    for (const e of cat.entries) {
      if (e.replaced_by) {
        expect(slugSet.has(e.replaced_by)).toBe(true);
      }
      if (e.date) {
        expect(e.date).toMatch(/^\d{4}(-\d{2}-\d{2})?$/);
      }
      if (e.in_force_from) {
        expect(e.in_force_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }

    const watched = cat.entries.filter((e) => e.watch).map((e) => e.slug);
    expect(watched).toContain("law-70-03-family-code");
    expect(watched).toContain("law-28-08-bar");
    expect(watched).toContain("lo-35-24-exception-unconstitutionality");
  });
});

describe("validation", () => {
  beforeEach(() => C.reset());

  test("rejects malformed catalog", () => {
    const bad = (mut) => {
      const c = clone(shipped());
      mut(c);
      expect(() => C.validate(c)).toThrow();
    };
    bad((c) => {
      c.levels.pop();
    });
    bad((c) => {
      c.levels[0].slug = "unknown-level";
    });
    bad((c) => {
      delete c.levels[0].title.ar;
    });
    bad((c) => {
      c.levels[0].items[0].text = "فصل...";
    });
    bad((c) => {
      c.levels[0].items[0].slug = "bad slug with spaces";
    });
    bad((c) => {
      c.levels[0].items.push(clone(c.levels[0].items[0]));
    }); // duplicate
    bad((c) => {
      c.levels[4].groups[3].items[1].replaced_by = "non-existent-slug-xyz";
    }); // invalid replaced_by
    expect(() => C.validate(null)).toThrow();
    expect(() => C.validate(shipped())).not.toThrow();
  });
});

describe("build", () => {
  beforeEach(() => C.reset());

  const code = (slug, over = {}) => ({
    slug,
    titleAr: `ع ${slug}`,
    titleFr: `fr ${slug}`,
    normLevel: "ORDINARY",
    articleCount: 0,
    reviewed: true,
    ...over,
  });

  test("joins ingested codes with article counts and provenance across 7 levels", () => {
    const prov = new Map([
      ["DOC", { sourceUrl: "https://src.example/doc", consolidatedAsOf: "2026-09-01", sha256: "ab".repeat(32) }],
    ]);
    const out = C.build([code("DOC", { articleCount: 1232 })], prov);

    expect(out.length).toBe(7);
    const ordinary = out.find((l) => l.slug === "ordinary-laws-codes");
    const doc = ordinary.entries.find((e) => e.slug === "DOC");
    expect(doc).toMatchObject({
      slug: "DOC",
      status: "in_force",
      articleCount: 1232,
      consolidatedAsOf: "2026-09-01",
      sourceUrl: "https://src.example/doc",
    });
  });

  test("ingested repealed text keeps repealed status", () => {
    const out = C.build([code("CPC-1974", { articleCount: 466 })], new Map(), { includeAll: true });
    const e = out.flatMap((l) => l.entries).find((x) => x.catalogSlug === "civil-procedure-1974");
    expect(e.status).toBe("repealed");
    expect(e.articleCount).toBe(466);
  });

  test("categoryFor maps all norm levels to the correct tier, separating DECREE and ORDER", () => {
    expect(C.categoryFor("CONSTITUTION")).toBe("constitution");
    expect(C.categoryFor("TREATY")).toBe("treaties");
    expect(C.categoryFor("ORGANIC")).toBe("organic-laws");
    expect(C.categoryFor("FRAMEWORK")).toBe("framework-laws");
    expect(C.categoryFor("ORDINARY")).toBe("ordinary-laws-codes");
    expect(C.categoryFor("DECREE")).toBe("decrees");
    expect(C.categoryFor("ORDER")).toBe("orders-regulatory-decisions");
  });

  test("computeStatus dynamically marks future inForceFrom as in_force_pending", () => {
    expect(C.computeStatus({ in_force_from: "2030-01-01" }, "2026-10-14")).toBe("in_force_pending");
    expect(C.computeStatus({ in_force_from: "2020-01-01" }, "2026-10-14")).toBe("in_force");
    expect(C.computeStatus({ status: "repealed" }, "2026-10-14")).toBe("repealed");
  });
});
