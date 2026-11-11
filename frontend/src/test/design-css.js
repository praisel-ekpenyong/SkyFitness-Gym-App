// Reads `styles/*.css` for the design guards (design-tokens.test.js, design-lint.test.js):
// comments blanked with line numbers kept, rules flattened out of @media, and the colour
// tokens resolved per theme and accent the way the browser resolves them on :root.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STYLES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'styles')

/** Every style sheet in `styles/`, as `{ name, css }`, in a stable order. */
export function styleSheets() {
  return readdirSync(STYLES_DIR).filter(f => f.endsWith('.css')).sort()
    .map(name => ({ name, css: readFileSync(resolve(STYLES_DIR, name), 'utf8') }))
}

/** Blanks comments but keeps their newlines, so offsets still map to line numbers. */
export const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))

const lineAt = (src, i) => src.slice(0, i).split('\n').length

/** Splits on `sep` outside parentheses. */
function splitTop(s, sep) {
  const parts = []
  let depth = 0, from = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') depth--
    else if (s[i] === sep && depth === 0) { parts.push([s.slice(from, i), from]); from = i + 1 }
  }
  parts.push([s.slice(from), from])
  return parts
}

/**
 * Flattens a sheet into style rules: `{ selector, media, line, decls: [{ prop, value, line }] }`.
 * At-rule blocks (@media, @keyframes) only contribute their prelude as `media`. The sheets
 * use no CSS nesting, so a rule body never holds a brace.
 */
export function cssRules(css) {
  const src = stripComments(css)
  const out = [], stack = []
  let from = 0
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === ';') from = i + 1
    else if (ch === '}') { stack.pop(); from = i + 1 }
    else if (ch === '{') {
      const prelude = src.slice(from, i).trim().replace(/\s+/g, ' ')
      if (prelude.startsWith('@')) { stack.push(prelude); from = i + 1; continue }
      const end = src.indexOf('}', i)
      const body = src.slice(i + 1, end)
      const decls = []
      for (const [part, at] of splitTop(body, ';')) {
        const c = part.indexOf(':')
        if (c < 0 || !part.trim()) continue
        const lead = part.length - part.trimStart().length
        decls.push({
          prop: part.slice(0, c).trim(),
          value: part.slice(c + 1).trim(),
          line: lineAt(src, i + 1 + at + lead),
        })
      }
      out.push({ selector: prelude, media: stack.join(' '), line: lineAt(src, i), decls })
      i = end
      from = end + 1
    }
  }
  return out
}

/** Custom properties declared on one selector of tokens.css, outside any at-rule. */
function propsOf(rules, selector) {
  const props = {}
  for (const r of rules) {
    if (r.media || r.selector !== selector) continue
    for (const d of r.decls) if (d.prop.startsWith('--')) props[d.prop] = d.value
  }
  return props
}

const SCOPE_PART = /^(?:\[data-theme="light"\]|:not\(\[data-theme="light"\]\)|\[data-accent="([\w-]+)"\])/

/**
 * Reads a token selector: `:root` plus any of `[data-theme="light"]`, `:not([data-theme="light"])`
 * and `[data-accent="x"]`. Returns which theme and accent it applies to and its specificity.
 * Throws on anything else, so a token rule the guard cannot place fails loudly instead of
 * being skipped.
 */
function rootScope(selector) {
  if (!selector.startsWith(':root')) throw new Error(`tokens.css: the design guard cannot read the selector "${selector}"`)
  const scope = { theme: null, accent: null, spec: 1 }
  let rest = selector.slice(':root'.length)
  while (rest) {
    const m = SCOPE_PART.exec(rest)
    if (!m) throw new Error(`tokens.css: the design guard cannot read the selector "${selector}"`)
    if (m[1]) scope.accent = m[1]
    else scope.theme = m[0].startsWith(':not') ? 'dark' : 'light'
    scope.spec++
    rest = rest.slice(m[0].length)
  }
  return scope
}

/**
 * The token sheet as the browser sees it on :root. `vars(theme, accent)` applies every rule
 * whose scope matches, by specificity and then source order: the dark base, the light
 * overrides, one `--acc` per `data-accent`, and any theme-and-accent override.
 */
export function readTokens() {
  const css = readFileSync(resolve(STYLES_DIR, 'tokens.css'), 'utf8')
  const rules = cssRules(css)
  const scoped = rules.filter(r => !r.media).map((r, order) => ({ ...rootScope(r.selector), order, props: propsOf([r], r.selector) }))
  const base = propsOf(rules, ':root')
  const light = propsOf(rules, ':root[data-theme="light"]')
  const accents = {}
  for (const s of scoped) if (s.accent && !s.theme && s.props['--acc']) accents[s.accent] = s.props['--acc']
  const vars = (theme, accent) => Object.assign({}, ...scoped
    .filter(s => (!s.theme || s.theme === (theme === 'light' ? 'light' : 'dark')) && (!s.accent || s.accent === accent))
    .sort((a, b) => a.spec - b.spec || a.order - b.order)
    .map(s => s.props))
  return { css, rules, base, light, accents, vars }
}

// ------------------------------------------------------------------- colour --

const NAMED = { black: [0, 0, 0, 1], white: [1, 1, 1, 1], transparent: [0, 0, 0, 0] }

function hexColour(h) {
  let s = h.slice(1)
  if (s.length === 3 || s.length === 4) s = [...s].map(c => c + c).join('')
  const n = i => parseInt(s.slice(i, i + 2), 16) / 255
  return [n(0), n(2), n(4), s.length === 8 ? n(6) : 1]
}

/**
 * Resolves a token expression to `[r, g, b, a]` in 0–1 sRGB: hex, black/white/transparent,
 * `var()` and `color-mix(in srgb, …)` (premultiplied, as CSS Color 5 mixes).
 */
export function colourOf(expr, vars, depth = 0) {
  if (depth > 20) throw new Error('token cycle at ' + expr)
  const e = expr.trim()
  let m
  if ((m = /^var\(\s*(--[\w-]+)\s*(?:,(.*))?\)$/s.exec(e))) {
    const v = vars[m[1]]
    if (v != null) return colourOf(v, vars, depth + 1)
    if (m[2] != null) return colourOf(m[2], vars, depth + 1)
    throw new Error('undefined token ' + m[1])
  }
  if (/^#[0-9a-f]{3,8}$/i.test(e)) return hexColour(e)
  if (NAMED[e]) return NAMED[e]
  if ((m = /^color-mix\(\s*in srgb\s*,(.*)\)$/s.exec(e))) {
    const [[a], [b]] = splitTop(m[1], ',')
    const arg = s => {
      const pm = /\s(\d+(?:\.\d+)?)%\s*$/.exec(' ' + s.trim())
      return { c: colourOf(pm ? s.trim().slice(0, -pm[0].trim().length) : s, vars, depth + 1), p: pm ? +pm[1] / 100 : null }
    }
    const A = arg(a), B = arg(b)
    let p1 = A.p, p2 = B.p
    if (p1 == null && p2 == null) p1 = p2 = 0.5
    else if (p1 == null) p1 = 1 - p2
    else if (p2 == null) p2 = 1 - p1
    const sum = p1 + p2
    const w1 = p1 / sum, w2 = p2 / sum
    const alpha = A.c[3] * w1 + B.c[3] * w2
    const ch = i => alpha === 0 ? 0 : (A.c[i] * A.c[3] * w1 + B.c[i] * B.c[3] * w2) / alpha
    return [ch(0), ch(1), ch(2), alpha * Math.min(1, sum)]
  }
  throw new Error('unsupported colour expression: ' + e)
}

const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** WCAG relative luminance of an opaque colour. */
export const luminance = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

/** WCAG contrast ratio between two opaque colours. */
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** OKLCH hue angle in degrees (Björn Ottosson's OKLab). */
export function okHue([r, g, b]) {
  const [R, G, B] = [r, g, b].map(toLinear)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  return (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360
}

/** Shortest distance between two hue angles. */
export const hueGap = (h1, h2) => { const d = Math.abs(h1 - h2) % 360; return Math.min(d, 360 - d) }

/** `#rrggbb` for a resolved colour, for failure messages. */
export const hexOf = c => '#' + c.slice(0, 3).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
