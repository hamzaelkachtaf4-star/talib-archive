// RC3 Phase 7 (client): friend code card, squad documents by role, campus wall, notification wording.
const { loadEsm, mountJsx } = require("../../utils/law/testing/renderJsx");

const FR = require("../../../frontend/src/locales/qanouni/fr.json");
const json = (body, ok = true, status) => ({ ok, status: status || (ok ? 200 : 400), json: async () => body });
const settle = (m) => m.idle();
const click = (m, el) => m.act(async () => { el.dispatchEvent(new m.window.MouseEvent("click", { bubbles: true })); });
const has = (m, text) => m.container.textContent.includes(text);
const route = (table) => async (url, init) => {
  const u = String(url).replace(/^.*\/api/, "");
  const hit = Object.keys(table).find((k) => u.startsWith(k));
  return hit ? json(typeof table[hit] === "function" ? table[hit](u, init) : table[hit]) : json({}, false, 404);
};

const mountPage = (importPath, initial, fetchImpl, { admin = false, user = { id: 1, role: "default" }, lang = "fr", pattern = "*" } = {}) => {
  const entry = `import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LawUserContext } from "@/components/LawOS/lib/useLawUser";
import Page from "${importPath}";
const __default = () => <LawUserContext.Provider value={${JSON.stringify(admin ? { id: 1, role: "admin" } : user)}}><MemoryRouter initialEntries={[${JSON.stringify(initial)}]}><Routes><Route path=${JSON.stringify(pattern)} element={<Page />} /></Routes></MemoryRouter></LawUserContext.Provider>;`;
  return mountJsx(entry, { lang, fetch: fetchImpl });
};

describe("friend code card", () => {
  test("shows the XXXX-XXXX code and a WhatsApp share button that opens the server-built link", async () => {
    const opened = [];
    const fetchImpl = route({
      "/law/social/friends": { friends: [] }, "/law/social/requests": { requests: [] }, "/law/social/suggestions": { suggestions: [] },
      "/law/social/config": { contactMatch: false, hasPhone: false }, "/law/profile": { progress: { friendCode: "QAN-X-1234" } },
      "/law/friends/code": { shareCode: "K7M2-PQ9X", whatsappUrl: "https://wa.me/?text=join%20K7M2-PQ9X" },
    });
    const m = await mountPage("@/pages/LawOS/Friends", "/law/community/friends", fetchImpl);
    m.window.open = (...a) => opened.push(a);
    await settle(m);
    const find = [...m.container.querySelectorAll("[role=tab]")].find((b) => b.textContent.includes(FR["بحث"]));
    await click(m, find);
    expect(m.container.querySelector("bdi.tracking-widest").textContent).toBe("K7M2-PQ9X");
    expect(m.container.querySelector("input[placeholder*='XXXX-XXXX']")).not.toBeNull();
    const wa = [...m.container.querySelectorAll("button")].find((b) => b.textContent.includes(FR["مشاركة عبر واتساب"]));
    await click(m, wa);
    expect(opened[0][0]).toBe("https://wa.me/?text=join%20K7M2-PQ9X");
    expect(opened[0][2]).toContain("noopener");
    await m.unmount();
  });
});

describe("squad documents by role", () => {
  const docs = (role, extra = {}) => route({
    "/law/squads/docs": { docs: [{ id: "d1", type: "summary", title: "ملخص الالتزامات", author: "سلمى", openChangeRequests: 1 }], myRole: role },
    "/law/squads/change-requests": { changeRequests: extra.crs || [] },
  });
  test("a viewer reads but cannot create; an editor can", async () => {
    const v = await mountPage("@/pages/LawOS/SquadDocs", "/law/squad/docs", docs("viewer"));
    await settle(v);
    expect(has(v, FR["أنت قارئ في هذه الفرقة: يمكنك الاطلاع فقط."])).toBe(true);
    expect(has(v, FR["وثيقة جديدة"])).toBe(false);
    expect(has(v, "ملخص الالتزامات")).toBe(true);
    await v.unmount();
    const e = await mountPage("@/pages/LawOS/SquadDocs", "/law/squad/docs", docs("editor"));
    await settle(e);
    expect(has(e, FR["وثيقة جديدة"])).toBe(true);
    await e.unmount();
  });
  test("only work document types can be chosen: no chat, no sticker", async () => {
    const e = await mountPage("@/pages/LawOS/SquadDocs", "/law/squad/docs", docs("editor"));
    await settle(e);
    await click(e, [...e.container.querySelectorAll("button")].find((b) => b.textContent.includes(FR["وثيقة جديدة"])));
    const opts = [...e.container.querySelectorAll("select option")].map((o) => o.value);
    expect(opts).toEqual(["summary", "memo", "case_brief", "mock_exam", "question", "resource_link"]);
    await e.unmount();
  });
  test("the open change requests are listed with a link to their review page", async () => {
    const m = await mountPage("@/pages/LawOS/SquadDocs", "/law/squad/docs", docs("admin", { crs: [{ id: "c1", title: "تصحيح", docTitle: "ملخص الالتزامات", author: { userId: 2, name: "يوسف" }, status: "CONFLICT" }] }));
    await settle(m);
    expect(m.container.querySelector("a[href='/law/squad/change-requests/c1']")).not.toBeNull();
    expect(has(m, FR["تعارض"])).toBe(true);
    await m.unmount();
  });
  const docView = (over) => route({
    "/law/squads/docs/d1/revisions": { revisions: [{ id: "r1", createdAt: "2026-10-01T10:00:00Z", author: "سلمى", head: true }] },
    "/law/squads/docs/d1": { doc: { id: "d1", type: "summary", title: "ملخص", author: "سلمى", content: "نص", headRevisionId: "r1", updatedAt: "2026-10-01T10:00:00Z" }, myRole: "editor", canEditDirect: false, canPropose: true, canReview: false, ...over },
  });
  test("a non-author editor proposes (with the review warning); the author edits in place; a viewer gets neither", async () => {
    const prop = await mountPage("@/pages/LawOS/SquadDoc", "/law/squad/docs/d1", docView({}), { pattern: "/law/squad/docs/:id" });
    await settle(prop);
    await click(prop, [...prop.container.querySelectorAll("button")].find((b) => b.textContent.includes(FR["اقتراح تعديل"])));
    expect(has(prop, FR["لست صاحب هذه الوثيقة: سيُرسل تعديلك كطلب يراجعه مشرف الفرقة قبل الدمج."])).toBe(true);
    await prop.unmount();
    const own = await mountPage("@/pages/LawOS/SquadDoc", "/law/squad/docs/d1", docView({ canEditDirect: true }), { pattern: "/law/squad/docs/:id" });
    await settle(own);
    expect([...own.container.querySelectorAll("button")].some((b) => b.textContent.trim() === FR["تعديل"])).toBe(true);
    await own.unmount();
    const view = await mountPage("@/pages/LawOS/SquadDoc", "/law/squad/docs/d1", docView({ myRole: "viewer", canPropose: false }), { pattern: "/law/squad/docs/:id" });
    await settle(view);
    expect([...view.container.querySelectorAll("button")]).toHaveLength(0);
    await view.unmount();
  });
  test("review page: merge for reviewers, a stale-base warning, nothing to merge for the author's own view", async () => {
    const cr = (over) => route({ "/law/squads/change-requests/c1": { changeRequest: { id: "c1", docId: "d1", title: "تصحيح", status: "OPEN", author: { userId: 2, name: "يوسف" } }, docTitle: "ملخص", diff: [{ type: "same", text: "فقرة" }, { type: "add", text: "جديدة" }], headChanged: true, mergeable: true, conflicts: [], proposedContent: "x", canReview: true, ...over } });
    const r = await mountPage("@/pages/LawOS/SquadChangeRequest", "/law/squad/change-requests/c1", cr({}), { pattern: "/law/squad/change-requests/:id" });
    await settle(r);
    expect(has(r, FR["تغيّرت الوثيقة منذ هذا الاقتراح، لكن التعديلين لا يتعارضان وسيُدمجان."])).toBe(true);
    expect([...r.container.querySelectorAll("button")].some((b) => b.textContent.includes(FR["موافقة ودمج"]))).toBe(true);
    await r.unmount();
    const c = await mountPage("@/pages/LawOS/SquadChangeRequest", "/law/squad/change-requests/c1", cr({ canReview: false, mergeable: false }), { pattern: "/law/squad/change-requests/:id" });
    await settle(c);
    expect([...c.container.querySelectorAll("button")].some((b) => b.textContent.includes(FR["موافقة ودمج"]))).toBe(false);
    expect(has(c, FR["تغيّرت الوثيقة في الفقرات نفسها: لا يمكن الدمج دون مراجعة صاحب الاقتراح."])).toBe(true);
    await c.unmount();
  });
});

describe("rebase starts from the current text", () => {
  test("the author's rebase editor is pre-filled with the suggestion (current text plus their changes), not their old proposal", async () => {
    const f = route({ "/law/squads/change-requests/c1": { changeRequest: { id: "c1", docId: "d1", title: "ت", status: "OPEN", author: { userId: 1, name: "أنا" } }, docTitle: "م", diff: [], headChanged: true, mergeable: true, conflicts: [], proposedContent: "القديم", suggestedContent: "الحالي مع تعديلي", canReview: false } });
    const m = await mountPage("@/pages/LawOS/SquadChangeRequest", "/law/squad/change-requests/c1", f, { pattern: "/law/squad/change-requests/:id" });
    await settle(m);
    await click(m, [...m.container.querySelectorAll("button")].find((b) => b.textContent.includes(FR["مراجعة وإعادة التأسيس"])));
    expect(m.container.querySelector("textarea").value).toBe("الحالي مع تعديلي");
    await m.unmount();
  });
});

describe("reading-group colours", () => {
  test("each contributor gets a stable distinct colour and the viewer is always first (emerald)", async () => {
    const { contributorColors } = await loadEsm('export { contributorColors } from "@/components/LawOS/Squad/MasterNoteView";');
    const note = { contributors: [{ userId: 2 }, { userId: 3 }, { userId: 7 }], sections: [{ author: { userId: 3 } }, { author: { userId: 9 } }, { author: { userId: null } }] };
    const c = contributorColors(note, 7);
    expect([...c.keys()]).toEqual(["7", "2", "3", "9"]);
    expect(new Set(c.values()).size).toBe(4);
    expect(c.get("7")).toBe("rgb(16 185 129)");
    expect(contributorColors(note, 7)).toEqual(c); // stable between renders
    expect([...contributorColors({ contributors: [], sections: [] }, null).keys()]).toEqual([]);
  });
});

describe("forum tabs", () => {
  test("the faculty forum opens on the wall; the squads hub has its own tabs", async () => {
    const { FORUM_TABS, SQUAD_TABS } = await loadEsm('export * from "@/components/LawOS/kit/CommunityTabs";');
    expect(FORUM_TABS().map((t) => t.to)).toEqual(["/law/community/campus", "/law/community/hub", "/law/community/friends"]);
    expect(SQUAD_TABS().map((t) => t.to)).toEqual(["/law/community/squads", "/law/squad/docs"]);
  });
});

describe("campus wall", () => {
  const wall = route({ "/law/campus/posts": { posts: [{ id: "p1", kind: "td_thread", title: "موعد الحصة", body: "متى؟", author: { userId: 2, name: "يوسف" }, mine: false, createdAt: "2026-10-01T10:00:00Z", replyCount: 2 }], next: null } });
  test("every student chooses a post type (announcement, TD exchange, legal discussion); only admins get the moderation link", async () => {
    const s = await mountPage("@/pages/LawOS/Campus", "/law/community/campus", wall, { pattern: "/law/community/campus" });
    await settle(s);
    expect(has(s, "موعد الحصة")).toBe(true);
    expect([...s.container.querySelectorAll("select option")].map((o) => o.value)).toEqual(["announcement", "td_thread", "legal_discussion", "inquiry"]);
    expect(s.container.querySelector("a[href='/law/community/campus/moderation']")).toBeNull();
    await s.unmount();
    const a = await mountPage("@/pages/LawOS/Campus", "/law/community/campus", wall, { admin: true, pattern: "/law/community/campus" });
    await settle(a);
    expect([...a.container.querySelectorAll("select option")].map((o) => o.value)).toEqual(["announcement", "td_thread", "legal_discussion", "inquiry"]);
    expect(a.container.querySelector("a[href='/law/community/campus/moderation']")).not.toBeNull();
    await a.unmount();
  });
  test("a missing faculty is explained, not an empty wall", async () => {
    const m = await mountPage("@/pages/LawOS/Campus", "/law/community/campus", async () => json({ error: "no_faculty" }, false, 400), { pattern: "/law/community/campus" });
    await settle(m);
    expect(has(m, FR["حدّد كليتك في ملفك الدراسي لترى جدار الكلية."])).toBe(true);
    await m.unmount();
  });
  test("moderation page is for admins only", async () => {
    const m = await mountPage("@/pages/LawOS/Campus", "/law/community/campus/moderation", wall, { pattern: "/law/community/campus/:id" });
    await settle(m);
    expect(has(m, FR["هذه الصفحة للإدارة فقط."])).toBe(true);
    await m.unmount();
  });
});

describe("notification wording", () => {
  test("squad and campus notifications have their own text and link", async () => {
    const { describe: d } = await loadEsm('export * from "@/components/LawOS/notifications/describe";', { lang: "fr" });
    const doc = d({ type: "SQUAD_DOC_NEW", payload: { docId: "d1", title: "ملخص", from: "سلمى" } });
    expect(doc).toMatchObject({ group: "squads", to: "/law/squad/docs/d1" });
    expect(d({ type: "SQUAD_CR_OPENED", payload: { changeRequestId: "c1", title: "ت", from: "ي" } })).toMatchObject({ group: "squads", to: "/law/squad/change-requests/c1" });
    expect(d({ type: "SQUAD_CR_MERGED", payload: { docId: "d1", title: "ت" } }).to).toBe("/law/squad/docs/d1");
    expect(d({ type: "SQUAD_ROLE_CHANGED", payload: {} }).group).toBe("squads");
    expect(d({ type: "CAMPUS_REPLY", payload: { postId: "p1", title: "س" } }).to).toBe("/law/community/campus/p1");
  });
});
