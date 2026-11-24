// Guard: lifter-facing text goes through t() whole. A label glued together outside t() with a
// template literal or `+` ("Monday: Push", "Set 1 Weight", "8 effective sets") fixes the word
// order and the separators in code, where a translation cannot reach them. Write it as one t()
// string with {0}, {1}… placeholders instead: t('{0}: {1}', day, name).
//
// Scope: views/, sheets/ and components/ (not tests). A string is checked when
// it is built with a template literal or `+` and its fixed text reads as prose: it holds a space, a
// separator (· – — …) or is a bare word or unit ("s", "kg"). Strings that can't reach the lifter
// as text are skipped by where they go:
// - a non-text JSX attribute (className, key, style, viewBox, points, href…),
// - an argument of t() (the placeholder value is already inside a whole t() string),
// - an inline style write (el.style.top = y + 'px'),
// - a variable named for a class list (cls, rowClass, dotClass…).
// Machine strings with no space (routes '/plan/r/' + id, keys id + ':' + n, ISO dates
// d + 'T12:00:00', file names 'sky-backup-' + day + '.json') are not prose and pass.
// What it does not see: text joined by JSX itself ({a} · {b}) and arrays joined with .join(' · ').
//
// Attribute text: aria-label, title, placeholder and alt are read or heard by the lifter, so a
// literal word in one (aria-label="Clear", or a 'Slider' fallback) fails too: wrap it in t().
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

const SRC = dirname(fileURLToPath(import.meta.url))
const READ = 'Write it as one t() string with placeholders: t(\'{0}: {1}\', a, b). See the header of src/i18n-lint.test.js.'

const NON_TEXT_ATTR = /^(className|key|id|style|viewBox|points|d|transform|href|src|to|type|name|role|htmlFor|data-[\w-]+|x\d?|y\d?|cx|cy|r|width|height|fill|stroke)$/
const CLASS_VAR = /(^cls$|Cls$|[cC]lass(Name)?$)/
const CSS_UNIT = /^(px|em|rem|vh|vw|deg|ms)$/
const isProse = s => /\s|[·–—…]/.test(s) || (/^[A-Za-z]+$/.test(s) && !CSS_UNIT.test(s))

/**
 * Leaks the guard may not fail on, by file and source text, each with the reason it is not one.
 * An entry that no longer matches anything fails too, so the list stays true.
 */
const ALLOW = [
  { file: 'views/Home.jsx', text: "' ' + dotCls", reason: 'CSS class list in a plain variable (dot), not text' },
  { file: 'views/Settings.jsx', text: "v + 's'", reason: 'number plus unit suffix for a duration option, not prose' },
  { file: 'views/Stats.jsx', text: "'≤ ' + fmtNum(b.value)", reason: 'numeric histogram bin label' },
  { file: 'views/Stats.jsx', text: "fmtNum(b.n) + ' · ' + b.percent", reason: 'numeric count and percent joined with a separator' },
  { file: 'views/Stats.jsx', text: "' · ' + fmtVol(ex.current", reason: 'separator, number and unit, no words' },
  { file: 'views/Workout.jsx', text: "' · ' + t('rescheduled')", reason: 'separator before a whole t() string' },
  { file: 'sheets/catalogue.jsx', text: "` · ${t('last {0}", reason: 'separator before a whole t() string' },
  { file: 'components/LineChart.jsx', text: "' · ' + hover.note", reason: 'separator before the point note' },
  { file: 'sheets/plan-tools.jsx', text: "' · ' + exCount(bundle.exerciseCount)", reason: 'separator before a whole t() string' },
  { file: 'sheets/plan-tools.jsx', text: "' · ' + t(bundle.scheduledDays", reason: 'separator before a whole t() string' },
  { file: 'sheets/history.jsx', text: '${fmtDur(month.durationMs)}', reason: 'separator join of whole t() strings, durations and volumes' },
]

function sourceFiles() {
  const out = []
  for (const dir of ['views', 'sheets', 'components']) {
    for (const f of readdirSync(join(SRC, dir))) if (f.endsWith('.jsx') && !f.includes('.test.')) out.push(`${dir}/${f}`)
  }
  return out
}

/** Every string built outside t() in `code` (from `file`) whose fixed text reads as prose. */
function leaksIn(file, code = readFileSync(join(SRC, file), 'utf8')) {
  const ast = parseAst(code, { lang: 'jsx' })
  const lineOf = pos => code.slice(0, pos).split('\n').length
  const skipped = ancestors => ancestors.some(a =>
    (a.type === 'JSXAttribute' && NON_TEXT_ATTR.test(typeof a.name.name === 'string' ? a.name.name : '')) ||
    (a.type === 'CallExpression' && a.callee.type === 'Identifier' && a.callee.name === 't') ||
    (a.type === 'AssignmentExpression' && a.left.type === 'MemberExpression' && a.left.object.type === 'MemberExpression' && a.left.object.property.name === 'style') ||
    (a.type === 'VariableDeclarator' && a.id.type === 'Identifier' && CLASS_VAR.test(a.id.name)))
  const out = []
  const visit = (node, ancestors) => {
    let fixed = null
    if (node.type === 'TemplateLiteral' && node.expressions.length) fixed = node.quasis.map(q => q.value.cooked)
    const parent = ancestors.at(-1)
    if (node.type === 'BinaryExpression' && node.operator === '+' && !(parent?.type === 'BinaryExpression' && parent.operator === '+')) {
      const parts = []
      const flatten = x => (x.type === 'BinaryExpression' && x.operator === '+' ? (flatten(x.left), flatten(x.right)) : parts.push(x))
      flatten(node)
      const isStr = x => x.type === 'Literal' && typeof x.value === 'string'
      if (parts.some(x => !isStr(x))) fixed = parts.filter(isStr).map(x => x.value)
    }
    if (fixed && fixed.some(isProse) && !skipped(ancestors)) {
      out.push({ file, line: lineOf(node.start), text: code.slice(node.start, node.end).replace(/\s+/g, ' ') })
    }
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof child === 'object' && typeof child.type === 'string') visit(child, [...ancestors, node])
      }
    }
  }
  visit(ast, [])
  return out
}

const TEXT_ATTR = /^(aria-label|title|placeholder|alt)$/

/**
 * Every aria-label, title, placeholder or alt in `code` (from `file`) that holds literal text
 * outside t(): a quoted value, or a string or template literal anywhere in its expression. Text
 * with no letter ("1990", an empty alt) is not words and passes, and so are object literals
 * (formatter options) and property keys (rest['aria-label']).
 */
function literalAttrsIn(file, code = readFileSync(join(SRC, file), 'utf8')) {
  const ast = parseAst(code, { lang: 'jsx' })
  const lineOf = pos => code.slice(0, pos).split('\n').length
  const hasWord = s => /\p{L}/u.test(s)
  const literalText = node => {
    if (!node || typeof node !== 'object') return false
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 't') return false
    if (node.type === 'ObjectExpression') return false
    if (node.type === 'MemberExpression') return literalText(node.object)
    if (node.type === 'Literal' && typeof node.value === 'string') return hasWord(node.value)
    if (node.type === 'TemplateLiteral' && node.quasis.some(q => hasWord(q.value.cooked))) return true
    return Object.values(node).some(v => (Array.isArray(v) ? v : [v]).some(c => c && typeof c.type === 'string' && literalText(c)))
  }
  const out = []
  const visit = node => {
    if (node.type === 'JSXAttribute' && typeof node.name.name === 'string' && TEXT_ATTR.test(node.name.name) && literalText(node.value)) {
      out.push({ file, line: lineOf(node.start), text: code.slice(node.start, node.end).replace(/\s+/g, ' ') })
    }
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof child === 'object' && typeof child.type === 'string') visit(child)
      }
    }
  }
  visit(ast)
  return out
}

describe('lifter-facing text is built inside t()', () => {
  const found = sourceFiles().flatMap(f => leaksIn(f))
  const allowed = leak => ALLOW.some(a => a.file === leak.file && leak.text.includes(a.text))

  it('no view, sheet or component glues a label together outside t()', () => {
    const bad = found.filter(l => !allowed(l)).map(l => `${l.file}:${l.line}: ${l.text.slice(0, 120)}`)
    expect(bad, `Lifter-facing text built outside t(). ${READ}\n${bad.join('\n')}`).toEqual([])
  })

  it('every allowlist entry still matches a string and gives a reason', () => {
    const stale = ALLOW.filter(a => !a.reason || !found.some(l => l.file === a.file && l.text.includes(a.text)))
    expect(stale.map(a => `${a.file}: ${a.text}`), 'Remove allowlist entries that match nothing, and give every entry a reason.').toEqual([])
  })

  // A check on the rules themselves, so a parser change cannot silently empty the guard.
  it('catches a label glued with a template literal or +, and passes class names, styles, routes and t() arguments', () => {
    const leaks = code => leaksIn('fixture.jsx', code).map(l => l.text)
    expect(leaks('const a = <b aria-label={`${t(DAYN[d])}: ${name}`} />')).toEqual(['`${t(DAYN[d])}: ${name}`'])
    expect(leaks('const a = <b>{t(DAYN[d]) + \' · \' + t(\'Today\')}</b>')).toHaveLength(1)
    expect(leaks('const label = `${n} effective sets`')).toHaveLength(1)
    expect(leaks('const label = v + \'s\'')).toHaveLength(1)
    expect(leaks([
      'const a = <b className={\'row\' + (on ? \' on\' : \'\')} style={{ width: n + \'%\', transform: `scaleX(${k})` }} />',
      'const rowClass = \'hm-c l\' + level',
      'el.style.top = y + \'px\'',
      'nav(\'/plan/r/\' + id)',
      'const name = \'sky-backup-\' + day + \'.json\'',
      'const label = t(\'{0} sets\', done + \' of \' + total)',
    ].join('\n'))).toEqual([])
  })
})

describe('attribute text a lifter reads or hears goes through t()', () => {
  it('no view, sheet or component writes aria-label, title, placeholder or alt text as a literal', () => {
    const bad = sourceFiles().flatMap(f => literalAttrsIn(f)).map(l => `${l.file}:${l.line}: ${l.text.slice(0, 120)}`)
    expect(bad, `Attribute text written outside t(). Wrap it: aria-label={t('Move up')}.\n${bad.join('\n')}`).toEqual([])
  })

  // A check on the rule itself, so a parser change cannot silently empty the guard.
  it('catches a literal aria-label, title, placeholder or alt, and passes t(), numbers and empty alt', () => {
    const hits = code => literalAttrsIn('fixture.jsx', code).map(l => l.text)
    expect(hits('const a = <b aria-label="x" />')).toEqual(['aria-label="x"'])
    expect(hits('const a = <b title={\'Clear\'} />')).toHaveLength(1)
    expect(hits('const a = <input placeholder={`Search`} />')).toHaveLength(1)
    expect(hits('const a = <img alt={on ? \'Front\' : t(\'Back\')} />')).toHaveLength(1)
    expect(hits('const a = <b aria-label={rest[\'aria-label\'] || \'Slider\'} />')).toHaveLength(1)
    expect(hits([
      'const a = <b aria-label={t(\'Move up\')} title={t(\'{0} sets\', n)} />',
      'const b = <input placeholder="1990" />',
      'const c = <img alt="" />',
      'const d = <b className="row" data-x="label" />',
      'const e = <b aria-label={d.toLocaleDateString(dateLocale(), { weekday: \'long\' })} title={rest[\'aria-label\'] || t(\'Slider\')} />',
    ].join('\n'))).toEqual([])
  })
})
