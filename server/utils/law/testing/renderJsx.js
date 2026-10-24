// Server-side render of LawOS React components inside jest (no jsdom needed).
// Bundles an entry module with the frontend's own esbuild: `@` -> frontend/src, React bundled in.
const path = require("path");
const Module = require("module");
const FRONT = path.resolve(__dirname, "../../../../frontend");
const esbuild = require(require.resolve("esbuild", { paths: [FRONT] }));

const FRONT_SRC = path.join(FRONT, "src");
const commonOptions = (contents) => ({
  stdin: { contents, resolveDir: FRONT_SRC, loader: "jsx" },
  bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
  tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } },
  alias: { "@": FRONT_SRC },
  nodePaths: [path.join(FRONT, "node_modules")],
  loader: { ".jsx": "jsx", ".js": "jsx", ".json": "json", ".svg": "text", ".css": "empty" },
  define: { "import.meta.env": JSON.stringify({ VITE_API_BASE: "/api" }) },
  logLevel: "silent",
});

// One esbuild per distinct entry per process: suites mount the same entry many times and the gate runs them in parallel with
// timing-sensitive tests, so redundant bundling is wasted CPU.
const bundles = new Map();
function build(kind, source, options) {
  const key = `${kind}\0${source}`;
  if (!bundles.has(key)) bundles.set(key, esbuild.buildSync(options).outputFiles[0].text);
  return bundles.get(key);
}

function bundleToModule(code) {
  // new Function (not Module#_compile) so the bundle runs in the caller's realm: jest's jsdom-like globals are visible to it.
  const m = { exports: {} };
  const req = Module.createRequire(path.join(FRONT, "package.json"));
  new Function("module", "exports", "require", code)(m, m.exports, req);
  return m.exports;
}

/**
 * @param {string} entrySource ES module source; must `export default` a function returning a React element,
 *   or `export const el = ...`. Receives nothing; build the element with JSX inside.
 * @param {{lang?: string}} [opts] lang is set as the stored UI language before the app code loads.
 * @returns {Promise<string>} static HTML
 */
async function renderJsx(entrySource, opts = {}) {
  const contents = `import { renderToStaticMarkup } from "react-dom/server";\n${entrySource}\nexport const html = () => renderToStaticMarkup(typeof __default === "function" ? __default() : __default);`;
  const code = build("render", contents, commonOptions(contents));
  const storage = new Map(opts.lang ? [["qanouni_lang", opts.lang]] : []);
  const prev = global.localStorage;
  global.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
  try {
    const mod = bundleToModule(code);
    if (mod.ready) await mod.ready;
    return mod.html();
  } finally {
    global.localStorage = prev;
  }
}

const GLOBALS = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "HTMLIFrameElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "FocusEvent", "CustomEvent", "getComputedStyle", "MutationObserver", "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "sessionStorage", "location", "history", "DOMParser", "File", "FileReader"];

/**
 * Mounts a component in a jsdom document so tests can click, type and read the DOM.
 * `entrySource` defines `const __default = () => <Element/>`. Options: url, lang, fetch (global fetch stub),
 * media (matchMedia(query) -> boolean), props injected on window (e.g. QanouniNative).
 * @returns {Promise<{container: HTMLElement, window: Window, act: Function, unmount: Function}>}
 */
async function mountJsx(entrySource, opts = {}) {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: opts.url || "http://localhost/law/today" });
  const w = dom.window;
  if (opts.lang) w.localStorage.setItem("qanouni_lang", opts.lang);
  const media = opts.media || (() => false);
  w.matchMedia = (q) => ({ matches: !!media(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  for (const [k, v] of Object.entries(opts.window || {})) Object.defineProperty(w, k, { value: v, configurable: true, writable: true });
  const saved = {};
  for (const k of [...GLOBALS, "fetch", "IS_REACT_ACT_ENVIRONMENT"]) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  for (const k of GLOBALS) Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Count requests in flight so tests can wait for "the page has finished loading" instead of sleeping for a fixed time.
  let inflight = 0;
  if (opts.fetch) globalThis.fetch = (...a) => { inflight++; return Promise.resolve().then(() => opts.fetch(...a)).finally(() => { inflight--; }); };
  const realError = console.error;
  console.error = (...a) => { if (!String(a[0]).includes("ReactDOMTestUtils.act")) realError(...a); }; // React 18.2 has no React.act
  const contents = `import { createRoot } from "react-dom/client";\nimport { act } from "react-dom/test-utils";\n${entrySource}\nexport { act };\nexport async function mount() { const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container); await act(async () => { root.render(__default()); }); return { container, unmount: () => act(async () => root.unmount()) }; }`;
  const code = build("mount", contents, commonOptions(contents));
  const mod = bundleToModule(code);
  if (mod.ready) await mod.ready;
  const mounted = await mod.mount();
  return {
    container: mounted.container,
    window: w,
    act: mod.act,
    /** Resolves once no request is in flight and nothing new started for a few ticks (bounded; never hangs a test). */
    idle: async (limitMs = 5000) => {
      const t0 = Date.now();
      let quiet = 0;
      while (quiet < 4 && Date.now() - t0 < limitMs) {
        await mod.act(async () => { await new Promise((r) => setTimeout(r, 12)); });
        quiet = inflight === 0 ? quiet + 1 : 0;
      }
    },
    unmount: async () => {
      await mounted.unmount();
      console.error = realError;
      for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
      w.close();
    },
  };
}

/** Bundles an ES module entry (like `export * from "@/navigation/nav.config"`) and returns its exports. */
async function loadEsm(entrySource, opts = {}) {
  const code = build("esm", entrySource, commonOptions(entrySource));
  const prev = global.localStorage;
  global.localStorage = { getItem: () => (opts.lang || null), setItem() {}, removeItem() {} };
  try {
    return bundleToModule(code);
  } finally {
    global.localStorage = prev;
  }
}

module.exports = { renderJsx, mountJsx, loadEsm };
