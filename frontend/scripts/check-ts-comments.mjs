import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = /\.(?:js|jsx)$/
const TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const DIRECTIVE = /^\s*(?:(?:\/\/|\/\*+|\*+)\s*)?@ts-(?:ignore|nocheck|expect-error)\b/
const SKIP = new Set(['node_modules', '.git', 'dist', 'android', 'ios', 'public', 'coverage', 'fixtures'])

function option(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

function sourceFiles(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (SKIP.has(entry.name)) return []
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(root, full)
    return SOURCE.test(entry.name) && !TEST.test(entry.name) ? [relative(root, full)] : []
  })
}

const root = resolve(option('--root') ?? frontend)
const hits = sourceFiles(root).flatMap(path =>
  readFileSync(join(root, path), 'utf8').split(/\r?\n/).flatMap((text, i) =>
    DIRECTIVE.test(text) ? [{ path, line: i + 1 }] : []))

for (const { path, line } of hits) {
  process.stderr.write(`${path}:${line}: a @ts-* directive opts this file out of typechecking; fix the error instead (ADR 0035).\n`)
}
process.exit(hits.length ? 1 : 0)
