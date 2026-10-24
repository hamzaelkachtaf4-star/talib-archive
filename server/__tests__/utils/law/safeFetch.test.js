// SSRF guard (RC2 1.5): each of these must be refused before any connection is made.
const http = require("http");
const { assertSafeUrl, safeFetch, isPrivateAddress } = require("../../../utils/law/safeFetch");

const allow = { allowHosts: ["www.sgg.gov.ma", "sgg.gov.ma"] };

describe("assertSafeUrl", () => {
  test.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://sgg.gov.ma.evil.com/",
    "http://2130706433/",
    "https://localhost/",
    "https://[::1]/",
    "https://user:pw@www.sgg.gov.ma/",
    "ftp://www.sgg.gov.ma/",
    "http://www.sgg.gov.ma/", // http is refused unless the host is explicitly listed
    "not a url",
  ])("rejects %s", async (url) => {
    await expect(assertSafeUrl(url, allow)).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  test("an allowlisted host resolving to a private address is rejected", async () => {
    const dns = require("dns");
    const spy = jest.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(assertSafeUrl("https://www.sgg.gov.ma/", allow)).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
    spy.mockRestore();
  });

  test("an allowlisted host with a public address passes", async () => {
    const dns = require("dns");
    const spy = jest.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertSafeUrl("https://www.sgg.gov.ma/x", allow)).resolves.toMatchObject({ address: "93.184.216.34" });
    spy.mockRestore();
  });
});

describe("isPrivateAddress", () => {
  test.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.1.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"])("%s is private", (ip) => expect(isPrivateAddress(ip)).toBe(true));
  test.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"])("%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("safeFetch redirects", () => {
  let server, port;
  beforeAll((done) => {
    server = http.createServer((req, res) => {
      if (req.url === "/to-local") { res.writeHead(302, { Location: "http://localhost:1/secret" }); return res.end(); }
      if (req.url === "/big") { res.writeHead(200, { "Content-Length": "999999999" }); return res.end("x"); }
      res.writeHead(200, { "Content-Type": "text/html" }); res.end("ok");
    }).listen(0, "127.0.0.1", () => { port = server.address().port; done(); });
  });
  afterAll(() => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }));

  test("a redirect to localhost is refused (hop is re-validated)", async () => {
    const opts = { allowHosts: ["127.0.0.1"], allowHttpHosts: ["127.0.0.1"], allowPrivate: false };
    // the host is allowlisted but private: refused at the first hop, never reaching the redirect
    await expect(safeFetch(`http://127.0.0.1:${port}/to-local`, opts)).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  test("redirect target outside the allowlist is refused", async () => {
    const opts = { allowHosts: ["127.0.0.1"], allowHttpHosts: ["127.0.0.1"], allowPrivate: true };
    await expect(safeFetch(`http://127.0.0.1:${port}/to-local`, opts)).rejects.toThrow(/host not allowed: localhost/);
  });

  test("oversized responses are refused", async () => {
    const opts = { allowHosts: ["127.0.0.1"], allowHttpHosts: ["127.0.0.1"], allowPrivate: true, maxBytes: 1000 };
    await expect(safeFetch(`http://127.0.0.1:${port}/big`, opts)).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });
});

describe("politeFetch (radar) is guarded", () => {
  const { politeFetch, resetPoliteFetch } = require("../../../utils/law/radar/politeFetch");
  beforeEach(resetPoliteFetch);
  test.each(["http://127.0.0.1/", "http://169.254.169.254/", "https://sgg.gov.ma.evil.com/", "http://2130706433/"])("refuses %s", async (url) => {
    await expect(politeFetch(url, { minIntervalMs: 0 })).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });
});
