// RC3 Phase 1: six-hub navigation, legacy redirects, notification popover, device-aware QR handshake.
const fs = require("fs");
const path = require("path");
const { loadEsm, mountJsx } = require("../../utils/law/testing/renderJsx");

const SRC = path.resolve(__dirname, "../../../frontend/src");

const json = (body, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body });
function fakeFetch(routes, calls = []) {
  return async (url, init = {}) => {
    const key = `${init.method || "GET"} ${String(url).replace(/^.*\/api\/law/, "")}`;
    calls.push(key);
    for (const [k, v] of Object.entries(routes)) if (key === k || (k.endsWith("*") && key.startsWith(k.slice(0, -1)))) return typeof v === "function" ? v(key, init) : json(v);
    return json({}, false);
  };
}
const click = async (m, el) => m.act(async () => { el.dispatchEvent(new m.window.MouseEvent("click", { bubbles: true })); });
const byText = (m, sel, re) => [...m.container.ownerDocument.querySelectorAll(sel)].find((e) => re.test(e.textContent));

describe("theme default", () => {
  test("Dark Navy is the default and the OS colour scheme never decides (Brain L-0049)", async () => {
    const prefs = await loadEsm('export * from "@/components/LawOS/lib/prefs";');
    expect(prefs.getTheme()).toBe("dark");
    const tokens = fs.readFileSync(path.join(__dirname, "../../../frontend/src/styles/tokens.css"), "utf8");
    expect(tokens).not.toMatch(/prefers-color-scheme/);
    expect(tokens).toMatch(/data-law-theme="dark"\] \.lawos-root \{[^}]*--law-bg: #0b1220/);
  });
});

describe("legal branch profiles", () => {
  test("detect maps known module titles and returns null for unknown ones (never guesses civil law)", async () => {
    const { TALIB_LAW } = await loadEsm('export * from "@/components/LawOS/lib/lawProfiles";');
    expect(TALIB_LAW.detect("القانون الجنائي العام")).toBe("criminal");
    expect(TALIB_LAW.detect("المسطرة الجنائية")).toBe("criminal");
    expect(TALIB_LAW.detect("قانون الشركات")).toBe("commercial");
    expect(TALIB_LAW.detect("المسؤولية المدنية")).toBe("civil");
    expect(TALIB_LAW.detect("المالية العامة")).toBeNull();
    expect(TALIB_LAW.detect("Anglais juridique")).toBeNull();
    expect(TALIB_LAW.get(null)).toBeNull();
  });
});

describe("navigation", () => {
  test("five Talib v3 hubs in the specified order; the mobile bar carries all five; squads are carved out of community; path and timetable stay reachable", async () => {
    const nav = await loadEsm('export * from "@/navigation/nav.config";');
    expect(nav.NAV_HUBS.map((h) => h.id)).toEqual(["community", "today", "squads", "exam", "library"]);
    expect(nav.NAV_HUBS.map((h) => h.to)).toEqual(["/law/community", "/law/today", "/law/community/squads", "/law/exam", "/law/library"]);
    expect(nav.MOBILE_BAR_IDS).toEqual(nav.NAV_HUBS.map((h) => h.id));
    const today = nav.NAV_HUBS.find((h) => h.id === "today");
    expect(nav.isHubActive(today, "/law/timetable")).toBe(true);
    const hubOf = (p) => nav.NAV_HUBS.filter((h) => nav.isHubActive(h, p)).map((h) => h.id);
    expect(hubOf("/law/community/squads")).toEqual(["squads"]);
    expect(hubOf("/law/community/hub")).toEqual(["community"]);
    expect(hubOf("/law/path")).toEqual(["today"]);
    expect(nav.PATH_HUB.to).toBe("/law/path");
    expect(nav.SECONDARY_LINKS.map((l) => l.to)).toEqual(expect.arrayContaining(["/law/community", "/law/timetable"]));
  });

  test("every legacy path redirects to a route that exists; none shadows a live page", async () => {
    const { LEGACY_REDIRECTS } = await loadEsm('export * from "@/navigation/legacyRedirects";');
    const routes = fs.readFileSync(path.join(SRC, "pages/LawOS/routes.jsx"), "utf8");
    const pages = [...routes.matchAll(/^\s*"?([\w/:-]+)"?:\s*\(\) => import/gm)].map((m) => m[1]);
    const required = { subjects: "/law/path", method: "/law/path", review: "/law/exam", schedule: "/law/timetable" };
    for (const [from, to] of Object.entries(required)) expect(LEGACY_REDIRECTS.find(([f]) => f === from)?.[1].split("?")[0]).toBe(to);
    for (const [from, to] of LEGACY_REDIRECTS) {
      expect(pages).not.toContain(from);
      expect(to.startsWith("/law/")).toBe(true);
      const target = to.slice(5).split("?")[0];
      expect(pages).toContain(target);
    }
  });

  test("hub pages for every nav entry are registered", () => {
    const routes = fs.readFileSync(path.join(SRC, "pages/LawOS/routes.jsx"), "utf8");
    for (const p of ["today", "path", "timetable", "exam", "library", "community", "exam/cards", "exam/weak-spots", "notifications"]) expect(routes).toMatch(new RegExp(`"?${p}"?:\\s*\\(\\) => import`));
  });
});

describe("device class", () => {
  test("hover+fine pointer is desktop; touch is mobile; the Android wrapper is always mobile", async () => {
    const { detectDeviceClass } = await loadEsm('export * from "@/hooks/useDeviceClass";');
    const win = (hover, native) => ({ matchMedia: (q) => ({ matches: hover && q.includes("hover: hover") }), ...(native ? { QanouniNative: { postMessage() {} } } : {}) });
    expect(detectDeviceClass(win(true, false))).toBe("desktop");
    expect(detectDeviceClass(win(false, false))).toBe("mobile");
    expect(detectDeviceClass(win(true, true))).toBe("mobile");
    expect(detectDeviceClass({})).toBe("mobile");
  });
});

describe("QR scan parsing", () => {
  test("login links, friend links and bare friend codes; junk is rejected", async () => {
    const { parseScan } = await loadEsm('export * from "@/components/LawOS/qr/QrScanner";');
    const token = "a".repeat(32);
    expect(parseScan(`https://x.ma/law/qr/${token}`)).toEqual({ kind: "login", token });
    expect(parseScan("https://x.ma/law/profile?add=qan-sara-1234")).toEqual({ kind: "friend", code: "QAN-SARA-1234" });
    expect(parseScan("ABCD-2345")).toEqual({ kind: "friend", code: "ABCD-2345" });
    expect(parseScan("https://evil.example/")).toBeNull();
    expect(parseScan("")).toBeNull();
    expect(parseScan(null)).toBeNull();
  });
});

describe("notification popover", () => {
  const items = [
    { id: "n1", type: "FOLLOW_REQUEST", payload: { userId: 7, name: "Sara" }, readAt: null, createdAt: "2026-10-12T10:00:00Z" },
    { id: "n2", type: "HUB_CHANGE_REQUEST", payload: { changeRequestId: "c1", title: "Obligations", from: "Omar" }, readAt: null, createdAt: "2026-10-12T09:00:00Z" },
  ];
  const entry = `import { MemoryRouter, useLocation } from "react-router-dom";
import { NotificationBell } from "@/components/LawOS/Shell";
function Where() { const l = useLocation(); return <span id="where">{l.pathname}</span>; }
const __default = () => <MemoryRouter initialEntries={["/law/today"]}><Where /><NotificationBell /></MemoryRouter>;`;

  async function open(extra = {}) {
    const calls = [];
    const m = await mountJsx(entry, {
      lang: "fr",
      media: (q) => q.includes("min-width: 640px"),
      fetch: fakeFetch({
        "GET /notifications": { unread: 2, items },
        "GET /social/requests": { requests: [{ id: "r1", from: { userId: 7 } }] },
        "PATCH /notifications/*": { updated: 1 },
        "POST /notifications/read-all": { updated: 2 },
        "POST /social/requests/*": { ok: true },
        ...extra,
      }, calls),
    });
    return { m, calls };
  }
  const bell = (m) => m.container.querySelector("button[aria-haspopup='dialog']");
  const where = (m) => m.container.querySelector("#where").textContent;

  test("opens in place as a dialog without changing the route, shows grouped items and the view-all link", async () => {
    const { m } = await open();
    expect(bell(m).getAttribute("aria-expanded")).toBe("false");
    await click(m, bell(m));
    const dlg = m.container.querySelector("[role='dialog']");
    expect(dlg).not.toBeNull();
    expect(where(m)).toBe("/law/today");
    expect(dlg.textContent).toMatch(/Sara/);
    expect(dlg.textContent).toMatch(/Obligations/);
    expect(dlg.querySelector("a[href='/law/notifications']")).not.toBeNull();
    await m.unmount();
  });

  test("Escape closes it and focus returns to the bell; an outside press closes it too", async () => {
    const { m } = await open();
    await click(m, bell(m));
    await m.act(async () => { m.window.document.dispatchEvent(new m.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(m.container.querySelector("[role='dialog']")).toBeNull();
    expect(m.window.document.activeElement).toBe(bell(m));
    await click(m, bell(m));
    await m.act(async () => { m.window.document.body.dispatchEvent(new m.window.MouseEvent("mousedown", { bubbles: true })); });
    expect(m.container.querySelector("[role='dialog']")).toBeNull();
    await m.unmount();
  });

  test("a friend request is accepted inline, marked read, and the route does not change", async () => {
    const { m, calls } = await open();
    await click(m, bell(m));
    await click(m, byText(m, "button", /Accepter|^قبول/));
    expect(calls).toContain("POST /social/requests/r1/accept");
    expect(calls).toContain("PATCH /notifications/n1/read");
    expect(where(m)).toBe("/law/today");
    await m.unmount();
  });

  test("mark all as read calls the bulk endpoint and clears the badge", async () => {
    const { m, calls } = await open();
    await click(m, bell(m));
    await click(m, byText(m, "button", /Tout marquer/));
    expect(calls).toContain("POST /notifications/read-all");
    expect(bell(m).getAttribute("aria-label")).not.toMatch(/\(2\)/);
    await m.unmount();
  });

  test("below 640px it is a bottom sheet (modal dialog)", async () => {
    const calls = [];
    const m = await mountJsx(entry, { lang: "fr", media: () => false, fetch: fakeFetch({ "GET /notifications": { unread: 0, items: [] }, "GET /social/requests": { requests: [] } }, calls) });
    await click(m, bell(m));
    expect(m.container.ownerDocument.querySelector("[role='dialog'][aria-modal='true']")).not.toBeNull();
    await m.unmount();
  });
});

describe("notification badge and desktop scanner (critic findings)", () => {
  test("the badge counts every unread notification, not only the loaded page", async () => {
    const entry = `import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "@/components/LawOS/Shell";
const __default = () => <MemoryRouter><NotificationBell /></MemoryRouter>;`;
    const items = [{ id: "n1", type: "NEW_FOLLOWER", payload: { userId: 1, name: "A" }, readAt: null, createdAt: "2026-10-12T10:00:00Z" }, { id: "n2", type: "NEW_FOLLOWER", payload: { userId: 2, name: "B" }, readAt: null, createdAt: "2026-10-12T09:00:00Z" }];
    const m = await mountJsx(entry, { lang: "fr", media: (q) => q.includes("min-width: 640px"), fetch: fakeFetch({ "GET /notifications": { unread: 50, items }, "GET /social/requests": { requests: [] }, "PATCH /notifications/*": { updated: 1 } }) });
    const bell = () => m.container.querySelector("button[aria-haspopup='dialog']");
    await m.act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(bell().getAttribute("aria-label")).toMatch(/\(50\)/);
    await click(m, bell());
    expect(bell().getAttribute("aria-label")).toMatch(/\(50\)/); // opening the list does not shrink the count to the 2 loaded
    await click(m, [...m.container.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Marquer comme lu"));
    expect(bell().getAttribute("aria-label")).toMatch(/\(49\)/);
    await m.unmount();
  });

  test("the profile scan shortcut does not exist on desktop", async () => {
    const entry = `import { MemoryRouter } from "react-router-dom";
import { ScanQrButton } from "@/components/LawOS/qr/QrScanner";
const __default = () => <MemoryRouter><ScanQrButton /></MemoryRouter>;`;
    const desktop = await mountJsx(entry, { lang: "fr", media: (q) => q.includes("hover: hover") });
    expect(desktop.container.querySelector("button")).toBeNull();
    await desktop.unmount();
    const phone = await mountJsx(entry, { lang: "fr", media: () => false });
    expect(phone.container.querySelector("button")).not.toBeNull();
    await phone.unmount();
  });
});

describe("QR entry", () => {
  const entry = `import { MemoryRouter } from "react-router-dom";
import QrEntry from "@/components/LawOS/qr/QrEntry";
const __default = () => <MemoryRouter><QrEntry /></MemoryRouter>;`;
  const routes = { "GET /auth/me": {}, "GET /profile/me": { profile: { friendCode: "QAN-SARA-1234" } } };
  const mount = (desktop, getUserMedia) => mountJsx(entry, {
    lang: "fr",
    media: (q) => desktop && q.includes("hover: hover"),
    fetch: async (url) => {
      const u = String(url);
      if (u.includes("/friends/code")) return json({ shareCode: "AB12-CD34", whatsappUrl: "x" });
      if (u.includes("/me/profile")) return json({ profile: { avatarConfig: null } });
      if (u.includes("/me/academic")) return json({ academic: { facultyCode: "F1" } });
      if (u.includes("/faculties")) return json({ faculties: [{ code: "F1", nameAr: "كلية الحقوق", nameFr: "Faculté de droit" }] });
      return json({}, false, 404);
    },
  }).then((m) => { Object.defineProperty(m.window.navigator, "mediaDevices", { value: { getUserMedia }, configurable: true }); return m; });

  test("desktop shows my QR and code and never touches the camera", async () => {
    const gum = jest.fn();
    const m = await mount(true, gum);
    await click(m, m.container.querySelector("button"));
    await m.act(async () => {});
    const doc = m.container.ownerDocument;
    expect(doc.querySelector("svg[aria-label]")).not.toBeNull();
    expect(doc.body.textContent).toMatch(/AB12-CD34/); // the share code XXXX-XXXX
    expect(doc.body.textContent).toMatch(/Faculté de droit/); // faculty on the card
    const wa = [...doc.querySelectorAll("a")].find((a) => /wa\.me/.test(a.href));
    expect(wa && decodeURIComponent(wa.href)).toContain("AB12-CD34"); // WhatsApp invite carries the code
    expect(gum).not.toHaveBeenCalled();
    await m.unmount();
  });

  test("mobile offers scan or show; the camera is requested only after choosing scan", async () => {
    const gum = jest.fn().mockRejectedValue(new Error("denied"));
    const m = await mount(false, gum);
    await click(m, m.container.querySelector("button"));
    const doc = m.container.ownerDocument;
    const buttons = [...doc.querySelectorAll("[role='dialog'] button")].map((b) => b.textContent);
    expect(buttons.some((t) => /Scanner/.test(t))).toBe(true);
    expect(buttons.some((t) => /Afficher mon code/.test(t))).toBe(true);
    expect(gum).not.toHaveBeenCalled();
    await click(m, byText(m, "[role='dialog'] button", /Scanner/));
    await m.act(async () => {});
    expect(gum).toHaveBeenCalledTimes(1);
    // denied: the photo and manual-code fallbacks appear
    expect(doc.querySelector("input[type='file'][capture]")).not.toBeNull();
    expect(doc.querySelector("input[dir='ltr']")).not.toBeNull();
    await m.unmount();
  });
});
