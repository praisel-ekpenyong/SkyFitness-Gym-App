import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { ICON_NAMES } from './Icon.jsx'

const SRC = resolve(import.meta.dirname, '..')

function namedIcons() {
  const out = []
  const walk = dir => {
    for (const f of readdirSync(dir)) {
      const p = resolve(dir, f)
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.jsx?$/.test(f) || /\.test\.jsx?$/.test(f)) continue
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/<Icon\s+name="([^"]+)"|\bicon="([^"]+)"/g)) out.push({ name: m[1] || m[2], where: `${relative(SRC, p)}:${i + 1}` })
      })
    }
  }
  walk(SRC)
  return out
}

describe('Icon', () => {
  it('draws every icon the app names: an unknown name renders nothing', () => {
    const missing = namedIcons().filter(u => !ICON_NAMES.includes(u.name)).map(u => `${u.name} at ${u.where}`)
    expect(missing, 'Add the glyph to components/Icon.jsx (DESIGN.md › Icons) or use an existing name').toEqual([])
  })
})
