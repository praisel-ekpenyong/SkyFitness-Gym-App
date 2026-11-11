// Guard G2 (type part): one type scale. Every font-size in styles/*.css names a role token from
// styles/tokens.css, weights stay on the four the system uses, and no component sets type
// inline. Each failure names the rule, the place, and where to read about it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { cssRules, readTokens, styleSheets, stripComments } from './test/design-css.js'

const SRC = dirname(fileURLToPath(import.meta.url))
const tokens = readTokens()
const sheets = styleSheets()

// The scale: custom properties named --fs-<role> with a px value, declared only in tokens.css.
const SIZE = Object.fromEntries(Object.entries(tokens.base)
  .filter(([k]) => k.startsWith('--fs-'))
  .map(([k, v]) => [k, parseFloat(v)]))
const WEIGHTS = new Set(['400', '600', '700', '800'])
const READ = 'Read DESIGN.md › Type and the scale at the top of styles/tokens.css.'

/** Every declaration of one property outside tokens.css, with where it sits. */
function declsOf(prop, { skipTokens = true } = {}) {
  const out = []
  for (const { name, css } of sheets) {
    if (skipTokens && name === 'tokens.css') continue
    for (const r of cssRules(css)) for (const d of r.decls) {
      if (d.prop === prop) out.push({ ...d, where: `styles/${name}:${d.line} (${r.selector}${r.media ? ' in ' + r.media : ''})`, selector: r.selector, media: r.media })
    }
  }
  return out
}

const tokenOf = value => (/^var\((--fs-[\w-]+)\)$/.exec(value) || [])[1]

describe('G2 type scale (styles/*.css)', () => {
  it('tokens.css holds at most 12 size tokens, each named by role and set in px', () => {
    const names = Object.keys(SIZE)
    expect(names.length, 'The size tokens are missing from styles/tokens.css (--fs-<role>: <n>px). ' + READ).toBeGreaterThan(0)
    expect(names.length, `${names.length} size tokens; the scale holds 12 at most. ${READ}`).toBeLessThanOrEqual(12)
    const bad = Object.entries(tokens.base).filter(([k, v]) => k.startsWith('--fs-') && (/\d/.test(k) || !/^\d+(\.\d+)?px$/.test(v)))
      .map(([k, v]) => `${k}: ${v}`)
    expect(bad, `Size tokens are named by role (--fs-body, not --fs-15) and hold a px value. ${READ}\n${bad.join('\n')}`).toEqual([])
    const sizes = Object.values(SIZE)
    expect(new Set(sizes).size, `Two size tokens share a value: ${JSON.stringify(SIZE)}`).toBe(sizes.length)
  })

  it('display sizes collapse onto five steps at most', () => {
    const display = Object.entries(SIZE).filter(([, v]) => v > 24)
    expect(display.length, `Display steps (above 24px): ${display.map(([k, v]) => `${k} ${v}px`).join(', ')}. Five at most. ${READ}`).toBeLessThanOrEqual(5)
  })

  it('every font-size outside tokens.css uses a size token', () => {
    const bad = declsOf('font-size').filter(d => !(tokenOf(d.value) in SIZE))
      .map(d => `${d.where}: font-size: ${d.value}`)
    expect(bad, `Raw or unknown font sizes. Use var(--fs-<role>); only styles/tokens.css holds px sizes. ${READ}\n${bad.join('\n')}`).toEqual([])
    const shorthand = declsOf('font').filter(d => d.value !== 'inherit').map(d => `${d.where}: font: ${d.value}`)
    expect(shorthand, `The font shorthand hides a size from the scale; set font-size with a token instead. ${READ}\n${shorthand.join('\n')}`).toEqual([])
  })

  it('every font-weight is 400, 600, 700 or 800', () => {
    const bad = declsOf('font-weight', { skipTokens: false }).filter(d => !WEIGHTS.has(d.value))
      .map(d => `${d.where}: font-weight: ${d.value}`)
    expect(bad, `Weights are 400 (body, meta), 600 (headings, keys), 700 (figures), 800 (display). ${READ}\n${bad.join('\n')}`).toEqual([])
  })

  it('the open set’s figures stay at 64px or more, and the rest clock is the largest size there is', () => {
    const size = d => SIZE[tokenOf(d.value)]
    const open = declsOf('font-size').filter(d => d.selector.includes('.setrow.cur .stp .num') && !d.selector.includes('.eff'))
    expect(open.length, 'No font-size found for .setrow.cur .stp .num (the open set’s figures)').toBeGreaterThan(0)
    for (const d of open) expect(size(d), `${d.where}: the open set’s figures are read from the bench and stay ≥ 64px. ${READ}`).toBeGreaterThanOrEqual(64)
    const clock = declsOf('font-size').filter(d => d.selector === '#timer .t')
    expect(clock.length, 'No font-size found for #timer .t (the rest clock)').toBeGreaterThan(0)
    for (const d of clock) expect(size(d), `${d.where}: the rest clock is the largest figure on the phone while it runs. ${READ}`).toBe(Math.max(...Object.values(SIZE)))
  })

  it('no component sets font size or weight inline (JSX)', () => {
    const files = []
    const walk = dir => {
      for (const f of readdirSync(dir)) {
        const p = resolve(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.jsx$/.test(f) && !/\.test\.jsx$/.test(f)) files.push(p)
      }
    }
    walk(SRC)
    const bad = []
    for (const p of files) {
      stripComments(readFileSync(p, 'utf8')).split('\n').forEach((line, i) => {
        if (/\bfont(Size|Weight)\b|font-(size|weight)\s*:/.test(line)) bad.push(`${relative(SRC, p)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(bad, `Type is set by class in styles/*.css, never inline, so the scale guard can see it. ${READ}\n${bad.join('\n')}`).toEqual([])
  })
})
