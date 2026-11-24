// The oxlint ratchet (ADR 0034). Runs oxlint type-aware (oxlint-tsgolint, against
// <root>/tsconfig.json, ADR 0035), counts hits per file per rule, and
// compares them with lint-baseline.json ({ "<path>": { "<rule>": <count> } }).
// Fails on a hit the baseline does not cover, and on a stale entry (a recorded
// count above the real count), so a fix also lowers the file. A file not in the baseline must be clean.
//
//   node scripts/check-lint-baseline.mjs [--write] [--root <dir>]
//
// --write (npm run lint:baseline) lowers each entry to its real count and drops the
// ones that reach 0. It never raises a count or adds an entry: a new hit is fixed.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const oxlintBin = join(dirname(createRequire(import.meta.url).resolve('oxlint/package.json')), 'bin', 'oxlint')

function option(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

// `eslint(no-unused-vars)` -> `eslint/no-unused-vars`
const ruleName = code => code.replace(/^([^(]+)\((.+)\)$/, '$1/$2')

function lint(root) {
  const r = spawnSync(process.execPath, [oxlintBin, '--type-aware', '--tsconfig', join(root, 'tsconfig.json'), '--format', 'json', '-c', join(root, '.oxlintrc.json'), '.'], { cwd: root, encoding: 'utf8' })
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

// Each recorded entry at min(recorded, real), 0s dropped, keys sorted for stable diffs.
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
const problems = compare(actual, recorded)

for (const p of problems) {
  if (p.kind === 'stale') {
    console.error(`${p.path}: ${p.rule} is stale, the baseline records ${p.allowed} hits but there are ${p.count}. Run npm run lint:baseline to lower it.`)
    continue
  }
  console.error(`${p.path}: ${p.rule} has ${p.count} hits, the baseline allows ${p.allowed}. Fix the new hits:`)
  for (const h of hits.filter(h => h.path === p.path && h.rule === p.rule)) console.error(`  ${p.path}:${h.line} ${h.message}`)
}
process.exit(problems.length ? 1 : 0)
