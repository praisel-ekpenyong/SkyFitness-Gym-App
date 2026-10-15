import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, '..', 'public')

function parseHeadersFile(content) {
  const sections = {}
  let currentPath = null

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
      currentPath = line
      sections[currentPath] = {}
    } else if (currentPath) {
      const colonIndex = line.indexOf(':')
      if (colonIndex !== -1) {
        const key = line.slice(0, colonIndex).trim()
        const val = line.slice(colonIndex + 1).trim()
        sections[currentPath][key] = val
      }
    }
  }
  return sections
}

describe('Cloudflare Pages deployment configuration', () => {
  it('includes valid _headers file with proper caching and security directives', () => {
    const headersPath = resolve(publicDir, '_headers')
    expect(existsSync(headersPath)).toBe(true)

    const parsed = parseHeadersFile(readFileSync(headersPath, 'utf-8'))

    // Global security headers
    expect(parsed['/*']).toBeDefined()
    expect(parsed['/*']['X-Content-Type-Options']).toBe('nosniff')
    expect(parsed['/*']['X-Frame-Options']).toBe('DENY')
    expect(parsed['/*']['Referrer-Policy']).toBe('strict-origin-when-cross-origin')

    // Application shell, service worker, and manifest must always fresh-check
    const noCacheHeader = 'no-cache, no-store, must-revalidate'
    expect(parsed['/index.html']?.['Cache-Control']).toBe(noCacheHeader)
    expect(parsed['/sw.js']?.['Cache-Control']).toBe(noCacheHeader)
    expect(parsed['/manifest.json']?.['Cache-Control']).toBe(noCacheHeader)

    // Immutable assets must be cached long term
    expect(parsed['/assets/*']?.['Cache-Control']).toBe('public, max-age=31536000, immutable')
  })

  it('pins a minimal static policy (self plus the pinned media host) with a canonical pointer', () => {
    const content = readFileSync(resolve(publicDir, '_headers'), 'utf-8')
    const parsed = parseHeadersFile(content)

    // Minimal static policy: everything same-origin; images and media may also
    // come from the pinned exercise-dataset CDN (see PINNED_DATASET_COMMIT in
    // src/lib/exercises.js). Opt-in analytics hosts are appended here, never inline.
    expect(parsed['/*']?.['Content-Security-Policy']).toBe(
      "default-src 'self'; img-src 'self' https://cdn.jsdelivr.net; media-src 'self' https://cdn.jsdelivr.net"
    )
    // Canonical twin lives in netlify.toml — edits land in both places.
    expect(content).toContain('netlify.toml')
  })

  it('includes valid _redirects file for SPA client-side routing fallback', () => {
    const redirectsPath = resolve(publicDir, '_redirects')
    expect(existsSync(redirectsPath)).toBe(true)

    const content = readFileSync(redirectsPath, 'utf-8').trim()
    const parts = content.split(/\s+/)
    expect(parts).toEqual(['/*', '/index.html', '200'])
  })
})

describe('PWA install metadata', () => {
  function readPngSize(filePath) {
    const buf = readFileSync(filePath)
    expect(buf.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR')
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }

  it('declares installable plus maskable icons with health categories', () => {
    const manifest = JSON.parse(readFileSync(resolve(publicDir, 'manifest.json'), 'utf-8'))

    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.start_url).toBe('./')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.some(i => i.sizes === '192x192' && String(i.purpose).split(' ').includes('any'))).toBe(true)
    expect(manifest.icons.some(i => i.sizes === '512x512' && String(i.purpose).split(' ').includes('maskable'))).toBe(true)
    expect(manifest.categories).toContain('health')
  })

  it('ships every declared icon file at its declared size', () => {
    const manifest = JSON.parse(readFileSync(resolve(publicDir, 'manifest.json'), 'utf-8'))

    for (const icon of manifest.icons) {
      const [w, h] = String(icon.sizes).split(' ')[0].split('x').map(Number)
      const filePath = resolve(publicDir, icon.src)
      expect(existsSync(filePath)).toBe(true)
      expect(readPngSize(filePath)).toEqual({ width: w, height: h })
    }
  })

  it('links the manifest document-relative, matching the configured base', () => {
    const html = readFileSync(resolve(publicDir, '..', 'index.html'), 'utf-8')
    const match = html.match(/<link rel="manifest" href="([^"]+)"/)
    expect(match).toBeTruthy()
    // No leading slash: stays correct on subpath deploys, consistent with base './'.
    expect(match[1]).toBe('manifest.json')
    expect(readFileSync(resolve(publicDir, '..', 'vite.config.js'), 'utf-8')).toContain("base: './'")
  })
})

describe('Netlify deployment configuration', () => {
  it('includes valid netlify.toml at project root with proper build and routing directives', () => {
    const netlifyPath = resolve(__dirname, '..', '..', 'netlify.toml')
    expect(existsSync(netlifyPath)).toBe(true)

    const content = readFileSync(netlifyPath, 'utf-8')
    expect(content).toContain('base = "frontend"')
    expect(content).toContain('publish = "dist"')
    expect(content).toContain('command = "npm run build"')
    expect(content).toContain('from = "/*"')
    expect(content).toContain('to = "/index.html"')
    expect(content).toContain('status = 200')
    expect(content).toContain('X-Content-Type-Options = "nosniff"')
    expect(content).toContain('X-Frame-Options = "DENY"')
    expect(content).toContain(
      `Content-Security-Policy = "default-src 'self'; img-src 'self' https://cdn.jsdelivr.net; media-src 'self' https://cdn.jsdelivr.net"`
    )
    // Canonical twin lives in frontend/public/_headers — edits land in both places.
    expect(content).toContain('frontend/public/_headers')
  })
})
