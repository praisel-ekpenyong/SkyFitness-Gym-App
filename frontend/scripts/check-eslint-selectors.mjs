import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const eslintBin = join(dirname(createRequire(import.meta.url).resolve('eslint/package.json')), 'bin', 'eslint.js')

function option(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

// ESLint's suppressions hide the messages this ratchet needs; see ADR 0034.
function lint(root, paths) {
  const dir = mkdtempSync(join(tmpdir(), 'sky-eslint-selectors-'))
  const empty = join(dir, 'eslint-suppressions.json')
  writeFileSync(empty, '{}\n')
  try {
    const r = spawnSync(process.execPath, [eslintBin, '--suppressions-location', empty, '-f', 'json', ...paths], {
      cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    })
    if (r.error) throw r.error
    let report
    try { report = JSON.parse(r.stdout) } catch {
      throw new Error(`ESLint did not report JSON (exit ${r.status}):\n${r.stderr || r.stdout}`)
    }
    return report.flatMap(({ filePath, messages }) => messages
      .filter(m => m.ruleId === 'no-restricted-syntax')
      .map(m => ({
        path: relative(root, filePath), rule: m.ruleId, message: m.message,
      })))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function countHits(hits) {
  const counts = {}
  for (const { path, rule, message } of hits) {
    counts[path] ??= {}
    counts[path][rule] ??= {}
    counts[path][rule][message] = (counts[path][rule][message] ?? 0) + 1
  }
  return counts
}

function compare(actual, recorded) {
  const problems = []
  for (const [path, rules] of Object.entries(actual)) {
    for (const [rule, messages] of Object.entries(rules)) {
      for (const [message, count] of Object.entries(messages)) {
        const allowed = recorded[path]?.[rule]?.[message] ?? 0
        if (count > allowed) problems.push({ kind: 'new', path, rule, message, count, allowed })
      }
    }
  }
  for (const [path, rules] of Object.entries(recorded)) {
    for (const [rule, messages] of Object.entries(rules)) {
      for (const [message, allowed] of Object.entries(messages)) {
        const count = actual[path]?.[rule]?.[message] ?? 0
        if (count < allowed) problems.push({ kind: 'stale', path, rule, message, count, allowed })
      }
    }
  }
  return problems
}

function lower(actual, recorded) {
  const next = {}
  for (const path of Object.keys(recorded).toSorted()) {
    for (const rule of Object.keys(recorded[path]).toSorted()) {
      for (const message of Object.keys(recorded[path][rule]).toSorted()) {
        const count = Math.min(recorded[path][rule][message], actual[path]?.[rule]?.[message] ?? 0)
        if (count > 0) ((next[path] ??= {})[rule] ??= {})[message] = count
      }
    }
  }
  return next
}

function exists(path) {
  try { readFileSync(path); return true } catch { return false }
}

const root = resolve(option('--root') ?? frontend)
const native = join(root, 'eslint-suppressions.json')
const file = join(root, 'eslint-selector-suppressions.json')
const paths = Object.keys(exists(native) ? JSON.parse(readFileSync(native, 'utf8')) : {})
let recorded = exists(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
const actual = countHits(lint(root, paths))
if (process.argv.includes('--write')) {
  recorded = lower(actual, recorded)
  writeFileSync(file, JSON.stringify(recorded, null, 2) + '\n')
}
const problems = compare(actual, recorded)

for (const p of problems) {
  if (p.kind === 'stale') {
    process.stderr.write(`${p.path}: ${p.rule} "${p.message}" selector entry is stale (records ${p.allowed}, found ${p.count}). Run npm run lint:selectors:baseline to lower it.\n`)
    continue
  }
  process.stderr.write(`${p.path}: ${p.rule} "${p.message}" has ${p.count} hits, the selector baseline allows ${p.allowed}. Fix the new selector, or record it deliberately in eslint-selector-suppressions.json.\n`)
}
process.exit(problems.length ? 1 : 0)
