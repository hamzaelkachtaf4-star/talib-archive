const mockStore = new Map();
jest.mock("../../utils/prisma", () => ({
  lawSetting: {
    findMany: jest.fn(async () =>
      [...mockStore.entries()].map(([key, value]) => ({ key, value }))
    ),
    findUnique: jest.fn(async ({ where }) =>
      mockStore.has(where.key) ? { key: where.key, value: mockStore.get(where.key) } : null
    ),
    upsert: jest.fn(({ where, create }) => ({ key: where.key, value: create.value })),
  },
  $transaction: jest.fn(async (ops) => {
    for (const op of ops) mockStore.set(op.key, op.value);
  }),
}));

const { LawSetting } = require("../../models/lawSetting");
const { setTestFallbackUser } = require("../../utils/law/tenant");

// Settings are per user since Qanouni: act as user 1.
beforeAll(() => setTestFallbackUser(1));
afterAll(() => setTestFallbackUser(null));
beforeEach(() => mockStore.clear());

describe("LawSetting", () => {
  test("returns defaults when nothing is stored", async () => {
    const all = await LawSetting.all();
    expect(all.dailyGoalMinutes).toBe(20);
    expect(all.desiredRetention).toBe(0.9);
  });

  test("persists valid updates", async () => {
    const { settings, error } = await LawSetting.update({ dailyGoalMinutes: 30 });
    expect(error).toBeNull();
    expect(settings.dailyGoalMinutes).toBe(30);
    expect(await LawSetting.get("dailyGoalMinutes")).toBe(30);
  });

  test("rejects unknown keys and invalid values without writing", async () => {
    expect((await LawSetting.update({ evil: 1 })).error).toMatch(/Unknown/);
    expect((await LawSetting.update({ desiredRetention: 2 })).error).toMatch(/Invalid/);
    expect(
      (await LawSetting.update({ dailyGoalMinutes: 25, newCardsPerDay: -1 })).error
    ).toMatch(/Invalid/);
    expect(mockStore.size).toBe(0);
  });
});
