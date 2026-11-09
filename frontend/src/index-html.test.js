import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The deploy CSP is `default-src 'self'` with no 'unsafe-inline'. A script from another origin, or
// an inline one, would be blocked in production without a sound, so it must never be committed.
// On 2026-11-09 a design tool's live mode injected exactly such a line into this file.
const LIVE_MODE_LINE = '<script src="http://localhost:8400/live.js?token=b8b975d9-043e-4400-a2f6-9f506c89f4e6"></script>'

/**
 * Every reference in a page that would leave its own origin, plus one entry per inline script.
 * A same-origin reference is a relative or root path: no scheme and no leading `//`.
 * @param {string} html - Page source.
 * @returns {string[]} The offending `src`/`href` values, and `'inline script'` for each inline one.
 */
function offOriginRefs(html) {
  const out = []
  for (const [, url] of html.matchAll(/\s(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url.trim())) out.push(url)
  }
  for (const [, attrs] of html.matchAll(/<script\b([^>]*)>/gi)) {
    if (!/\ssrc\s*=/i.test(attrs)) out.push('inline script')
  }
  return out
}

describe('index.html', () => {
  it('loads every script, style and icon from its own origin, with no inline script', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8')
    expect(offOriginRefs(html)).toEqual([])
  })

  it('flags an inline script', () => {
    expect(offOriginRefs('<script>alert(1)</script>')).toEqual(['inline script'])
  })

  it('flags a script injected from another origin', () => {
    expect(offOriginRefs(`<body>\n<div id="root"></div>\n${LIVE_MODE_LINE}\n</body>`))
      .toEqual(['http://localhost:8400/live.js?token=b8b975d9-043e-4400-a2f6-9f506c89f4e6'])
  })
})
