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

/** The source of `file` (or the fixture `code` given instead) and its JSX syntax tree. */
function parsed(file, code = readFileSync(join(SRC, file), 'utf8')) {
  return { code, ast: parseAst(code, { lang: 'jsx' }) }
}

/** The syntax nodes directly under `node`. */
const children = node => Object.values(node).flatMap(v => (Array.isArray(v) ? v : [v])).filter(c => c && typeof c === 'object' && typeof c.type === 'string')
const isT = n => n?.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 't'
const lineOf = (code, pos) => code.slice(0, pos).split('\n').length
/** Where a hit is: its file, line and source text on one line. */
const hitAt = (file, code, node) => ({ file, line: lineOf(code, node.start), text: code.slice(node.start, node.end).replace(/\s+/g, ' ') })

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
function leaksIn(file, source) {
  const { code, ast } = parsed(file, source)
  const skipped = ancestors => ancestors.some(a =>
    (a.type === 'JSXAttribute' && NON_TEXT_ATTR.test(typeof a.name.name === 'string' ? a.name.name : '')) ||
    isT(a) ||
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
    if (fixed && fixed.some(isProse) && !skipped(ancestors)) out.push(hitAt(file, code, node))
    for (const child of children(node)) visit(child, [...ancestors, node])
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
function literalAttrsIn(file, source) {
  const { code, ast } = parsed(file, source)
  const hasWord = s => /\p{L}/u.test(s)
  const literalText = node => {
    if (!node || typeof node !== 'object') return false
    if (isT(node) || node.type === 'ObjectExpression') return false
    if (node.type === 'MemberExpression') return literalText(node.object)
    if (node.type === 'Literal' && typeof node.value === 'string') return hasWord(node.value)
    if (node.type === 'TemplateLiteral' && node.quasis.some(q => hasWord(q.value.cooked))) return true
    return children(node).some(literalText)
  }
  const out = []
  const visit = node => {
    if (node.type === 'JSXAttribute' && typeof node.name.name === 'string' && TEXT_ATTR.test(node.name.name) && literalText(node.value)) out.push(hitAt(file, code, node))
    children(node).forEach(visit)
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

// Action consistency rules 5 and 6 (CODING_STANDARDS.md). An action is a text button (<Button>,
// <button className="btn …">), a menu row (<Row title onClick>, <button className="lrow …">) or
// the confirm and cancel labels of a confirmSheet. Its label is the t() text, JSX text or string it
// shows. A placeholder or icon-only button (iconbtn) is not an action label here.
// - Rule 5: no action label, the confirm sheet's cancel label included, ends in "…" or "...". The
//   confirm sheet is what asks.
// - Rule 6: a destructive label (Delete, Discard, Reset, Erase, Wipe, Clear all, Clear everything,
//   or Remove but not Remove set) is danger: <Button variant="danger">, a danger class on <Button>
//   or <button>, Row's danger prop, or danger: true on confirmSheet. A cancel label is not checked.
//   A key whose click does nothing but open a danger: true confirmSheet is danger too: the onClick
//   is that confirmSheet call (inline, or the whole body of a function), or the name of a function
//   that does only that, declared once in the file. A name declared twice (shadowed by a parameter,
//   or reused) is not followed, so it fails. DESIGN.md draws Delete routine and Discard workout as
//   red text keys (.rt-delete, .wk-discard) with no fill, and the confirm sheet carries the danger.
//   "Remove set" is not destructive: it takes a set off the running workout at once, and "Add set"
//   sits beside it. A bare "Clear" empties a field or a selection and is not destructive either.
const ELLIPSIS = /(…|\.\.\.)$/
const DESTRUCTIVE = /^(Delete|Discard|Reset|Erase|Wipe)\b|^Clear (all|everything)\b|^Remove\b(?! set\b)/

/** The label text under `node`: t() first arguments, JSX text and string literals, never attributes. */
function labelTexts(node) {
  const out = []
  const walk = (n, parent) => {
    if (!n || n.type === 'JSXAttribute') return
    if (isT(n)) {
      const [first] = n.arguments
      if (first?.type === 'Literal' && typeof first.value === 'string') out.push(first.value)
      return
    }
    if (n.type === 'JSXText' && n.value.trim()) out.push(n.value.trim())
    if (n.type === 'Literal' && typeof n.value === 'string' && parent?.type !== 'Property' && n.value.trim()) out.push(n.value.trim())
    for (const c of children(n)) walk(c, n)
  }
  walk(node, null)
  return out
}

const attrOf = (el, name) => el.attributes.find(a => a.type === 'JSXAttribute' && a.name.name === name)
const literalAttr = (el, name) => { const v = attrOf(el, name)?.value; return v?.type === 'Literal' ? String(v.value) : '' }
const propOf = (obj, key) => obj.properties.find(p => p.type === 'Property' && (p.key.name ?? p.key.value) === key)
const isConfirmSheetCall = n => n?.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'confirmSheet'
const isDangerOptions = o => { const p = o && propOf(o, 'danger'); return p?.value.type === 'Literal' && p.value.value === true }
const isFunction = n => ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(n?.type)

/** The options objects a confirmSheet argument holds: the object, or one per branch of a conditional; null for anything else. */
const confirmOptions = arg => arg?.type === 'ConditionalExpression'
  ? [...confirmOptions(arg.consequent), ...confirmOptions(arg.alternate)]
  : [arg?.type === 'ObjectExpression' ? arg : null]

/** The names a binding pattern declares. */
const patternNames = p => {
  if (!p) return []
  if (p.type === 'Identifier') return [p.name]
  if (p.type === 'ObjectPattern') return p.properties.flatMap(q => patternNames(q.type === 'RestElement' ? q.argument : q.value))
  if (p.type === 'ArrayPattern') return p.elements.flatMap(patternNames)
  if (p.type === 'AssignmentPattern') return patternNames(p.left)
  if (p.type === 'RestElement') return patternNames(p.argument)
  return []
}

/** The names `node` declares: variables, functions and their parameters, classes, imports, catch parameters. */
function declaredNames(node) {
  if (node.type === 'VariableDeclarator') return patternNames(node.id)
  if (isFunction(node)) return [...patternNames(node.id), ...node.params.flatMap(patternNames)]
  if (node.type === 'ClassDeclaration') return patternNames(node.id)
  if (/^Import(Default|Namespace)?Specifier$/.test(node.type)) return [node.local.name]
  if (node.type === 'CatchClause') return patternNames(node.param)
  return []
}

/**
 * The click handlers a name in `ast` stands for: a function declaration or a const function,
 * kept only when its name is declared once in the whole file. A shadowed or reused name is left
 * out, so a key that names it fails closed instead of borrowing another function's confirm.
 */
function namedHandlers(ast) {
  const declarations = new Map()
  const functions = new Map()
  const visit = node => {
    for (const name of declaredNames(node)) declarations.set(name, (declarations.get(name) ?? 0) + 1)
    if (node.type === 'FunctionDeclaration' && node.id) functions.set(node.id.name, node)
    if (node.type === 'VariableDeclaration' && node.kind === 'const') {
      for (const d of node.declarations) if (d.id.type === 'Identifier' && isFunction(d.init)) functions.set(d.id.name, d.init)
    }
    children(node).forEach(visit)
  }
  visit(ast)
  return new Map([...functions].filter(([name]) => declarations.get(name) === 1))
}

/** What calling `fn` does when that is one expression: an expression body, or a block of one statement. */
function soleEffect(fn) {
  if (fn.body.type !== 'BlockStatement') return fn.body
  if (fn.body.body.length !== 1) return null
  const [only] = fn.body.body
  if (only.type === 'ExpressionStatement') return only.expression
  return only.type === 'ReturnStatement' ? only.argument : null
}

/** Whether clicking `handler` (an onClick expression) does nothing but open a confirmSheet that is danger: true on every branch. */
function opensOnlyDangerConfirm(handler, handlers) {
  const fn = handler?.type === 'Identifier' ? handlers.get(handler.name) : handler
  if (!isFunction(fn)) return false
  const effect = soleEffect(fn)
  return isConfirmSheetCall(effect) && confirmOptions(effect.arguments[0]).every(isDangerOptions)
}

/**
 * The action a JSX element is, or null: `labels` it shows (rules 5 and 6), `cancelLabels`
 * (rule 5 only) and whether it is `markedDanger` for rule 6.
 */
function elementAction(node, handlers) {
  const el = node.openingElement
  const tag = el.name.type === 'JSXIdentifier' ? el.name.name : ''
  const cls = literalAttr(el, 'className').split(/\s+/)
  const dangerKey = () => cls.includes('danger') || opensOnlyDangerConfirm(attrOf(el, 'onClick')?.value?.expression, handlers)
  if (tag === 'Button') return { labels: node.children.flatMap(labelTexts), cancelLabels: [], markedDanger: literalAttr(el, 'variant') === 'danger' || dangerKey() }
  if (tag === 'button' && (cls.includes('btn') || cls.includes('lrow'))) return { labels: node.children.flatMap(labelTexts), cancelLabels: [], markedDanger: dangerKey() }
  if (tag === 'Row' && attrOf(el, 'onClick')) return { labels: labelTexts(attrOf(el, 'title')?.value), cancelLabels: [], markedDanger: !!attrOf(el, 'danger') || dangerKey() }
  return null
}

/** The action one confirmSheet options object is: its confirm label, its cancel label and its danger flag. */
const confirmAction = options => ({
  labels: labelTexts(propOf(options, 'confirmText')?.value),
  cancelLabels: labelTexts(propOf(options, 'cancelText')?.value),
  markedDanger: isDangerOptions(options),
})

/** The rule 5 ('ellipsis') and rule 6 ('danger') hits of one `action` found at `node`. */
function actionRuleHits(file, code, node, action) {
  const out = []
  if ([...action.labels, ...action.cancelLabels].some(s => ELLIPSIS.test(s))) out.push({ ...hitAt(file, code, node), rule: 'ellipsis' })
  if (!action.markedDanger && action.labels.some(s => DESTRUCTIVE.test(s))) out.push({ ...hitAt(file, code, node), rule: 'danger' })
  return out
}

/** Every action label in `source` (from `file`) that breaks rule 5 ('ellipsis') or rule 6 ('danger'). */
function actionHitsIn(file, source) {
  const { code, ast } = parsed(file, source)
  const handlers = namedHandlers(ast)
  const out = []
  const visit = node => {
    const action = node.type === 'JSXElement' ? elementAction(node, handlers) : null
    if (action) out.push(...actionRuleHits(file, code, node, action))
    if (isConfirmSheetCall(node)) {
      for (const options of confirmOptions(node.arguments[0])) if (options) out.push(...actionRuleHits(file, code, options, confirmAction(options)))
    }
    children(node).forEach(visit)
  }
  visit(ast)
  return out
}

describe('action labels follow Action consistency rules 5 and 6', () => {
  it('no view, sheet or component ends an action label in an ellipsis or leaves a destructive action plain', () => {
    const bad = sourceFiles().flatMap(f => actionHitsIn(f)).map(h => `${h.file}:${h.line}: [${h.rule}] ${h.text.slice(0, 120)}`)
    expect(bad, `Rule 5: drop the "…" from an action label (the confirm sheet asks). Rule 6: a destructive action is variant="danger" (danger: true on confirmSheet).\n${bad.join('\n')}`).toEqual([])
  })

  // A check on the rules themselves, so a parser change cannot silently empty the guard.
  it('fails an action label that ends in an ellipsis, and passes a placeholder', () => {
    const hits = code => actionHitsIn('fixture.jsx', code).map(h => h.rule)
    expect(hits('const a = <Button variant="danger" onClick={go}>{t(\'Delete workout…\')}</Button>')).toEqual(['ellipsis'])
    expect(hits('const a = <button className="lrow tap"><span>{t(\'Rename...\')}</span></button>')).toEqual(['ellipsis'])
    expect(hits('confirmSheet({ title: t(\'Sure?\'), confirmText: t(\'Finish…\') })')).toEqual(['ellipsis'])
    expect(hits('confirmSheet({ confirmText: t(\'Delete\'), cancelText: t(\'Keep editing…\'), danger: true })')).toEqual(['ellipsis'])
    expect(hits([
      'const a = <input placeholder={t(\'Search…\')} />',
      'const b = <Button onClick={go}>{t(\'Rename\')}</Button>',
      'const c = <p>{t(\'Loading…\')}</p>',
    ].join('\n'))).toEqual([])
  })

  it('fails a destructive button or confirm that is not danger, and passes the danger ones', () => {
    const hits = code => actionHitsIn('fixture.jsx', code).map(h => h.rule)
    expect(hits('const a = <Button variant="ghost" onClick={go}>{t(\'Delete routine\')}</Button>')).toEqual(['danger'])
    expect(hits('const a = <button className="btn ghost" onClick={go}>{t(\'Discard workout\')}</button>')).toEqual(['danger'])
    expect(hits('const a = <Row title={t(\'Reset everything\')} onClick={go} />')).toEqual(['danger'])
    expect(hits('confirmSheet({ title: t(\'Delete?\'), confirmText: t(\'Delete\'), onConfirm: go })')).toEqual(['danger'])
    expect(hits('const a = <Button variant="ghost" onClick={() => confirmSheet({ confirmText: t(\'Delete\') })}>{t(\'Delete routine\')}</Button>')).toEqual(['danger', 'danger'])
    expect(hits('const a = <Button onClick={go}>{t(\'Clear everything\')}</Button>')).toEqual(['danger'])
    // The key passes only when its click does nothing but open a danger confirm.
    expect(hits('const a = <Button variant="ghost" onClick={() => x ? confirmSheet({ confirmText: t(\'Delete\'), danger: true }) : destroy()}>{t(\'Delete routine\')}</Button>')).toEqual(['danger'])
    expect(hits('const a = <Button variant="ghost" onClick={() => { confirmSheet({ confirmText: t(\'Delete\'), danger: true }); destroy() }}>{t(\'Delete routine\')}</Button>')).toEqual(['danger'])
    expect(hits([
      'const discard = () => confirmSheet({ confirmText: t(\'Discard\'), danger: true })',
      'function Key({ discard }) { return <button className="btn ghost" onClick={discard}>{t(\'Discard workout\')}</button> }',
    ].join('\n'))).toEqual(['danger'])
    expect(hits([
      'const a = <Button variant="danger" icon="trash" onClick={go}>{t(\'Delete workout\')}</Button>',
      'const b = <button className="lrow tap danger" onClick={go}><span>{t(\'Remove exercise\')}</span></button>',
      'const c = <Row icon="trash" title={t(\'Reset everything\')} danger onClick={go} />',
      'confirmSheet(x ? { confirmText: t(\'Discard\'), danger: true } : { confirmText: t(\'Finish anyway\') })',
      'const d = <Button variant="ghost" onClick={go}>{t(\'Clear\')}</Button>',
      'const e = <Button variant="ghost" onClick={go}>{t(\'Remove set\')}</Button>',
      'const f = <button className="iconbtn bare" aria-label={t(\'Delete entry for {0}\', d)} onClick={go} />',
      'const g = <Button variant="ghost" onClick={() => confirmSheet({ confirmText: t(\'Delete\'), danger: true })}>{t(\'Delete routine\')}</Button>',
      'const discard = () => confirmSheet({ confirmText: t(\'Discard\'), danger: true })',
      'const h = <button className="btn ghost wk-discard" onClick={discard}>{t(\'Discard workout\')}</button>',
      'function wipe() { return confirmSheet({ confirmText: t(\'Wipe\'), danger: true }) }',
      'const i = <Button variant="ghost" onClick={wipe}>{t(\'Wipe data\')}</Button>',
      'const j = <Button variant="ghost" className="rt-delete danger" onClick={go}>{t(\'Delete routine\')}</Button>',
      'confirmSheet({ confirmText: t(\'Finish\'), cancelText: t(\'Discard\') })',
    ].join('\n'))).toEqual([])
  })
})
