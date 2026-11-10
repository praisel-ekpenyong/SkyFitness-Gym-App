import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { validateEnv } from './src/lib/env.js'
import { CDN_IMG_BASE, CDN_GIF_BASE } from './src/lib/media-cdn.js'

// Optional web analytics (Umami). Injected only when BOTH vars are set at build time,
// so a plain `npm run build` — and every self-hosted install — stays telemetry-free.
// Validated through the environment seam (see src/lib/env.js and .env.example).
// Set for the public instance: VITE_UMAMI_SRC=https://stats.example/script.js VITE_UMAMI_ID=<uuid>
const { umamiSrc, umamiId } = validateEnv(process.env)

const umami = {
  name: 'sky-umami',
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
const mediaBundled = existsSync(resolve(frontendDir, 'public', 'media', 'images'))
const mediaNotice = {
  name: 'sky-media-notice',
  buildStart() {
    console.log(mediaBundled
      ? '[media] local exercise media found in public/media/ — bundling into dist/'
      : '[media] public/media/ not fetched — exercise art streams from the pinned CDN (npm run media:fetch to bundle)')
  }
}
// A build with no bundled media points straight at the pinned CDN. Otherwise every picture first
// asks this host for media/…, which a static host answers with the app page (SPA fallback), and
// only then falls back. Explicit VITE_IMG_BASE / VITE_GIF_BASE still win. Dev and tests keep the
// relative defaults.
if (process.env.npm_lifecycle_event === 'build' || process.argv.includes('build')) {
  if (!mediaBundled && !process.env.VITE_IMG_BASE) process.env.VITE_IMG_BASE = CDN_IMG_BASE
  if (!mediaBundled && !process.env.VITE_GIF_BASE) process.env.VITE_GIF_BASE = CDN_GIF_BASE
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
