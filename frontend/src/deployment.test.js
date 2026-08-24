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

  it('includes valid _redirects file for SPA client-side routing fallback', () => {
    const redirectsPath = resolve(publicDir, '_redirects')
    expect(existsSync(redirectsPath)).toBe(true)

    const content = readFileSync(redirectsPath, 'utf-8').trim()
    const parts = content.split(/\s+/)
    expect(parts).toEqual(['/*', '/index.html', '200'])
  })
})
