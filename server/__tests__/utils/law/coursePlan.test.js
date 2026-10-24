const { parseOutline, serializeOutline, isValidTree, orderByPlan } = require("../../../utils/law/coursePlan");

const OUTLINE = ["المبحث الأول: أركان العقد", "  المطلب الأول: التراضي", "  - المطلب الثاني: المحل", "المبحث الثاني: آثار العقد", "\tالمطلب الأول: القوة الملزمة"].join("\n");

test("indented text ↔ tree", () => {
  const tree = parseOutline(OUTLINE);
  expect(tree.map((n) => n.title)).toEqual(["المبحث الأول: أركان العقد", "المبحث الثاني: آثار العقد"]);
  expect(tree[0].children.map((n) => n.title)).toEqual(["المطلب الأول: التراضي", "المطلب الثاني: المحل"]);
  expect(isValidTree(tree)).toBe(true);
  expect(parseOutline(serializeOutline(tree))).toEqual(tree);
  expect(isValidTree([{ title: "" }])).toBe(false);
});

test("atoms follow the plan; diacritics don't matter; unplaced last", () => {
  const tree = parseOutline(OUTLINE);
  const atoms = [
    { id: "x", headingPath: [], createdAt: "2026-01-01" },
    { id: "b", headingPath: ["المبحث الثاني: آثار العقد", "المطلب الأول: القوة الملزمة"], createdAt: "2026-01-02" },
    { id: "a", headingPath: ["المبحث الأول: أركان العقد", "المطلب الثاني: المحل"], createdAt: "2026-01-03" },
    { id: "a0", headingPath: ["المَطْلَبُ الأول: التراضي"], createdAt: "2026-01-04" }, // leaf only, diacritized
  ];
  expect(orderByPlan(atoms, tree).map((x) => x.id)).toEqual(["a0", "a", "b", "x"]);
});
