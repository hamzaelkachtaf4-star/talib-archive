// Web app manifest (spec §10.1). Served at /manifest.json in place of upstream's when
// LAWOS_HIDE_UPSTREAM is on, so the existing <link rel="manifest"> in upstream HTML needs no edit.
const { BRAND } = require("./brand");
const LAWOS_THEME = BRAND.themeColor; // Moroccan green, matches the insignia

function lawManifest() {
  return {
    id: "/law/",
    name: `${BRAND.name.ar} | ${BRAND.tagline.ar}`,
    short_name: BRAND.name.ar,
    description: BRAND.description,
    lang: "ar",
    dir: "rtl",
    start_url: "/law/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: LAWOS_THEME,
    background_color: LAWOS_THEME,
    shortcuts: [
      { name: "اليوم", url: "/law/today" },
      { name: "مركز الامتحانات", url: "/law/exam" },
      { name: "القوانين والمراجع", url: "/law/library" },
    ],
    icons: [
      {
        src: "/lawos/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/lawos/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/lawos/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

function serveLawManifest(_req, res) {
  res.type("application/manifest+json").status(200).send(lawManifest());
}

module.exports = { LAWOS_THEME, lawManifest, serveLawManifest };
