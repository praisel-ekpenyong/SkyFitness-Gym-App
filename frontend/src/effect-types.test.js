// Guard: the Active workout's effect types and command types are closed sets. In JavaScript this
// stands in for typescript/switch-exhaustiveness-check (docs/EFFECT_STANDARDS.md "Teeth").
//
// Effects: every effect('<type>') that lib/active-act.js builds has an `e.type === '<type>'` branch
// in runEffects (store/effects.js) or in Workout.jsx's send, and every branch is a type the producer
// builds. open-finish is the one type whose branch is the view. A new type means a new branch and
// a new entry in EFFECT_TYPES below.
// Commands: the keys of COMMANDS in lib/active-act.js are the list in ADR 0032.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

const SRC = dirname(fileURLToPath(import.meta.url))
const read = file => readFileSync(join(SRC, file), 'utf8')

const EFFECT_TYPES = ['rest:start', 'rest:stop', 'hold:start', 'hold:stop', 'sound:set', 'sound:finish', 'notice', 'open-finish']
const VIEW_TYPES = ['open-finish']

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return
  visit(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit))
    else if (value && typeof value === 'object') walk(value, visit)
  }
}

const isString = node => node?.type === 'Literal' && typeof node.value === 'string'
const sorted = set => [...set].sort()

/** Types passed as a string to effect(...) in `code`. */
function producedTypes(code) {
  const types = new Set()
  walk(parseAst(code), node => {
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'effect' && isString(node.arguments[0])) {
      types.add(node.arguments[0].value)
    }
  })
  return types
}

/** Types compared as `<x>.type === '<type>'` inside the function or const named `name` in `code`. */
function branchTypes(code, name) {
  const types = new Set()
  let found = false
  walk(parseAst(code, { lang: 'jsx' }), node => {
    const body = node.type === 'FunctionDeclaration' && node.id?.name === name ? node.body
      : node.type === 'VariableDeclarator' && node.id.name === name ? node.init : null
    if (!body) return
    found = true
    walk(body, inner => {
      if (inner.type !== 'BinaryExpression' || inner.operator !== '===') return
      const [prop, literal] = isString(inner.right) ? [inner.left, inner.right] : [inner.right, inner.left]
      if (prop.type === 'MemberExpression' && prop.property.name === 'type' && isString(literal)) types.add(literal.value)
    })
  })
  if (!found) throw new Error(`No function named ${name}`)
  return types
}

/** Problems with the effect types, or [] when producer, runner, view and the closed set agree. */
function effectProblems({ producer, runner, view }) {
  const problems = []
  const branched = new Set([...runner, ...view])
  for (const type of producer) if (!branched.has(type)) problems.push(`${type}: built by active-act.js, no branch handles it`)
  for (const type of branched) if (!producer.has(type)) problems.push(`${type}: a branch handles it, active-act.js never builds it`)
  for (const type of view) if (!VIEW_TYPES.includes(type)) problems.push(`${type}: handled in the view, only ${VIEW_TYPES} belong there`)
  for (const type of runner) if (VIEW_TYPES.includes(type)) problems.push(`${type}: handled in runEffects, it belongs to the view`)
  if (sorted(producer).join() !== sorted(EFFECT_TYPES).join()) problems.push(`effect types ${sorted(producer)} are not the closed set ${sorted(EFFECT_TYPES)}`)
  return problems
}

/** Keys of the COMMANDS object in `code`. */
function commandTypes(code) {
  const keys = new Set()
  walk(parseAst(code), node => {
    if (node.type === 'VariableDeclarator' && node.id.name === 'COMMANDS' && node.init?.type === 'ObjectExpression') {
      for (const p of node.init.properties) keys.add(p.key.name ?? p.key.value)
    }
  })
  return keys
}

/** The commands ADR 0032 lists after "The commands are:", as backticked names up to the next blank line. */
function adrCommands(markdown) {
  const list = markdown.split('The commands are:')[1]?.split(/\n\s*\n/)[1]
  if (!list) throw new Error('ADR 0032 has no "The commands are:" list')
  return new Set([...list.matchAll(/`(\w+)/g)].map(m => m[1]))
}

/** Commands on one side only, or [] when COMMANDS and the ADR agree. */
function commandProblems(commands, adr) {
  return [
    ...sorted(commands).filter(c => !adr.has(c)).map(c => `${c}: in COMMANDS, not in ADR 0032`),
    ...sorted(adr).filter(c => !commands.has(c)).map(c => `${c}: in ADR 0032, not in COMMANDS`),
  ]
}

const adr = () => adrCommands(read('../../docs/adr/0032-the-active-workout.md'))

const current = () => ({
  producer: producedTypes(read('lib/active-act.js')),
  runner: branchTypes(read('store/effects.js'), 'runEffects'),
  view: branchTypes(read('views/Workout.jsx'), 'send'),
})

describe('effect types', () => {
  it('fail when the producer builds a type no branch handles', () => {
    const producer = producedTypes("const a = [effect('rest:start'), effect('rest:pause', { sec: 5 })]")
    expect(producer).toEqual(new Set(['rest:start', 'rest:pause']))
    expect(effectProblems({ ...current(), producer: new Set([...current().producer, ...producer]) }))
      .toContain('rest:pause: built by active-act.js, no branch handles it')
  })

  it('fail when a branch handles a type the producer never builds', () => {
    const runner = branchTypes("function runEffects(effects) { for (const e of effects) if (e.type === 'rest:pause') stop() }", 'runEffects')
    expect(effectProblems({ ...current(), runner: new Set([...current().runner, ...runner]) }))
      .toContain('rest:pause: a branch handles it, active-act.js never builds it')
  })

  it('are the closed set, each handled, open-finish in the view', () => {
    expect(effectProblems(current())).toEqual([])
  })
})

describe('command types', () => {
  it('fail on a command ADR 0032 does not list', () => {
    const commands = commandTypes("const COMMANDS = { begin, 'pause': (S) => S }")
    expect(commands).toEqual(new Set(['begin', 'pause']))
    expect(commandProblems(new Set([...commandTypes(read('lib/active-act.js')), ...commands]), adr()))
      .toEqual(['pause: in COMMANDS, not in ADR 0032'])
  })

  it('are the keys of COMMANDS and the list in ADR 0032', () => {
    expect(adr()).toContain('completeHold')
    expect(commandProblems(commandTypes(read('lib/active-act.js')), adr())).toEqual([])
  })
})
