import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = 'doc-counts.json'
const SOURCES = new Set([
  'eslint-selector-suppressions.json', 'eslint-suppressions.json', 'lint-baseline.json',
  'frontend-state-allowlist.json', 'react-doctor-floor.json',
])
const DOCS = ['CODING_STANDARDS.md', 'docs/TESTING_STANDARDS.md']
const MARKER = /<!--\s*ratchet:\s*([^\s#]+)#([^>]+?)\s*-->([^<]*?)<!--\s*\/\s*ratchet\s*-->/g
const CLAIM = /^(\d[\d,]*)\s+(hits?|calls?|functions?|errors?)(?:\s+in\s+(\d[\d,]*)\s+files?)?$/
const SCALAR = /^(\d[\d,]*)$/

function option(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

function entriesOf(data) {
  const entries = []
  for (const [path, rules] of Object.entries(data)) {
    if (!rules || typeof rules !== 'object' || Array.isArray(rules)) continue
    for (const [key, value] of Object.entries(rules)) {
      if (typeof value === 'number') entries.push({ path, key, count: value })
      else if (value && typeof value.count === 'number') entries.push({ path, key, count: value.count })
      else if (value && typeof value === 'object') {
        for (const [sub, v] of Object.entries(value)) {
          const count = typeof v === 'number' ? v : v?.count
          if (typeof count === 'number') entries.push({ path, key: `${key}\0${sub}`, count })
        }
      }
    }
  }
  return entries
}

function expectedOf(source, key, data) {
  if (source === 'react-doctor-floor.json') {
    if (!Object.hasOwn(data, key)) return null
    return { hits: data[key], files: undefined, scalar: true }
  }
  if (source === 'frontend-state-allowlist.json') {
    if (typeof data[key]?.count !== 'number') return null
    return { hits: data[key].count, files: 1, scalar: false }
  }
  const all = entriesOf(data)
  let matched
  if (key.endsWith('/*')) {
    const prefix = key.slice(0, -1)
    matched = all.filter(e => e.key.startsWith(prefix) || e.key.split('\0')[0].startsWith(prefix))
  } else matched = all.filter(e => e.key === key || e.key.endsWith(`\0${key}`))
  if (!matched.length) return null
  return {
    hits: matched.reduce((n, e) => n + e.count, 0),
    files: new Set(matched.map(e => e.path)).size,
    scalar: false,
  }
}

function claimText(expected, unit, hasFiles) {
  if (expected.scalar) return String(expected.hits)
  if (hasFiles) return `${expected.hits} ${unit} in ${expected.files} files`
  return `${expected.hits} ${unit}`
}

const root = resolve(option('--root') ?? resolve(frontend, '..'))
const write = process.argv.includes('--write')
const manifestPath = join(root, 'frontend', MANIFEST)
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
const cache = new Map()
const problems = []

function sourceData(source) {
  if (!SOURCES.has(source)) return undefined
  if (!cache.has(source)) {
    const path = join(root, 'frontend', source)
    if (!existsSync(path)) return undefined
    cache.set(source, JSON.parse(readFileSync(path, 'utf8')))
  }
  return cache.get(source)
}

const nextManifest = {}
for (const doc of DOCS) {
  const path = join(root, doc)
  if (!existsSync(path)) continue
  const lines = readFileSync(path, 'utf8').split('\n')
  const seen = {}
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(MARKER)) {
      const [whole, source, rawKey, rawClaim] = m
      const key = rawKey.trim()
      const claim = rawClaim.trim()
      const id = `${source}#${key}`
      seen[id] = (seen[id] ?? 0) + 1
      const data = sourceData(source)
      if (data === undefined) {
        problems.push(`${doc}:${i + 1}: ${source} is an unknown source (or missing)`)
        continue
      }
      const expected = expectedOf(source, key, data)
      if (expected === null) {
        problems.push(`${doc}:${i + 1}: ${key} has no recorded count in ${source}`)
        continue
      }
      const cm = claim.match(CLAIM)
      const sm = claim.match(SCALAR)
      if (!cm && !sm) {
        problems.push(`${doc}:${i + 1}: malformed claim "${claim}"`)
        continue
      }
      const hits = Number((cm ?? sm)[1].replaceAll(',', ''))
      const files = cm?.[3] === undefined ? undefined : Number(cm[3].replaceAll(',', ''))
      if (hits === expected.hits && (files === undefined || files === expected.files)) continue
      if (write) {
        const next = `<!-- ratchet: ${source}#${key} -->${claimText(expected, cm?.[2] ?? 'hits', cm?.[3] !== undefined)}<!-- /ratchet -->`
        lines[i] = lines[i].replace(whole, next)
      } else if (hits !== expected.hits) {
        problems.push(`${doc}:${i + 1}: ${key} claim records ${hits} hits, ${source} has ${expected.hits}`)
      } else {
        problems.push(`${doc}:${i + 1}: ${key} claim records ${files} files, ${source} has ${expected.files}`)
      }
    }
  }
  nextManifest[doc] = seen
  const recorded = manifest[doc] ?? {}
  for (const [id, count] of Object.entries(recorded)) {
    if ((seen[id] ?? 0) !== count) problems.push(`${doc}: marker ${id} expected ${count} time(s), found ${seen[id] ?? 0}`)
  }
  if (!write) {
    for (const [id] of Object.entries(seen)) {
      if (!Object.hasOwn(recorded, id)) problems.push(`${doc}: marker ${id} is not in ${MANIFEST}`)
    }
  }
  if (write) writeFileSync(path, lines.join('\n'))
}

if (write) {
  const merged = { ...manifest }
  for (const [doc, ids] of Object.entries(nextManifest)) merged[doc] = { ...(manifest[doc] ?? {}), ...ids }
  writeFileSync(manifestPath, JSON.stringify(merged, null, 2) + '\n')
}

for (const p of problems) process.stderr.write(`${p}. Run npm run doc-counts:baseline to refresh marked claims.\n`)
process.exit(problems.length ? 1 : 0)
