// Guard G2: one type scale and one meaning per colour. Every font-size in styles/*.css names a
// role token from styles/tokens.css, weights stay on the four the system uses, no component
// sets type inline, and the accent and yellow colour only what an allowlist says they may (see
// "colour meaning" below). Each failure names the rule, the place, and where to read about it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { cssRules, readTokens, selectorList, styleSheets, stripComments } from './test/design-css.js'

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

// ------------------------------------------------------------------- colour meaning --
// Guard G2 (colour part): one meaning per colour. The accent means work, orange means a workout
// is running (spec D20) and yellow means a Record, the moment a Set beats the exercise's Best or its best estimated 1RM; the standing
// Best figure stays ink (design-review-fixes/04, decision E12, narrows D3), so the tokens that
// carry them may colour only what is listed below. Everything else is ink (--label, --label-2,
// --label-3) on iron. Each entry names the use it is, by the iron-discipline decision that
// allows it: D2 for the accent, D3 for yellow (DESIGN.md › The five rules › 3 and › Tokens ›
// Status), D20 for orange. An entry that no longer matches anything fails too, so the list stays a true
// account of where the colours are.

const ACCENT_TOKENS = ['--acc', '--acc-2', '--acc-text', '--acc-soft', '--acc-line', '--data']
const RECORD_TOKENS = ['--goal-text', '--yellow']
const RUNNING_TOKENS = ['--orange', '--orange-text', '--orange-wash', '--orange-wash-2', '--on-orange']
const COLOUR_READ = 'Read DESIGN.md › The five rules › 3 (Colour is work) and › Tokens › Status (yellow is a Record: a Set that beat the Best or the best estimated 1RM). The standing Best figure is neutral ink, never yellow: design-review-fixes/04 (E12) narrows D3. Orange is a running workout only (spec D20): a rescheduled day is an ink mark and warnings are neutral.'

/** Selectors (one per entry, as written in styles/*.css) that may use an accent token. */
const WORK = {
  '.btn.go': 'D2 the one .go key on a screen',
  '.btn.go:active': 'D2 the .go key, pressed',
  '.btn.go:hover': 'D2 the .go key, hovered (desktop)',
  '.btn.wk-finish.done': 'D2 the workout’s action once every set is in: the header Finish, coloured only (not a second .go look)',
  '.btn.wk-finish.done:active': 'D2 the header Finish once every set is in, pressed',
  '.btn.wk-finish.done:hover': 'D2 the header Finish once every set is in, hovered (desktop)',
  '.setrow.cur .chk': 'D2 the Log key: the open set’s .go key',
  '.chk.on': 'D2 logged-set mark: the check key of a logged set',
  '.setrow.cur .chk.on': 'D2 logged-set mark: the Log key once its set is logged',
  '.setrow.done .n': 'D2 logged-set mark: the set number of a logged set',
  '.lad-b i': 'D2 logged-set mark: session segments fill with logged work sets',
  '.hm-c.l1': 'D2 data ink: the training heatmap',
  '.hm-c.l2': 'D2 data ink: the training heatmap',
  '.hm-c.l3': 'D2 data ink: the training heatmap',
  '.hm-c.l4': 'D2 data ink: the training heatmap',
  '.mrow .bar i': 'D2 data ink: volume per muscle',
  '.wp-blocks i.on': 'D2 data ink: sessions done this week, one block each',
  '.bm-m.l1': 'D2 the trained-muscle map',
  '.bm-m.l2': 'D2 the trained-muscle map',
  '.bm-m.l3': 'D2 the trained-muscle map',
  '.bm-m.l4': 'D2 the trained-muscle map',
  '.cal-d.has': 'D2 trained calendar days',
  '.wday .dot.done': 'D2 trained calendar days: Home’s week strip',
  '.home-badge.done': 'D2 trained calendar days: today’s session is logged',
  '#timer .bar i': 'D2 the rest-dock bar',
  '#timer.working .t': 'D2 the rest dock while a timed set is held: the clock is the work itself',
}

/** Selectors that may use a record token. The standing Best (the heaviest load) is a measurement in ink; beating it is a Record. */
const RECORD = {
  '.record': 'D3 a Record (utility class)',
  '.pr': 'D3 a Record badge (Workout detail and Workout row)',
  '.set-pill.record': 'D3 the Set that made a Record (Stats history: the session’s heaviest Set)',
}

/** Lines in src/**\/*.{js,jsx} that may name an accent token, by file and a fragment of the line. */
const WORK_JS = [
  { file: 'components/LineChart.jsx', has: "color = 'var(--data)'", why: 'D2 chart ink: the line’s default colour' },
  { file: 'sheets.jsx', has: "background: 'var(--data)'", why: 'D2 trained calendar days: the calendar legend' },
  { file: 'sheets.jsx', has: "v > 0 ? 'var(--acc-text)'", why: 'D2 good or bad: a month ahead of the last (DESIGN.md › Conventions › Colour says good or bad)' },
  { file: 'lib/bodyweight.js', has: "'var(--acc-text)' : 'var(--red-text)'", why: 'D2 the weight delta keeps its good/bad colouring' },
]

/** Lines in src/**\/*.{js,jsx} that may name a record token. */
const RECORD_JS = []

/** Selectors that may use an orange token: each is a workout that is running right now. */
const RUNNING = {
  '.btn.live': 'D20 the Resume key while a workout runs',
  '.home-badge.active': 'D20 Home’s “In progress” badge while a workout runs',
  '#tabbar button.start.rec': 'D20 the tab bar’s Start key while a workout runs (D7)',
}

/** Lines in src/**\/*.{js,jsx} that may name an orange token. */
const RUNNING_JS = []

const tokenUses = (value, family) => [...value.matchAll(/--[\w-]+/g)].map(m => m[0]).filter(n => family.includes(n))

/** Every use of a family's tokens in styles/*.css (outside tokens.css), one per selector. */
function cssUses(family) {
  const out = []
  for (const { name, css } of sheets) {
    if (name === 'tokens.css') continue
    for (const r of cssRules(css)) for (const d of r.decls) {
      const used = tokenUses(d.value, family)
      if (!used.length) continue
      for (const sel of selectorList(r.selector)) {
        out.push({ sel, used, where: `styles/${name}:${d.line} (${sel}${r.media ? ' in ' + r.media : ''}): ${d.prop}: ${d.value}` })
      }
    }
  }
  return out
}

/** Every line of non-test JS/JSX under src/ that names one of a family's tokens. */
function jsUses(family) {
  const out = []
  const walk = dir => {
    for (const f of readdirSync(dir)) {
      const p = resolve(dir, f)
      if (statSync(p).isDirectory()) { if (f !== 'test') walk(p); continue }
      if (!/\.jsx?$/.test(f) || /\.test\.jsx?$/.test(f)) continue
      stripComments(readFileSync(p, 'utf8')).split('\n').forEach((line, i) => {
        const used = tokenUses(line, family)
        if (used.length) out.push({ file: relative(SRC, p), line, used, where: `${relative(SRC, p)}:${i + 1}: ${line.trim()}` })
      })
    }
  }
  walk(SRC)
  return out
}

describe('G2 colour meaning: lime is work, yellow is a record, orange is a running workout', () => {
  const families = [
    { name: 'accent', tokens: ACCENT_TOKENS, css: WORK, js: WORK_JS, list: 'WORK', means: 'the accent means work (spec D2)' },
    { name: 'record', tokens: RECORD_TOKENS, css: RECORD, js: RECORD_JS, list: 'RECORD', means: 'yellow means a Record (a Set that beat the Best or the best estimated 1RM), never the standing Best figure (spec D3 as narrowed by design-review-fixes E12)' },
    { name: 'running', tokens: RUNNING_TOKENS, css: RUNNING, js: RUNNING_JS, list: 'RUNNING', means: 'orange means a workout is running (spec D20); a rescheduled day is an ink mark, a warning is neutral' },
  ]

  for (const f of families) {
    it(`${f.name} tokens (${f.tokens.join(', ')}) colour only allowlisted selectors in styles/*.css`, () => {
      const bad = cssUses(f.tokens).filter(u => !Object.hasOwn(f.css, u.sel)).map(u => u.where)
      expect(bad, `These colour something that is not on the ${f.list} list: ${f.means}; anything else is ink (--label, --label-2, --label-3). If it truly is that use, add the selector to ${f.list} in src/design-lint.test.js with the D2/D3/D20 use it is. ${COLOUR_READ}\n${bad.join('\n')}`).toEqual([])
    })

    it(`${f.name} tokens appear in JS/JSX only on allowlisted lines`, () => {
      const bad = jsUses(f.tokens).filter(u => !f.js.some(a => a.file === u.file && u.line.includes(a.has))).map(u => u.where)
      expect(bad, `Inline colour with ${f.tokens.join('/')} outside the ${f.list}_JS list: ${f.means}. Prefer a class in styles/*.css; if the line truly is that use, add it to ${f.list}_JS with the D2/D3/D20 use it is. ${COLOUR_READ}\n${bad.join('\n')}`).toEqual([])
    })

    it(`every ${f.list} entry still matches a use (no stale allowlist)`, () => {
      const usedSel = new Set(cssUses(f.tokens).map(u => u.sel))
      const js = jsUses(f.tokens)
      const stale = [
        ...Object.keys(f.css).filter(s => !usedSel.has(s)).map(s => `${f.list}: "${s}" (${f.css[s]})`),
        ...f.js.filter(a => !js.some(u => u.file === a.file && u.line.includes(a.has))).map(a => `${f.list}_JS: ${a.file} "${a.has}" (${a.why})`),
      ]
      expect(stale, `These allowlist entries no longer match any ${f.name} colour; remove them from src/design-lint.test.js.\n${stale.join('\n')}`).toEqual([])
    })
  }
})
