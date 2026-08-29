import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Optional web analytics (Umami). Injected only when BOTH vars are set at build time,
// so a plain `npm run build` — and every self-hosted install — stays telemetry-free.
// Set for the public instance: VITE_UMAMI_SRC=https://stats.example/script.js VITE_UMAMI_ID=<uuid>
const umamiSrc = process.env.VITE_UMAMI_SRC
const umamiId = process.env.VITE_UMAMI_ID

const umami = {
  name: 'opengym-umami',
  transformIndexHtml() {
    if (!umamiSrc || !umamiId) return
    return [{
      tag: 'script',
      attrs: { defer: true, src: umamiSrc, 'data-website-id': umamiId },
      injectTo: 'head'
    }]
  }
}

const frontendDir = dirname(fileURLToPath(import.meta.url))

// Exercise media (~140 MB) is fetched out-of-band (`npm run media:fetch`) into public/media/,
// gitignored, and copied verbatim into dist/ whenever present. It is served as plain static
// files and cached at runtime by sw.js — never precached or processed by the bundler — so no
// build-time asset-size limit applies to it. Building without it is fine: Media.jsx falls
// back to the pinned CDN per asset.
const mediaNotice = {
  name: 'sky-media-notice',
  buildStart() {
    const bundled = existsSync(resolve(frontendDir, 'public', 'media', 'images'))
    console.log(bundled
      ? '[media] local exercise media found in public/media/ — bundling into dist/'
      : '[media] public/media/ not fetched — animations will stream from the CDN (npm run media:fetch to bundle)')
  }
}

export default defineConfig({
  plugins: [react(), umami, mediaNotice],
  base: './',
  build: {
    // Catalogue is 860k raw / 116k gzip — inherently larger than the 500k warning.
    // Keep the guard at 900k so real regressions (vendor growth, view bloat) still surface
    // without drowning the build in an expected warning for the dataset.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor'
          if (id.includes('exercises-data')) return 'catalogue'
          if (id.includes('body-paths')) return 'bodymaps'
        }
      }
    }
  },
  test: {
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)', '../scripts/**/*.{test,spec}.?(c|m)[jt]s?(x)']
  }
})
