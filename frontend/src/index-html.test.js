import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The deploy CSP is `default-src 'self'` with no 'unsafe-inline'. A script from another origin, or
// an inline one, would be blocked in production without a sound, so it must never be committed.
// On 2026-11-09 a design tool's live mode injected exactly such a line into this file.
const LIVE_MODE_URL = 'http://localhost:8400/live.js?token=00000000-0000-0000-0000-000000000000'

// Links that name a page rather than load a resource; any origin is fine for these.
const NOT_FETCHED = new Set(['canonical', 'alternate', 'author', 'license', 'me'])

/**
 * Every resource a page would load from outside its own origin, plus one entry per inline script.
 * Checks `src` on any element and `href` on `<link>`s that load something. A same-origin
 * reference is a relative or root path: no scheme and no leading `//`.
 * @param {string} html - Page source.
 * @returns {string[]} The offending URLs, and `'inline script'` for each inline one.
 */
function offOriginRefs(html) {
  const out = []
  const offOrigin = url => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url.trim())
  for (const [, tag, rawAttrs] of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const attrs = {}
    for (const [, name, dq, sq, bare] of rawAttrs.matchAll(/([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attrs[name.toLowerCase()] = dq ?? sq ?? bare
    }
    const kind = tag.toLowerCase()
    if (attrs.src != null && offOrigin(attrs.src)) out.push(attrs.src)
    const rels = (attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean)
    const fetched = rels.length === 0 || rels.some(r => !NOT_FETCHED.has(r))
    if (kind === 'link' && attrs.href != null && fetched && offOrigin(attrs.href)) out.push(attrs.href)
    if (kind === 'script' && attrs.src == null) out.push('inline script')
  }
  return out
}

describe('index.html', () => {
  it('loads every script, style and icon from its own origin, with no inline script', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8')
    expect(offOriginRefs(html)).toEqual([])
  })

  it('flags a script injected from another origin', () => {
    expect(offOriginRefs(`<body>\n<div id="root"></div>\n<script src="${LIVE_MODE_URL}"></script>\n</body>`))
      .toEqual([LIVE_MODE_URL])
  })

  it('flags an off-origin script whose src is not quoted', () => {
    expect(offOriginRefs('<script src=//cdn.example.com/x.js></script>')).toEqual(['//cdn.example.com/x.js'])
  })

  it('flags an off-origin stylesheet', () => {
    expect(offOriginRefs('<link rel="stylesheet" href="https://fonts.example.com/a.css">'))
      .toEqual(['https://fonts.example.com/a.css'])
  })

  it('allows a canonical link to the public address, which loads nothing', () => {
    expect(offOriginRefs('<link rel="canonical" href="https://skyfitness.pages.dev/">')).toEqual([])
  })

  it('flags an inline script', () => {
    expect(offOriginRefs('<script>alert(1)</script>')).toEqual(['inline script'])
  })
})
