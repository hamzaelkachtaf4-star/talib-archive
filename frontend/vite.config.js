import { defineConfig } from "vite"
import { fileURLToPath, URL } from "url"
import postcss from "./postcss.config.js"
import react from "@vitejs/plugin-react"
import dns from "dns"
import fs from "fs"
import path from "path"
import zlib from "zlib"
import { visualizer } from "rollup-plugin-visualizer"

dns.setDefaultResultOrder("verbatim")

// LAW-OS perf: split stable vendor code into long-cached chunks (server/utils/law/staticAssets.js).
// No i18next group: its shared helpers made vendor-react and vendor-i18n import each other (a load-order
// crash). Every group must be a leaf or import only vendor-react (check the first line of each dist/assets/vendor-*.js).
// vendor-math (KaTeX) is only reached through lazy imports, so it never loads on first paint.
// Phosphor icons are deliberately NOT grouped: upstream uses ~650 KB of icons, and a shared chunk would
// force all of them into the first load; left alone, each page chunk carries only the icons it uses.
const VENDOR_CHUNKS = [
  ["vendor-react", /\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run\/router)\//],
  ["vendor-ui", /\/node_modules\/(react-toastify|clsx)\//],
  ["vendor-math", /\/node_modules\/katex\//],
]

function lawManualChunks(id) {
  for (const [name, re] of VENDOR_CHUNKS) if (re.test(id)) return name
}

// LAW-OS perf: emit .br and .gz next to every JS/CSS/HTML/SVG/JSON file so the server sends them as-is.
function precompress() {
  let outDir
  return {
    name: "lawos-precompress",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const walk = (dir) =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
        )
      for (const file of walk(outDir)) {
        if (!/\.(js|css|html|svg|json|wasm)$/.test(file)) continue
        const buf = fs.readFileSync(file)
        if (buf.length < 1024) continue
        fs.writeFileSync(file + ".gz", zlib.gzipSync(buf, { level: 9 }))
        fs.writeFileSync(
          file + ".br",
          zlib.brotliCompressSync(buf, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length },
          })
        )
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  assetsInclude: [
    './public/piper/ort-wasm-simd-threaded.wasm',
    './public/piper/piper_phonemize.wasm',
    './public/piper/piper_phonemize.data',
  ],
  worker: {
    format: 'es'
  },
  server: {
    port: 3000,
    host: "localhost"
  },
  define: {
    "process.env": process.env
  },
  css: {
    postcss
  },
  plugins: [
    react(),
    precompress(),
    visualizer({
      template: "treemap", // or sunburst
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: "bundleinspector.html" // will be saved in project's root
    })
  ],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url))
      },
      {
        process: "process/browser",
        stream: "stream-browserify",
        zlib: "browserify-zlib",
        util: "util",
        find: /^~.+/,
        replacement: (val) => {
          return val.replace(/^~/, "")
        }
      }
    ]
  },
  build: {
    rollupOptions: {
      output: {
        // These settings ensure the primary JS and CSS file references are always index.{js,css}
        // so we can SSR the index.html as text response from server/index.js without breaking references each build.
        entryFileNames: 'index.js',
        manualChunks: lawManualChunks,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'index.css') return `index.css`;
          return assetInfo.name;
        },
      },
      external: [
        // Reduces transformation time by 50% and we don't even use this variant, so we can ignore.
        /@phosphor-icons\/react\/dist\/ssr/,
      ]
    },
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },
  optimizeDeps: {
    include: ["@mintplex-labs/piper-tts-web"],
    esbuildOptions: {
      define: {
        global: "globalThis"
      },
      plugins: []
    }
  }
})
