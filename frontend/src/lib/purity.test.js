import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(LIB, '..')
const BANNED = new Set(['store', 'components', 'sheets', 'views', 'platform'])

const SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.jsx?$/.test(name) && !/\.(test|spec)\./.test(name) ? [path] : []
  })
}

function specifiers(text) {
  return [...text.matchAll(SPECIFIER)].map(m => m[1] || m[2] || m[3])
}

function escapesLib(file, spec) {
  if (spec.startsWith('.')) {
    const [top] = relative(SRC, resolve(dirname(file), spec)).split(sep)
    return BANNED.has(top)
  }
  const parts = spec.replace(/^[@~]\//, '').split('/')
  const srcAt = parts.indexOf('src')
  const top = srcAt === -1 ? parts[0] : parts[srcAt + 1]
  return BANNED.has(top)
}

describe('lib/ stays pure and owns no browser or UI edge', () => {
  it('imports nothing from store/, components/, sheets/, views/ or platform/', () => {
    const offenders = sourceFiles(LIB).flatMap(file =>
      specifiers(readFileSync(file, 'utf8'))
        .filter(spec => escapesLib(file, spec))
        .map(spec => `${relative(LIB, file)} -> ${spec}`)
    )
    expect(offenders).toEqual([])
  })
})
