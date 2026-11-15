import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { validateEnv } from './src/lib/env.js'
import { CDN_IMG_BASE, CDN_GIF_BASE } from './src/lib/media-cdn.js'

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

const mediaBundled = existsSync(resolve(frontendDir, 'public', 'media', 'images'))
const mediaNotice = {
  name: 'sky-media-notice',
  buildStart() {
    console.log(mediaBundled
      ? '[media] local exercise media found in public/media/ — bundling into dist/'
      : '[media] public/media/ not fetched — exercise art streams from the pinned CDN (npm run media:fetch to bundle)')
  }
}
if (process.env.npm_lifecycle_event === 'build' || process.argv.includes('build')) {
  if (!mediaBundled && !process.env.VITE_IMG_BASE) process.env.VITE_IMG_BASE = CDN_IMG_BASE
  if (!mediaBundled && !process.env.VITE_GIF_BASE) process.env.VITE_GIF_BASE = CDN_GIF_BASE
}

export default defineConfig({
  plugins: [react(), umami, mediaNotice],
  base: './',
  build: {
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
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)', 'scripts/review/**/*.test.mjs', '../scripts/**/*.{test,spec}.?(c|m)[jt]s?(x)']
  }
})
