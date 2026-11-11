// Guard G1: the colour tokens keep their promises. Reads styles/tokens.css and resolves every
// token per theme and accent the way the browser does on :root, so a new value that breaks a
// pair fails here with the pair, the ratio and the rule it breaks.
import { describe, expect, it } from 'vitest'
import { ACCENTS } from './lib/format.js'
import { colourOf, contrast, hexOf, hueGap, okHue, readTokens } from './test/design-css.js'

const tokens = readTokens()
const THEMES = ['dark', 'light']
const SURFACES = ['--bg', '--bg-el', '--surface', '--surface-2', '--surface-3']
const INKS = ['--label', '--label-2', '--label-3']
const STATUS = ['--red', '--orange', '--yellow']
const ACCENT_KEYS = Object.keys(tokens.accents)
const TEXT = 4.5

const colour = (theme, name, accent = 'lime') => colourOf(`var(${name})`, tokens.vars(theme, accent))
const ratio = (fg, bg) => contrast(fg, bg)

/** One line per failing pair: what, where, how far off, and which rule. */
function pairFailures(theme, fgs, bgs, min, rule, accent) {
  const out = []
  for (const fg of fgs) for (const bg of bgs) {
    const f = colour(theme, fg, accent), b = colour(theme, bg, accent)
    const r = ratio(f, b)
    if (r < min) {
      out.push(`${theme}${accent ? ` (${accent})` : ''}: ${fg} ${hexOf(f)} on ${bg} ${hexOf(b)} is ${r.toFixed(2)}:1, needs ${min}:1. ${rule}`)
    }
  }
  return out
}

describe('G1 colour tokens (styles/tokens.css)', () => {
  it('declares the five accents of D1 and nothing else, matching ACCENTS in lib/format.js', () => {
    expect([...ACCENT_KEYS].sort(), 'Accents: lime, sky, violet, pink, teal. Gold, red and orange read as status colours (DESIGN.md › Tokens › Accent).')
      .toEqual(['lime', 'pink', 'sky', 'teal', 'violet'])
    for (const k of ACCENT_KEYS) {
      expect(tokens.accents[k].toLowerCase(), `tokens.css data-accent="${k}" and ACCENTS.${k} must be the same colour (the Settings swatch draws ACCENTS)`)
        .toBe(ACCENTS[k].toLowerCase())
    }
  })

  for (const theme of THEMES) {
    it(`${theme}: --label, --label-2 and --label-3 hold 4.5:1 on every surface`, () => {
      const f = pairFailures(theme, INKS, SURFACES, TEXT, 'DESIGN.md › Tokens › Ink: words hold 4.5:1 on every surface they sit on.')
      expect(f, f.join('\n')).toEqual([])
    })

    it(`${theme}: --on-ink holds 4.5:1 on --ink`, () => {
      const f = pairFailures(theme, ['--on-ink'], ['--ink'], TEXT, 'DESIGN.md › Tokens › Ink: --ink / --on-ink is the inverted primary.')
      expect(f, f.join('\n')).toEqual([])
    })

    it(`${theme}: every accent carries an --on-acc label at 4.5:1`, () => {
      const f = ACCENT_KEYS.flatMap(a => pairFailures(theme, ['--on-acc'], ['--acc'], TEXT, 'DESIGN.md › Tokens › Accent: every accent carries a black label on a filled key.', a))
      expect(f, f.join('\n')).toEqual([])
    })
  }

  it('light: --acc-text holds 4.5:1 on every surface, for every accent', () => {
    const f = ACCENT_KEYS.flatMap(a => pairFailures('light', ['--acc-text'], SURFACES, TEXT, 'DESIGN.md › Tokens › Accent: in light theme --acc-text darkens so it can be read on white.', a))
    expect(f, f.join('\n')).toEqual([])
  })

  it('light: --goal-text holds 4.5:1 on every surface', () => {
    const f = pairFailures('light', ['--goal-text'], SURFACES, TEXT, 'DESIGN.md › Tokens › Status: --goal-text is the record colour as words.')
    expect(f, f.join('\n')).toEqual([])
  })

  it('dark: each surface step is at least 1.15:1 (bg → surface → surface-2 → surface-3)', () => {
    const steps = [['--bg', '--surface'], ['--surface', '--surface-2'], ['--surface-2', '--surface-3']]
    const f = steps.flatMap(([lo, hi]) => {
      const a = colour('dark', lo), b = colour('dark', hi)
      const r = ratio(a, b)
      return r < 1.15 ? [`dark: ${lo} ${hexOf(a)} → ${hi} ${hexOf(b)} is ${r.toFixed(3)}:1, needs 1.15:1. DESIGN.md › The five rules › 2 (elevation is lightness): each step must read as a step.`] : []
    })
    expect(f, f.join('\n')).toEqual([])
  })

  it('every accent stays at least 20° of hue from --red, --orange and --yellow in both themes', () => {
    const f = []
    for (const theme of THEMES) for (const a of ACCENT_KEYS) for (const s of STATUS) {
      const acc = colour(theme, '--acc', a), st = colour(theme, s, a)
      const gap = hueGap(okHue(acc), okHue(st))
      if (gap < 20) f.push(`${theme}: accent "${a}" ${hexOf(acc)} is ${gap.toFixed(0)}° of OKLCH hue from ${s} ${hexOf(st)}, needs 20°. DESIGN.md › Tokens › Status: an accent must never read as a status colour.`)
    }
    expect(f, f.join('\n')).toEqual([])
  })
})
