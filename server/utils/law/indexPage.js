// Index page (docs/plans, §1). In production upstream renders index.html on the fly
// (MetaGenerator); with LAWOS_HIDE_UPSTREAM on, this page is served instead: Arabic title and meta, the
// brand icons and theme colour, and a branded first paint before the app's JavaScript runs.
const { LAWOS_THEME } = require("./manifest");
const { BRAND } = require("./brand");

const TITLE = `${BRAND.name.ar} | ${BRAND.tagline.ar}`;
const DESCRIPTION = `${BRAND.name.ar}: مراجعة، التقاط المحاضرات، المنهجية والنصوص القانونية المغربية لطلبة القانون.`;

const html = `<!DOCTYPE html>
<html lang="ar">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${TITLE}</title>
    <meta name="title" content="${TITLE}" />
    <meta name="description" content="${DESCRIPTION}" />
    <meta name="application-name" content="${BRAND.name.ar}" />
    <meta name="theme-color" content="${LAWOS_THEME}" />
    <meta name="robots" content="noindex, nofollow" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:image" content="/lawos/icons/icon-512.png" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <link rel="icon" type="image/svg+xml" href="/lawos/icons/icon.svg" />
    <link rel="icon" type="image/png" sizes="192x192" href="/lawos/icons/icon-192.png" />
    <link rel="apple-touch-icon" href="/lawos/icons/apple-touch-icon.png" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="${BRAND.name.ar}" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="manifest" href="/manifest.json" />
    <style>html,body{background:${LAWOS_THEME}}</style>
    <script>try{var t=localStorage.getItem("qanouni_theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-law-theme",t)}catch(e){}</script>
    <script type="module" crossorigin src="/index.js"></script>
    <link rel="stylesheet" href="/index.css" />
  </head>
  <body>
    <div id="root" class="h-screen"></div>
  </body>
</html>`;

// CSP (RC2 1.4): scripts only from this origin plus the one inline theme bootstrap, pinned by hash. No unsafe-inline.
const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// Google/Facebook sign-in SDKs are injected by Auth/GoogleButton.jsx and Auth/FacebookButton.jsx.
const CSP = `script-src 'self' https://accounts.google.com https://connect.facebook.net 'sha256-${require("crypto").createHash("sha256").update(inline).digest("base64")}'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`;

function serveLawIndex(_req, res) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.type("html").status(200).send(html);
}

module.exports = { serveLawIndex, TITLE, CSP };
