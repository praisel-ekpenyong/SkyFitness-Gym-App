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
import { dirname, join, posix } from 'node:path'
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

/**
 * Actions rule 6 cannot prove on its own, by file and source text, each with the reason it is
 * safe. A prop callback such as `onDelete` is only confirmed in the file named in the reason;
 * ErrorBoundary's confirm is inline because the shared sheet host may be in the crashed tree.
 * An entry whose action has gone away fails the stale check below.
 */
const EXEMPT = [
  { file: 'components/ErrorBoundary.jsx', text: 'Tap again to discard', reason: 'inline two-step local confirm in components/ErrorBoundary.jsx (first tap relabels, second discards); the sheet host may be part of the crashed tree' },
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
// <button className="btn …">), a menu row (<Row title onClick>, <button className="lrow …">),
// an icon button (<button className="iconbtn">, label from aria-label) or the confirm and cancel
// labels of a confirmSheet. Its label is the t() text, JSX text or string it shows.
// - Rule 5: no action label, the confirm sheet's cancel label included, ends in "…" or "...". The
//   confirm sheet is what asks.
// - Rule 6: a destructive label (Delete, Discard, Reset, Erase, Wipe, Clear all, Clear everything,
//   or Remove, but not "Remove set" or "Remove from favorites") is danger and confirms.
//   Danger is <Button variant="danger">, a danger class, Row's danger prop, or danger: true on
//   confirmSheet. A cancel label is not checked. The click confirms when it opens that danger
//   confirm before it changes anything: the onClick is that call, a same-file function that ends
//   in it (an early return or close() may come first), a sheet chooser whose own clicks do, or
//   the prop those clicks forward to, wherever that prop is passed: in the same file or on the
//   component where another file imports and renders it. A name declared twice is not followed,
//   so it fails. undo() as the click's only action acts at once and needs no danger mark.
//   "Remove set" takes a set off the running workout at once. "Remove from favorites" is the
//   favourite toggle. A bare "Clear" empties a field.
const ELLIPSIS = /(…|\.\.\.)$/
const DESTRUCTIVE = /^(Delete|Discard|Reset|Erase|Wipe)\b|^Clear (all|everything)\b|^Remove\b(?! set\b| from favorites\b)/
const HARMLESS_CALL = /^(close|toast|t|fmtDate|fmtNum|fmtVol|fmtSigned|exOr)$/

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

const callName = n => n?.type === 'Identifier' ? n.name : n?.type === 'MemberExpression' && n.property?.type === 'Identifier' ? n.property.name : ''
const isNamedCall = (n, name) => n?.type === 'CallExpression' && callName(n.callee) === name
const isUndoNode = n => n?.type === 'Identifier' && n.name === 'undo' || isNamedCall(n, 'undo')
const isDangerConfirmCall = n => isConfirmSheetCall(n) && confirmOptions(n.arguments[0]).every(o => o && isDangerOptions(o))
const isHarmlessCall = n => n?.type === 'CallExpression' && HARMLESS_CALL.test(callName(n.callee))

/** Whether `node` ends in a return, so an early bail cannot fall through into the confirm. */
function returns(node) {
  if (!node) return false
  if (node.type === 'ReturnStatement') return true
  if (node.type === 'BlockStatement') return returns(node.body.at(-1))
  return false
}

/** A statement that may sit in front of the confirm: a bare binding, close(), toast(), or an if that returns. */
function harmlessLead(stmt) {
  if (stmt.type === 'VariableDeclaration') return !hasEffectCall(stmt)
  if (stmt.type === 'ExpressionStatement') return isNamedCall(stmt.expression, 'close') || isNamedCall(stmt.expression, 'toast')
  if (stmt.type === 'IfStatement' && !stmt.alternate && returns(stmt.consequent)) return true
  return false
}

/** Whether `node` contains a call other than close, toast, t() or a formatter. */
function hasEffectCall(node) {
  let found = false
  const walk = n => {
    if (!n || found || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') return
    if (n.type === 'CallExpression' && !isHarmlessCall(n)) found = true
    children(n).forEach(walk)
  }
  walk(node)
  return found
}

/**
 * `fn => () => { close(); fn() }`: the click closes a sheet and forwards to the argument.
 * Returns that parameter name, or null when `fn` is any other function.
 */
function forwardedParam(fn) {
  if (!isFunction(fn) || fn.params.length !== 1 || fn.params[0].type !== 'Identifier') return null
  const param = fn.params[0].name
  const inner = fn.body.type === 'BlockStatement' ? null : fn.body
  if (!isFunction(inner) || inner.body.type !== 'BlockStatement' || inner.body.body.length !== 2) return null
  const [lead, tail] = inner.body.body
  if (!isNamedCall(lead.expression, 'close') || !isNamedCall(tail.expression, param)) return null
  return param
}

/**
 * Whether `node` opens a danger confirm before it changes anything.
 * `seen` stops a name that calls itself. A prop name follows the JSX attribute that passes it.
 */
function confirms(node, ctx, seen) {
  if (!node) return false
  if (isUndoNode(node)) return true
  if (node.type === 'Identifier') {
    const fn = ctx.handlers.get(node.name)
    if (!fn) return propForwards(node.name, ctx, seen)
    if (seen.has(node.name)) return false
    seen.add(node.name)
    const ok = functionConfirms(fn, ctx, seen)
    seen.delete(node.name)
    return ok
  }
  if (isFunction(node)) return functionConfirms(node, ctx, seen)
  if (node.type === 'CallExpression') return callConfirms(node, ctx, seen)
  if (node.type === 'ConditionalExpression') return confirms(node.consequent, ctx, seen) && confirms(node.alternate, ctx, seen)
  return false
}

/** Whether this call is a danger confirm, a chooser whose clicks confirm, or a same-file function that does. */
function callConfirms(node, ctx, seen) {
  if (isDangerConfirmCall(node) || isUndoNode(node)) return true
  if (chooserConfirms(node, ctx, seen)) return true
  if (node.callee.type !== 'Identifier') return false
  const fn = ctx.handlers.get(node.callee.name)
  if (!fn) return false
  const param = forwardedParam(fn)
  if (param) return node.arguments.length > 0 && confirms(node.arguments[0], ctx, seen)
  if (seen.has(node.callee.name)) return false
  seen.add(node.callee.name)
  const ok = functionConfirms(fn, ctx, seen)
  seen.delete(node.callee.name)
  return ok
}

/** An openSheet whose every onClick confirms. The chooser itself is not the destructive write. */
function chooserConfirms(node, ctx, seen) {
  if (callName(node.callee) !== 'openSheet' || !node.arguments[0]) return false
  const clicks = []
  const walk = n => {
    if (!n || typeof n.type !== 'string') return
    if (n.type === 'JSXAttribute' && n.name?.name === 'onClick' && n.value?.type === 'JSXExpressionContainer') clicks.push(n.value.expression)
    else children(n).forEach(walk)
  }
  walk(node.arguments[0])
  return clicks.length > 0 && clicks.every(click => confirms(click, ctx, seen))
}

/** Whether `fn`'s body confirms: an expression, or harmless leads and then one confirming statement. */
function functionConfirms(fn, ctx, seen) {
  if (fn.body.type !== 'BlockStatement') return confirms(fn.body, ctx, seen)
  return listConfirms(fn.body.body, ctx, seen)
}

/** Statements confirm when each one before the last is a harmless lead and the last confirms. */
function listConfirms(stmts, ctx, seen) {
  if (!stmts?.length || !stmts.slice(0, -1).every(harmlessLead)) return false
  return stmtConfirms(stmts.at(-1), ctx, seen)
}

/** One statement confirms: a confirming expression, a return of one, or an if whose two branches do. */
function stmtConfirms(stmt, ctx, seen) {
  if (!stmt) return false
  if (stmt.type === 'ExpressionStatement') return confirms(stmt.expression, ctx, seen)
  if (stmt.type === 'ReturnStatement') return confirms(stmt.argument, ctx, seen)
  if (stmt.type === 'BlockStatement') return listConfirms(stmt.body, ctx, seen)
  if (stmt.type === 'IfStatement' && stmt.alternate) return stmtConfirms(stmt.consequent, ctx, seen) && stmtConfirms(stmt.alternate, ctx, seen)
  return false
}

/**
 * A prop the click names (`onRemove`) confirms when every attribute that passes it does: in this
 * file, and on the elements of each file that imports this file's components under those names.
 * No such attribute fails closed.
 */
function propForwards(name, ctx, seen) {
  const key = `prop:${ctx.file}:${name}`
  if (seen.has(key)) return false
  seen.add(key)
  const passed = [...propAttrs(ctx.ast, name).map(value => ({ value, ctx })), ...importerPropAttrs(ctx, name)]
  const ok = passed.every(p => confirms(p.value, p.ctx, seen))
  seen.delete(key)
  return passed.length > 0 && ok
}

/** The expressions passed as attribute `name` in `ast`, on the elements `counts` accepts. */
function attrValues(ast, name, counts) {
  const out = []
  const walk = (n, element) => {
    if (!n || typeof n.type !== 'string') return
    if (n.type === 'JSXElement') return children(n).forEach(c => walk(c, n))
    if (n.type === 'JSXAttribute' && counts(element) && n.name?.name === name && n.value?.type === 'JSXExpressionContainer') return out.push(n.value.expression)
    children(n).forEach(c => walk(c, element))
  }
  walk(ast, null)
  return out
}

/** The expressions passed as attribute `name` on any element in `ast`. */
const propAttrs = (ast, name) => attrValues(ast, name, () => true)

/** The expressions passed as attribute `name` in `ast` on elements whose tag is one of `tags`. */
const propAttrsOn = (ast, name, tags) => attrValues(ast, name, element => tags.has(element?.openingElement.name?.name))

/**
 * Attribute `name` on the elements other files render from imports of `ctx.file`, each with its
 * own file's context. An import counts only when its relative path, extension included, joins to
 * `ctx.file` exactly, so an import this cannot resolve proves nothing and the prop fails closed.
 */
function importerPropAttrs(ctx, name) {
  return Object.keys(ctx.project).filter(f => f !== ctx.file).flatMap(file => {
    const other = contextOf(file, ctx.project)
    const tags = new Set(other.ast.body
      .filter(n => n.type === 'ImportDeclaration' && posix.join(posix.dirname(file), n.source.value) === ctx.file)
      .flatMap(n => n.specifiers.map(sp => sp.local.name)))
    return tags.size ? propAttrsOn(other.ast, name, tags).map(value => ({ value, ctx: other })) : []
  })
}

/** @type {Record<string, string> | undefined} */
let diskProject
const sourceProject = () => (diskProject ??= Object.fromEntries(sourceFiles().map(f => [f, readFileSync(join(SRC, f), 'utf8')])))

const contexts = new WeakMap()
/** @param {string} file @param {Record<string, string>} project */
function contextOf(file, project) {
  if (!contexts.has(project)) contexts.set(project, new Map())
  const cache = contexts.get(project)
  if (!cache.has(file)) {
    const { code, ast } = parsed(file, project[file])
    cache.set(file, { file, code, ast, handlers: namedHandlers(ast), project })
  }
  return cache.get(file)
}

/**
 * The rule 6 confirm signal, independent of the label verb: `variant="danger"`, a `danger` class
 * or prop, an `icon="trash"` prop, or a nested `<Icon name="trash" />`. Layered on #130's label
 * check, so a trash/danger action fails even when its label is harmless.
 */
const hasTrashIcon = node => {
  if (literalAttr(node.openingElement, 'icon') === 'trash') return true
  let found = false
  const walk = n => {
    if (!n || typeof n !== 'object' || found) return
    if (n.type === 'JSXElement' && n.openingElement?.name?.name === 'Icon' && literalAttr(n.openingElement, 'name') === 'trash') { found = true; return }
    for (const c of children(n)) walk(c)
  }
  walk(node)
  return found
}

/**
 * The action a JSX element is, or null: `labels` it shows (rules 5 and 6), `cancelLabels`
 * (rule 5 only), whether it is `markedDanger`, whether it carries the rule 6 `dangerSignal`
 * for the confirm half, and whether its click `confirms` before writing.
 */
function elementAction(node, ctx) {
  const el = node.openingElement
  const tag = el.name.type === 'JSXIdentifier' ? el.name.name : ''
  const cls = literalAttr(el, 'className').split(/\s+/)
  const confirmed = confirms(attrOf(el, 'onClick')?.value?.expression, ctx, new Set())
  const marked = cls.includes('danger') || confirmed
  const dangerSignal = literalAttr(el, 'variant') === 'danger' || cls.includes('danger') || !!attrOf(el, 'danger') || hasTrashIcon(node)
  if (tag === 'Button') return { labels: node.children.flatMap(labelTexts), cancelLabels: [], markedDanger: literalAttr(el, 'variant') === 'danger' || marked, dangerSignal, confirms: confirmed }
  if (tag === 'button' && cls.includes('iconbtn')) return { labels: labelTexts(attrOf(el, 'aria-label')?.value), cancelLabels: [], markedDanger: marked, dangerSignal, confirms: confirmed }
  if (tag === 'button' && (cls.includes('btn') || cls.includes('lrow'))) return { labels: node.children.flatMap(labelTexts), cancelLabels: [], markedDanger: marked, dangerSignal, confirms: confirmed }
  if (tag === 'Row' && attrOf(el, 'onClick')) return { labels: labelTexts(attrOf(el, 'title')?.value), cancelLabels: [], markedDanger: !!attrOf(el, 'danger') || confirmed, dangerSignal, confirms: confirmed }
  return null
}

/** The action one confirmSheet options object is: its confirm label, its cancel label and its danger flag. */
const confirmAction = options => ({
  labels: labelTexts(propOf(options, 'confirmText')?.value),
  cancelLabels: labelTexts(propOf(options, 'cancelText')?.value),
  markedDanger: isDangerOptions(options),
  dangerSignal: isDangerOptions(options),
  confirms: true,
})

/** The rule 5 ('ellipsis') and rule 6 ('danger', 'confirm') hits of one `action` found at `node`. */
function actionRuleHits(file, code, node, action) {
  const out = []
  if ([...action.labels, ...action.cancelLabels].some(s => ELLIPSIS.test(s))) out.push({ ...hitAt(file, code, node), rule: 'ellipsis' })
  const destructive = action.labels.some(s => DESTRUCTIVE.test(s))
  if (!action.markedDanger && destructive) out.push({ ...hitAt(file, code, node), rule: 'danger' })
  // The danger half keeps #130's label verb; the confirm half is layered with the danger signal,
  // so variant="danger" or a trash icon needs a confirm even under a harmless label.
  if ((destructive || action.dangerSignal) && !action.confirms) out.push({ ...hitAt(file, code, node), rule: 'confirm' })
  return out
}

/**
 * Every action label in `file` that breaks rule 5 ('ellipsis') or rule 6 ('danger', 'confirm').
 * `project` holds the source of `file` and of every file rule 6 may follow a prop into.
 */
function actionHitsIn(file, project) {
  const ctx = contextOf(file, project)
  const out = []
  const visit = node => {
    const action = node.type === 'JSXElement' ? elementAction(node, ctx) : null
    if (action) out.push(...actionRuleHits(file, ctx.code, node, action))
    if (isConfirmSheetCall(node)) {
      for (const options of confirmOptions(node.arguments[0])) if (options) out.push(...actionRuleHits(file, ctx.code, options, confirmAction(options)))
    }
    children(node).forEach(visit)
  }
  visit(ctx.ast)
  return out
}

/** Every action element and confirm-sheet options object in `file` of `project`, with its source text. */
function actionTextsIn(file, project) {
  const ctx = contextOf(file, project)
  const out = []
  const visit = node => {
    if (node.type === 'JSXElement' && elementAction(node, ctx)) out.push(hitAt(file, ctx.code, node))
    if (isConfirmSheetCall(node)) {
      for (const options of confirmOptions(node.arguments[0])) if (options) out.push(hitAt(file, ctx.code, options))
    }
    children(node).forEach(visit)
  }
  visit(ctx.ast)
  return out
}

/** The rule 5 and 6 hits of a fixture `code` standing alone as `file`. */
const fixtureActionHits = (file, code) => actionHitsIn(file, { [file]: code })

/** An exemption matches an item when its file and source text are still present. */
const matchesEntry = (entry, item) => entry.file === item.file && item.text.includes(entry.text)
/** Hits left after applying the fixed exemption list (the real list unless fixtures pass one). */
const exemptHits = (hits, exemptions = EXEMPT) => hits.filter(h => !exemptions.some(e => matchesEntry(e, h)))
/** Entries with no reason, or whose action no longer exists. */
const staleExemptions = (exemptions, actions) => exemptions.filter(e => !e.reason || !actions.some(a => matchesEntry(e, a)))

describe('action labels follow Action consistency rules 5 and 6', () => {
  it('no view, sheet or component ends an action label in an ellipsis or leaves a destructive action plain', () => {
    const bad = exemptHits(sourceFiles().flatMap(f => actionHitsIn(f, sourceProject()))).map(h => `${h.file}:${h.line}: [${h.rule}] ${h.text.slice(0, 120)}`)
    expect(bad, `Rule 5: drop the "…" from an action label (the confirm sheet asks). Rule 6: a destructive action is variant="danger" and opens confirmSheet({ danger: true }) before it changes anything. undo() may act at once.\n${bad.join('\n')}`).toEqual([])
  })

  it('every exemption entry still matches an action and gives a reason', () => {
    const actions = sourceFiles().flatMap(f => actionTextsIn(f, sourceProject()))
    const stale = staleExemptions(EXEMPT, actions)
    expect(stale.map(e => `${e.file}: ${e.text}`), 'Remove exemption entries that match no action, and give every entry a reason.').toEqual([])
  })

  // A check on the rules themselves, so a parser change cannot silently empty the guard.
  it('fails an action label that ends in an ellipsis, and passes a placeholder', () => {
    const hits = code => fixtureActionHits('fixture.jsx', code).map(h => h.rule)
    expect(hits('const a = <Button variant="danger" onClick={go}>{t(\'Delete workout…\')}</Button>')).toEqual(['ellipsis', 'confirm'])
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
    const hits = code => fixtureActionHits('fixture.jsx', code).map(h => h.rule)
    expect(hits('const a = <Button variant="ghost" onClick={go}>{t(\'Delete routine\')}</Button>')).toEqual(['danger', 'confirm'])
    expect(hits('const a = <button className="btn ghost" onClick={go}>{t(\'Discard workout\')}</button>')).toEqual(['danger', 'confirm'])
    expect(hits('const a = <Row title={t(\'Reset everything\')} onClick={go} />')).toEqual(['danger', 'confirm'])
    expect(hits('confirmSheet({ title: t(\'Delete?\'), confirmText: t(\'Delete\'), onConfirm: go })')).toEqual(['danger'])
    expect(hits('const a = <Button variant="ghost" onClick={() => confirmSheet({ confirmText: t(\'Delete\') })}>{t(\'Delete routine\')}</Button>')).toEqual(['danger', 'confirm', 'danger'])
    expect(hits('const a = <Button onClick={go}>{t(\'Clear everything\')}</Button>')).toEqual(['danger', 'confirm'])
    // The key passes only when its click does nothing but open a danger confirm.
    expect(hits('const a = <Button variant="ghost" onClick={() => x ? confirmSheet({ confirmText: t(\'Delete\'), danger: true }) : destroy()}>{t(\'Delete routine\')}</Button>')).toEqual(['danger', 'confirm'])
    expect(hits('const a = <Button variant="ghost" onClick={() => { confirmSheet({ confirmText: t(\'Delete\'), danger: true }); destroy() }}>{t(\'Delete routine\')}</Button>')).toEqual(['danger', 'confirm'])
    expect(hits([
      'const discard = () => confirmSheet({ confirmText: t(\'Discard\'), danger: true })',
      'function Key({ discard }) { return <button className="btn ghost" onClick={discard}>{t(\'Discard workout\')}</button> }',
    ].join('\n'))).toEqual(['danger', 'confirm'])
    expect(hits([
      'confirmSheet(x ? { confirmText: t(\'Discard\'), danger: true } : { confirmText: t(\'Finish anyway\') })',
      'const d = <Button variant="ghost" onClick={go}>{t(\'Clear\')}</Button>',
      'const e = <Button variant="ghost" onClick={go}>{t(\'Remove set\')}</Button>',
      'const fav = <button className="iconbtn bare" aria-label={t(\'Remove from favorites\')} onClick={go} />',
      'const g = <Button variant="ghost" onClick={() => confirmSheet({ confirmText: t(\'Delete\'), danger: true })}>{t(\'Delete routine\')}</Button>',
      'const discard = () => confirmSheet({ confirmText: t(\'Discard\'), danger: true })',
      'const h = <button className="btn ghost wk-discard" onClick={discard}>{t(\'Discard workout\')}</button>',
      'function wipe() { return confirmSheet({ confirmText: t(\'Wipe\'), danger: true }) }',
      'const i = <Button variant="ghost" onClick={wipe}>{t(\'Wipe data\')}</Button>',
      'const undoBtn = <Button variant="ghost" onClick={() => undo()}>{t(\'Delete workout\')}</Button>',
      'function deleteCustomEx(ex) { if (active) { toast(t(\'Finish\')); return } confirmSheet({ confirmText: t(\'Delete\'), danger: true, onConfirm: go }) }',
      'const del = <Button variant="danger" onClick={() => deleteCustomEx(ex)}>{t(\'Delete\')}</Button>',
      'const delEx = <Button variant="danger" onClick={() => { close(); deleteCustomEx(ex) }}>{t(\'Delete exercise\')}</Button>',
      'confirmSheet({ confirmText: t(\'Finish\'), cancelText: t(\'Discard\') })',
    ].join('\n'))).toEqual([])
  })

  it('fails a destructive action that acts at once, including an icon button, and passes a danger confirm or undo()', () => {
    const hits = code => fixtureActionHits('fixture.jsx', code).map(h => h.rule)
    expect(hits('const a = <Button variant="danger" onClick={go}>{t(\'Remove goal\')}</Button>')).toEqual(['confirm'])
    expect(hits('const a = <button className="iconbtn bare" aria-label={t(\'Delete entry for {0}\', d)} onClick={go} />')).toEqual(['danger', 'confirm'])
    expect(hits('const a = <Button variant="ghost" className="rt-delete danger" onClick={go}>{t(\'Delete routine\')}</Button>')).toEqual(['confirm'])
    expect(hits('const a = <button className="iconbtn bare" aria-label={t(\'Delete entry for {0}\', d)} onClick={() => confirmSheet({ confirmText: t(\'Delete\'), danger: true })} />')).toEqual([])
    expect(hits('const a = <Button onClick={undo}>{t(\'Discard workout\')}</Button>')).toEqual([])
  })

  // Rule 6's confirm half is layered on top of the label check: the danger signal is
  // variant="danger" or the trash icon, not the label verb. A harmless-looking label on a
  // trash-icon or danger button must still confirm. #130's label check stays for the danger half.
  it('fails an unconfirmed danger text or trash-icon action even with a non-destructive label', () => {
    const hits = code => fixtureActionHits('fixture.jsx', code).map(h => h.rule)
    expect(hits('const a = <Button variant="danger" onClick={go}>{t(\'Archive\')}</Button>')).toEqual(['confirm'])
    expect(hits('const a = <button className="iconbtn bare" aria-label={t(\'Bin\')} onClick={go}><Icon name="trash" /></button>')).toEqual(['confirm'])
    expect(hits('const a = <Row icon="trash" title={t(\'Bin\')} onClick={go} />')).toEqual(['confirm'])
    expect(hits('const a = <Button variant="danger" onClick={() => confirmSheet({ confirmText: t(\'Archive\'), danger: true })}>{t(\'Archive\')}</Button>')).toEqual([])
    expect(hits([
      'const archive = () => confirmSheet({ confirmText: t(\'Archive\'), danger: true })',
      'const a = <button className="lrow tap danger" onClick={archive}><Icon name="trash" /><span>{t(\'Archive\')}</span></button>',
    ].join('\n'))).toEqual([])
  })

  // A sheet in its own file forwards its click to a prop; the confirm lives in the file that
  // imports the sheet and passes that prop. Only the imported component's attribute counts.
  it('follows a prop callback across the import into the file that passes it', () => {
    const sheet = [
      'export function EditSheet({ close, onRemove }) {',
      '  const run = fn => () => { close(); fn() }',
      '  return <button className="lrow tap danger" onClick={run(onRemove)}><Icon name="trash" />{t(\'Remove exercise\')}</button>',
      '}',
    ].join('\n')
    const importer = body => `import { EditSheet as Edit } from '../sheets/edit.jsx'\n${body}`
    const hits = (...others) => actionHitsIn('sheets/edit.jsx', Object.fromEntries([['sheets/edit.jsx', sheet], ...others.map((code, i) => [`views/V${i}.jsx`, code])])).map(h => h.rule)
    const confirm = 'confirmSheet({ confirmText: t(\'Remove\'), danger: true })'
    expect(hits(importer(`const removeIt = () => ${confirm}\nconst a = <Edit close={c} onRemove={removeIt} />`))).toEqual([])
    expect(hits(importer('const removeIt = () => destroy()\nconst a = <Edit close={c} onRemove={removeIt} />'))).toEqual(['confirm'])
    // Every importer must confirm, not just one.
    expect(hits(importer(`const a = <Edit onRemove={() => ${confirm}} />`), importer('const b = <Edit onRemove={destroy} />'))).toEqual(['confirm'])
    // Another component's prop of the same name, or a file that does not import the sheet, proves nothing.
    expect(hits(importer(`const a = <Other onRemove={() => ${confirm}} />`))).toEqual(['confirm'])
    expect(hits(`import { EditSheet } from '../sheets/other.jsx'\nconst a = <EditSheet onRemove={() => ${confirm}} />`)).toEqual(['confirm'])
    expect(hits()).toEqual(['confirm'])
  })

  it('exempted entry (passes)', () => {
    const hits = fixtureActionHits('fixture.jsx', 'const a = <Button variant="danger" onClick={go}>{t(\'Archive\')}</Button>')
    expect(hits.map(h => h.rule)).toEqual(['confirm'])
    const entry = [{ file: 'fixture.jsx', text: 'Archive', reason: 'fixture: the local two-step confirm is in this file' }]
    expect(exemptHits(hits, entry)).toEqual([])
    expect(staleExemptions(entry, hits)).toEqual([])
    expect(staleExemptions([{ file: 'fixture.jsx', text: 'Archive' }], hits)).toHaveLength(1)
  })

  it('stale exemption (fails)', () => {
    const hits = fixtureActionHits('fixture.jsx', 'const a = <Button variant="danger" onClick={go}>{t(\'Archive\')}</Button>')
    const stale = [{ file: 'fixture.jsx', text: 'Bin', reason: 'fixture: the action was renamed' }]
    expect(staleExemptions(stale, hits).map(e => e.text)).toEqual(['Bin'])
    expect(exemptHits(hits, stale).map(h => h.rule)).toEqual(['confirm'])
  })
})
