import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tscBin = join(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin', 'tsc')

const DIAG_LINE = /^([^\r\n]+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/

function option(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

function typecheck(root) {
  const tsconfig = join(root, 'tsconfig.json')
  const r = spawnSync(process.execPath, [tscBin, '-p', tsconfig, '--pretty', 'false'], { cwd: root, encoding: 'utf8' })
  if (r.error) throw r.error

  const hits = []
  const output = (r.stdout || '') + (r.stderr ? '\n' + r.stderr : '')
  for (const line of output.split(/\r?\n/)) {
    const m = DIAG_LINE.exec(line)
    if (m) {
      hits.push({
        path: relative(root, resolve(root, m[1])).split(sep).join('/'),
        line: Number(m[2]),
        code: m[4],
        message: m[5],
      })
    } else if (/^error TS\d+:/.test(line)) {
      throw new Error(`tsc reported a global error that cannot be baselined:\n${line}`)
    }
  }
  if (r.status !== 0 && hits.length === 0) {
    throw new Error(`tsc failed without file diagnostics (exit ${r.status}):\n${output.trim()}`)
  }
  return hits
}

function countHits(hits) {
  const counts = {}
  for (const { path } of hits) counts[path] = (counts[path] ?? 0) + 1
  return counts
}

function compare(actual, recorded) {
  const problems = []
  for (const [path, count] of Object.entries(actual)) {
    const allowed = recorded[path] ?? 0
    if (count > allowed) problems.push({ kind: 'new', path, count, allowed })
  }
  for (const [path, allowed] of Object.entries(recorded)) {
    const count = actual[path] ?? 0
    if (count < allowed) problems.push({ kind: 'stale', path, count, allowed })
  }
  return problems
}

function lowerBaseline(actual, recorded) {
  const next = {}
  for (const path of Object.keys(recorded).toSorted()) {
    const count = Math.min(recorded[path], actual[path] ?? 0)
    if (count > 0) next[path] = count
  }
  return next
}

const root = resolve(option('--root') ?? frontend)
const baselineFile = join(root, 'tsc-baseline.json')
let recorded = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {}
const hits = typecheck(root)
const actual = countHits(hits)
if (process.argv.includes('--write')) {
  recorded = lowerBaseline(actual, recorded)
  writeFileSync(baselineFile, JSON.stringify(recorded, null, 2) + '\n')
}
const problems = compare(actual, recorded)

for (const p of problems) {
  if (p.kind === 'stale') {
    process.stderr.write(`${p.path}: tsc baseline is stale, it records ${p.allowed} errors but there are ${p.count}. Run npm run typecheck:baseline to lower it.\n`)
    continue
  }
  process.stderr.write(`${p.path}: has ${p.count} tsc errors, the baseline allows ${p.allowed}. Fix the new errors:\n`)
  for (const h of hits.filter(h => h.path === p.path)) process.stderr.write(`  ${p.path}:${h.line} ${h.code}: ${h.message}\n`)
}
process.exit(problems.length ? 1 : 0)
