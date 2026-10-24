// SSRF guard for every server-side fetch of an operator/third-party URL (radar, timetable). Exact-host allowlist,
// https only (http per allowlisted host), DNS resolved by US and every address checked against private/loopback/
// link-local ranges, the validated address is the one connected to (no DNS-rebinding window), redirects are
// followed manually and re-validated per hop, with a timeout and a hard size cap.
const dns = require("dns");
const net = require("net");
const http = require("http");
const https = require("https");

class SsrfError extends Error {
  constructor(message) {
    super(message);
    this.name = "SsrfError";
    this.code = "SSRF_BLOCKED";
  }
}

const v4 = (ip) => ip.split(".").map(Number);
/** true for any address that must never be reached from here. */
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = v4(ip);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s)) return true;
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith("ff");
  }
  return true; // not an IP at all: refuse
}

function parseGuarded(url, { allowHosts, allowHttpHosts = [] }) {
  let u;
  try { u = new URL(url); } catch { throw new SsrfError("invalid url"); }
  if (u.username || u.password) throw new SsrfError("credentials in url");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!Array.isArray(allowHosts) || !allowHosts.map((h) => h.toLowerCase()).includes(host)) throw new SsrfError(`host not allowed: ${host}`);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && allowHttpHosts.includes(host))) throw new SsrfError(`protocol not allowed: ${u.protocol}`);
  return u;
}

/** Validates the URL shape and resolves the host; returns the address that was checked. */
async function assertSafeUrl(url, opts = {}) {
  const u = parseGuarded(url, opts);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (opts.allowPrivate) return { url: u, address: null };
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new SsrfError("private address");
    return { url: u, address: host };
  }
  const addrs = await dns.promises.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new SsrfError("private address");
  return { url: u, address: addrs[0].address };
}

/**
 * @param {string} url
 * @param {{allowHosts:string[], allowHttpHosts?:string[], allowPrivate?:boolean, headers?:object, timeoutMs?:number,
 *          maxBytes?:number, maxRedirects?:number, contentTypes?:RegExp}} opts
 * @returns {Promise<{status:number, headers:{get:(k:string)=>string|null}, body:Buffer, url:string}>}
 */
async function safeFetch(url, opts = {}) {
  const { headers = {}, timeoutMs = 10000, maxBytes = 10 * 1024 * 1024, maxRedirects = 3, contentTypes = null } = opts;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url: u } = await assertSafeUrl(current, opts);
    const res = await once(u, { headers, timeoutMs, maxBytes, allowPrivate: opts.allowPrivate });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get("location")) {
      current = new URL(res.headers.get("location"), u).toString();
      continue;
    }
    if (contentTypes && res.status < 300 && res.body.length && !contentTypes.test(res.headers.get("content-type") || "")) throw new SsrfError("content-type not allowed");
    return { ...res, url: u.toString() };
  }
  throw new SsrfError("too many redirects");
}

function once(u, { headers, timeoutMs, maxBytes, allowPrivate }) {
  const mod = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      u,
      {
        method: "GET",
        headers,
        timeout: timeoutMs,
        // Connect-time check: the address used for the socket is the one validated here.
        lookup: (host, o, cb) => {
          dns.lookup(host, { ...o, all: true }, (err, addrs) => {
            if (err) return cb(err);
            if (!allowPrivate && addrs.some((a) => isPrivateAddress(a.address))) return cb(new SsrfError("private address"));
            const a = addrs[0];
            return o && o.all ? cb(null, addrs) : cb(null, a.address, a.family);
          });
        },
      },
      (res) => {
        const declared = Number(res.headers["content-length"] || 0);
        if (declared > maxBytes) { res.destroy(); return reject(new SsrfError("response too large")); }
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > maxBytes) { res.destroy(); return reject(new SsrfError("response too large")); }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status: res.statusCode, headers: { get: (k) => { const v = res.headers[String(k).toLowerCase()]; return Array.isArray(v) ? v[0] : v ?? null; } }, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

module.exports = { safeFetch, assertSafeUrl, isPrivateAddress, SsrfError };
