// RC2 3.2: the roadmap renders whatever depth the course data has (section = path joined by " › ").
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.resolve(__dirname, "../../../../frontend/src/components/LawOS/lib/pathGroups.js"), "utf8").replace(/export /g, "");
const { groupNodes, SECTION_SEP } = new Function(`${src}; return { groupNodes, SECTION_SEP };`)();

const n = (id, section, state = "AVAILABLE") => ({ id, section, state });

test("flat scaffold: one level, fraction per level", () => {
  const t = groupNodes([n(1, "الأساسيات", "COMPLETED"), n(2, "الأساسيات"), n(3, "التطبيق")]);
  expect(t.children.map((g) => [g.label, g.done, g.total])).toEqual([["الأساسيات", 1, 2], ["التطبيق", 0, 1]]);
});

test("five levels (قسم › فصل › مبحث › مطلب › فقرة): nested, each level counts its descendants", () => {
  const S = (...p) => p.join(SECTION_SEP);
  const t = groupNodes([
    n(1, S("القسم الأول", "الفصل الأول", "المبحث الأول", "المطلب الأول", "الفقرة 1"), "COMPLETED"),
    n(2, S("القسم الأول", "الفصل الأول", "المبحث الأول", "المطلب الأول", "الفقرة 2")),
    n(3, S("القسم الأول", "الفصل الأول", "المبحث الأول", "المطلب الثاني")),
    n(4, S("القسم الأول", "الفصل الثاني")),
  ]);
  const part = t.children[0];
  expect([part.depth, part.done, part.total]).toEqual([0, 1, 4]);
  const chapter1 = part.children[0];
  expect([chapter1.depth, chapter1.done, chapter1.total]).toEqual([1, 1, 3]);
  const m1 = chapter1.children[0].children[0];
  expect([m1.label, m1.depth, m1.done, m1.total]).toEqual(["المطلب الأول", 3, 1, 2]);
  expect(m1.children.map((g) => g.depth)).toEqual([4, 4]);
  expect(part.children[1].nodes.map((x) => x.node.id)).toEqual([4]);
});

test("a node without a section sits at the root; global index follows data order", () => {
  const t = groupNodes([n("a", ""), n("b", "س")]);
  expect(t.nodes.map((x) => x.index)).toEqual([1]);
  expect(t.children[0].nodes[0].index).toBe(2);
});
