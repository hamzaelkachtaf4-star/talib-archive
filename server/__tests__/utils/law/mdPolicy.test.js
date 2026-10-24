// RC2 1.4: the Markdown policy for Hub/master notes. The module is ESM for Vite; this loads its source as CJS.
const fs = require("fs");
const path = require("path");
const FRONT = path.resolve(__dirname, "../../../../frontend");
const MarkdownIt = require(path.join(FRONT, "node_modules/markdown-it"));
const src = fs.readFileSync(path.join(FRONT, "src/components/LawOS/lib/mdPolicy.js"), "utf8").replace("export function", "function");
const { createMarkdown } = new Function(`${src}; return { createMarkdown };`)();
const md = createMarkdown(MarkdownIt);
const render = (t) => md.render(t);

test("raw HTML is escaped, never rendered", () => {
  const out = render("<img src=x onerror=alert(1)> <script>alert(1)</script>");
  expect(out).not.toMatch(/<img|<script/i);
  expect(out).toContain("&lt;img");
});

test.each([
  "[x](javascript:alert(1))",
  "[x](JaVaScRiPt:alert(1))",
  "[x](java\tscript:alert(1))",
  "[x](data:text/html;base64,PHNjcmlwdD4=)",
  "[x](vbscript:msgbox(1))",
  "[x](file:///etc/passwd)",
  "![x](data:image/png;base64,AAAA)",
])("dangerous target is not turned into a link: %s", (t) => {
  const out = render(t);
  expect(out).not.toMatch(/href="(javascript|data|vbscript|file):/i);
  expect(out).not.toMatch(/src="(javascript|data|vbscript|file):/i);
  expect(out).not.toMatch(/<a /);
});

test("http(s) links open safely; mailto and relative links pass", () => {
  expect(render("[x](https://example.com/a)")).toMatch(/target="_blank" rel="noopener noreferrer nofollow"/);
  expect(render("[x](mailto:a@b.ma)")).toContain('href="mailto:a@b.ma"');
  expect(render("[x](#sec)")).toContain('href="#sec"');
  expect(render("https://example.com")).toMatch(/rel="noopener noreferrer nofollow"/); // linkified
});
