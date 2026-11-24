// The use-state cap (CODING_STANDARDS.md, "The state caps", rule 1). Counts the
// useState calls in each file under src/; a file may hold at most 4.
//
// frontend-state-allowlist.json ({ "<path>": { "count": <n>, "reason": "..." } })
// holds the files already over the cap, shrink-only: a file may not pass its count,
// and a count above the real count is stale and fails, so a fix also lowers the entry.
// An entry whose file falls to the cap is dropped.
//
//   node scripts/check-frontend-state.mjs [--root <dir>]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const CAP = 4
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function option(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

function countCalls(root) {
  const counts = {}
  for (const entry of readdirSync(join(root, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(c|m)?[jt]sx?$/.test(entry.name)) continue
    const file = join(entry.parentPath, entry.name)
    const count = readFileSync(file, 'utf8').match(/\buseState\s*[(<]/g)?.length ?? 0
    if (count > 0) counts[relative(root, file).split(sep).join('/')] = count
  }
  return counts
}

function compare(actual, allowlist) {
  const problems = []
  for (const [path, count] of Object.entries(actual)) {
    const allowed = allowlist[path]?.count ?? CAP
    if (count > allowed) problems.push(`${path}: ${count} useState calls, ${path in allowlist ? `the allowlist allows ${allowed}` : `the cap is ${CAP}`}. Move the state into a pure function or the store.`)
  }
  for (const [path, { count: allowed }] of Object.entries(allowlist)) {
    const count = actual[path] ?? 0
    if (count < allowed) problems.push(`${path}: the allowlist is stale, it records ${allowed} useState calls but there are ${count}. ${count > CAP ? `Lower it to ${count}` : 'Drop it'} in frontend-state-allowlist.json.`)
    else if (count === allowed && allowed <= CAP) problems.push(`${path}: the allowlist entry is at or under the cap of ${CAP}. Drop it from frontend-state-allowlist.json.`)
  }
  return problems
}

const root = resolve(option('--root') ?? frontend)
const allowlistFile = join(root, 'frontend-state-allowlist.json')
const allowlist = existsSync(allowlistFile) ? JSON.parse(readFileSync(allowlistFile, 'utf8')) : {}
const problems = compare(countCalls(root), allowlist)
for (const p of problems) console.error(p)
process.exit(problems.length ? 1 : 0)
