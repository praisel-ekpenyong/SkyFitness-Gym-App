import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, matchesGlob, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const oxlintBin = join(dirname(createRequire(import.meta.url).resolve('oxlint/package.json')), 'bin', 'oxlint')

function option(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

const ruleName = code => code.replace(/^([^(]+)\((.+)\)$/, '$1/$2')

function lint(root) {
  const r = spawnSync(process.execPath, [oxlintBin, '--type-aware', '--format', 'json', '-c', join(root, '.oxlintrc.json'), '.'], { cwd: root, encoding: 'utf8' })
  let report
  try { report = JSON.parse(r.stdout) } catch {
    throw new Error(`oxlint did not report JSON (exit ${r.status}):\n${r.stderr || r.stdout}`)
  }
  return report.diagnostics.map(d => {
    if (!d.code) throw new Error(`oxlint error without a rule, cannot be baselined: ${d.filename}: ${d.message}`)
    return {
      path: relative(root, resolve(root, d.filename)).split(sep).join('/'),
      rule: ruleName(d.code),
      line: d.labels?.[0]?.span?.line,
      message: d.message,
    }
  })
}

const SOURCE = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/
const SKIP = new Set(['node_modules', '.git'])
// A disable comment for either tool: oxlint honours `eslint-disable` too.
const DISABLE = /(?:\/\/|\/\*)\s*(?:eslint|oxlint)-(?:disable|enable)/

function sourceFiles(root, ignored, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const full = join(dir, d.name)
    const rel = relative(root, full).split(sep).join('/')
    if (SKIP.has(d.name) || ignored(rel) || ignored(rel + '/')) return []
    if (d.isDirectory()) return sourceFiles(root, ignored, full)
    return SOURCE.test(d.name) ? [rel] : []
  })
}

function disableComments(root) {
  // .oxlintrc.json allows whole-line `//` comments.
  const rc = JSON.parse(readFileSync(join(root, '.oxlintrc.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
  const patterns = rc.ignorePatterns ?? []
  const ignored = rel => patterns.some(p => matchesGlob(rel, p))
  return sourceFiles(root, ignored).flatMap(path =>
    readFileSync(join(root, path), 'utf8').split('\n').flatMap((text, i) => (DISABLE.test(text) ? [{ kind: 'disable', path, line: i + 1 }] : [])))
}

function countHits(hits) {
  const counts = {}
  for (const { path, rule } of hits) {
    counts[path] ??= {}
    counts[path][rule] = (counts[path][rule] ?? 0) + 1
  }
  return counts
}

function compare(actual, recorded) {
  const problems = []
  for (const [path, rules] of Object.entries(actual)) {
    for (const [rule, count] of Object.entries(rules)) {
      const allowed = recorded[path]?.[rule] ?? 0
      if (count > allowed) problems.push({ kind: 'new', path, rule, count, allowed })
    }
  }
  for (const [path, rules] of Object.entries(recorded)) {
    for (const [rule, allowed] of Object.entries(rules)) {
      const count = actual[path]?.[rule] ?? 0
      if (count < allowed) problems.push({ kind: 'stale', path, rule, count, allowed })
    }
  }
  return problems
}

function lowerBaseline(actual, recorded) {
  const next = {}
  for (const path of Object.keys(recorded).sort()) {
    for (const rule of Object.keys(recorded[path]).sort()) {
      const count = Math.min(recorded[path][rule], actual[path]?.[rule] ?? 0)
      if (count > 0) (next[path] ??= {})[rule] = count
    }
  }
  return next
}

const root = resolve(option('--root') ?? frontend)
const baselineFile = join(root, 'lint-baseline.json')
let recorded = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {}
const hits = lint(root)
const actual = countHits(hits)
if (process.argv.includes('--write')) {
  recorded = lowerBaseline(actual, recorded)
  writeFileSync(baselineFile, JSON.stringify(recorded, null, 2) + '\n')
}
const problems = [...compare(actual, recorded), ...disableComments(root)]

/** @param {{ kind: string, path: string, rule?: string, count?: number, allowed?: number, line?: number }} p */
const lineFor = p => (p.kind === 'stale'
  ? `${p.path}: ${p.rule} is stale, the baseline records ${p.allowed} hits but there are ${p.count}. Run npm run lint:baseline to lower it.`
  : `${p.path}:${p.line}: a disable comment is not allowed (ADR 0034). Fix the hit, or let the baseline hold it.`)

for (const p of problems) {
  if (p.kind !== 'new') {
    console.error(lineFor(p))
    continue
  }
  console.error(`${p.path}: ${p.rule} has ${p.count} hits, the baseline allows ${p.allowed}. Fix the new hits:`)
  for (const h of hits.filter(h => h.path === p.path && h.rule === p.rule)) console.error(`  ${p.path}:${h.line} ${h.message}`)
}
process.exit(problems.length ? 1 : 0)
