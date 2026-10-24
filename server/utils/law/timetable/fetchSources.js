// Polite FDC fetcher. Only the admin route and the weekly job call this, never a student's request.
// Identifying User-Agent, sha256 de-duplication (an unchanged PDF is a no-op), law-filière allowlist.
const crypto = require("crypto");
const { parseFdcPdf, inferMeta, isLawFile } = require("./parseFdcPdf");

const UA = "QanouniTimetableBot/1.0 (+student study app; admin-triggered, weekly at most)";
const DEFAULT_BASE = "https://www.fdc.ma/FDC/emploiFDC/emplois_temps.php";

const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
// SSRF guard (RC2 1.5): exact-host allowlist (the FDC host plus FDC_ALLOWED_HOSTS), private addresses refused,
// redirects re-validated per hop, size/time capped. Returns a minimal Response-like object.
const { safeFetch } = require("../safeFetch");
const defaultFetch = async (url) => {
  const hosts = ["www.fdc.ma", ...String(process.env.FDC_ALLOWED_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean)];
  const r = await safeFetch(url, { headers: { "User-Agent": UA }, allowHosts: hosts, timeoutMs: 10000, maxBytes: MAX_PDF_BYTES });
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    headers: r.headers,
    text: async () => r.body.toString("utf8"),
    arrayBuffer: async () => r.body.buffer.slice(r.body.byteOffset, r.body.byteOffset + r.body.length),
  };
};

/** Only https links on the index page's own origin are ever fetched (no SSRF through a crafted href). */
function sameOriginHttps(url, baseUrl) {
  try {
    const u = new URL(url), b = new URL(baseUrl);
    return u.protocol === "https:" && u.origin === b.origin;
  } catch {
    return false;
  }
}
const tooBig = (res, max) => Number(res.headers?.get?.("content-length") || 0) > max;

/** Index HTML -> absolute PDF URLs for the given season folder ("Automne", "Printemps"), law filières only. */
function listLawPdfs(html, baseUrl, season) {
  const hrefs = [...String(html).matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1]);
  const folder = season === "PRINTEMPS" ? /printemps/i : /automne/i;
  const uniq = [...new Set(hrefs)].filter((h) => folder.test(h));
  const safeName = (h) => { try { return decodeURIComponent(h.split("/").pop()); } catch { return ""; } };
  return uniq
    .filter((h) => isLawFile(safeName(h)))
    .map((h) => { try { return new URL(h, baseUrl).toString(); } catch { return null; } })
    .filter((u) => u && sameOriginHttps(u, baseUrl));
}

/**
 * Fetch + parse + stage. `deps` makes this testable offline: { fetchImpl, LawFdcTimetable }.
 * Returns one summary per PDF: { url, status: staged|unchanged|failed, rows, rejected }.
 */
async function fetchAndStage({ facultyCode = "FSJES_AIN_CHOCK", season = "AUTOMNE", baseUrl = process.env.FDC_BASE_URL || DEFAULT_BASE, fetchImpl = defaultFetch, LawFdcTimetable }) {
  const idx = await fetchImpl(`${baseUrl}?type=${season === "PRINTEMPS" ? "printemps" : "automne"}`);
  if (!idx.ok) throw new Error(`index fetch failed: ${idx.status}`);
  if (tooBig(idx, MAX_INDEX_BYTES)) throw new Error("index page too large");
  const urls = listLawPdfs((await idx.text()).slice(0, MAX_INDEX_BYTES), baseUrl, season);
  const out = [];
  for (const url of urls) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok) { out.push({ url, status: "failed", error: `http ${res.status}` }); continue; }
      if (tooBig(res, MAX_PDF_BYTES)) { out.push({ url, status: "failed", error: "file too large" }); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_PDF_BYTES) { out.push({ url, status: "failed", error: "file too large" }); continue; }
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      const parsed = await parseFdcPdf(buf, inferMeta(decodeURIComponent(url.split("/").pop())));
      const rows = parsed.rows.filter((r) => r.track && r.language);
      const log = [parsed.reason, ...parsed.rejected].filter(Boolean).join("\n") || `${rows.length} rows`;
      const r = await LawFdcTimetable.stage({ facultyCode, season, url, sha256, rows, parseLog: log });
      out.push({ url, status: r.unchanged ? "unchanged" : rows.length ? "staged" : "failed", rows: rows.length, rejected: parsed.rejected.length, sourceId: r.source?.id });
    } catch (e) {
      out.push({ url, status: "failed", error: e.message });
    }
  }
  return out;
}

module.exports = { fetchAndStage, listLawPdfs, sameOriginHttps, UA };
