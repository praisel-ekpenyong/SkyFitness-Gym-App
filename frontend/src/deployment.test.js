import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const publicDir = resolve(import.meta.dirname, '..', 'public')

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
  const headers = () => parseHeadersFile(readFileSync(resolve(publicDir, '_headers'), 'utf-8'))
  const policy = () => Object.fromEntries(
    headers()['/*']['Content-Security-Policy'].split(';').map(d => d.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]),
  )

  it('serves every page with anti-sniffing, anti-framing and a referrer limit', () => {
    const all = headers()['/*']
    expect(all['X-Content-Type-Options']).toBe('nosniff')
    expect(all['X-Frame-Options']).toBe('DENY')
    expect(all['Referrer-Policy']).toMatch(/origin/)
  })

  it('never caches the files that decide which build loads, and caches hashed assets for good', () => {
    const parsed = headers()
    for (const path of ['/index.html', '/sw.js', '/manifest.json']) {
      expect(parsed[path]?.['Cache-Control'], path).toMatch(/no-cache|no-store/)
    }
    expect(parsed['/assets/*']?.['Cache-Control']).toMatch(/immutable/)
  })

  it('limits the page to its own origin plus the pinned media host, with no inline or eval script', () => {
    const csp = policy()
    expect(csp['default-src']).toEqual(["'self'"])
    for (const [name, sources] of Object.entries(csp)) {
      expect(sources, name).not.toContain('*')
      expect(sources, name).not.toContain("'unsafe-inline'")
      expect(sources, name).not.toContain("'unsafe-eval'")
      for (const source of sources.filter(s => s.startsWith('http'))) expect(source, name).toBe('https://cdn.jsdelivr.net')
    }
  })

  it('is deployed to Cloudflare Pages only', () => {
    expect(readFileSync(resolve(publicDir, '_headers'), 'utf-8').toLowerCase()).not.toContain('netlify')
    expect(existsSync(resolve(import.meta.dirname, '..', '..', 'netlify.toml'))).toBe(false)
  })

  it('sends every unknown path to the app, so a reload on a client-side route opens it', () => {
    const rules = readFileSync(resolve(publicDir, '_redirects'), 'utf-8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    expect(rules).toContain('/* /index.html 200')
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
    expect(match[1]).toBe('manifest.json')
    expect(readFileSync(resolve(publicDir, '..', 'vite.config.js'), 'utf-8')).toContain("base: './'")
  })
})
