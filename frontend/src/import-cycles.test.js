import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = dirname(fileURLToPath(import.meta.url))
const SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path)
    return /\.jsx?$/.test(name) && !/\.(test|spec)\./.test(name) ? [path] : []
  })
}

function resolveLocal(from, spec) {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(from), spec)
  return [base, base + '.js', base + '.jsx', join(base, 'index.js')].find(p => existsSync(p) && statSync(p).isFile()) ?? null
}

function graph() {
  const edges = new Map()
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8')
    const deps = [...text.matchAll(SPECIFIER)].map(m => resolveLocal(file, m[1] || m[2] || m[3])).filter(Boolean)
    edges.set(file, [...new Set(deps)])
  }
  return edges
}

function cycles(edges) {
  const found = []
  const state = new Map()
  const stack = []
  const visit = file => {
    state.set(file, 'open')
    stack.push(file)
    for (const dep of edges.get(file) ?? []) {
      if (state.get(dep) === 'open') found.push([...stack.slice(stack.indexOf(dep)), dep].map(p => relative(SRC, p)).join(' -> '))
      else if (!state.has(dep)) visit(dep)
    }
    stack.pop()
    state.set(file, 'done')
  }
  for (const file of edges.keys()) if (!state.has(file)) visit(file)
  return found
}

describe('src/ module graph', () => {
  it('has no import cycles outside tests', () => {
    expect(cycles(graph())).toEqual([])
  })

  it('detects a cycle when one exists', () => {
    const a = '/x/a.js', b = '/x/b.js'
    expect(cycles(new Map([[a, [b]], [b, [a]]]))).toHaveLength(1)
  })
})
