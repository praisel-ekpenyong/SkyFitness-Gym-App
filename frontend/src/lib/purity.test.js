import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(LIB, '..')
const BANNED = new Set(['store', 'components', 'sheets', 'views', 'platform'])
const BANNED_PACKAGES = ['react', 'react-dom', 'zustand', '@capacitor']
const BANNED_GLOBALS = ['localStorage', 'sessionStorage', 'document', 'window', 'navigator', 'indexedDB', 'Capacitor']

const GLOBAL_ALLOWLIST = {}

const SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm
const GLOBAL_USE = new RegExp(`(?<![\\w$.])(${BANNED_GLOBALS.join('|')})(?![\\w$])`, 'g')

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

function isBannedPackage(spec) {
  return BANNED_PACKAGES.some(pkg => spec === pkg || spec.startsWith(`${pkg}/`))
}

function codeOnly(text) {
  let out = ''
  let i = 0
  const braces = []
  const blank = s => s.replace(/[^\n]/g, ' ')
  const skipString = quote => {
    let j = i + 1
    while (j < text.length && text[j] !== quote && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
    out += blank(text.slice(i, j + 1))
    i = j + 1
  }
  const skipTemplate = () => {
    let j = i
    while (j < text.length) {
      if (text[j] === '\\') { j += 2; continue }
      if (text[j] === '`') { out += blank(text.slice(i, j + 1)); i = j + 1; return }
      if (text[j] === '$' && text[j + 1] === '{') {
        out += blank(text.slice(i, j + 2)); i = j + 2; braces.push(0); return
      }
      j++
    }
    out += blank(text.slice(i)); i = text.length
  }
  while (i < text.length) {
    const c = text[i], n = text[i + 1]
    if (c === '/' && n === '/') {
      const end = text.indexOf('\n', i)
      const stop = end === -1 ? text.length : end
      out += blank(text.slice(i, stop)); i = stop
    } else if (c === '/' && n === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      out += blank(text.slice(i, stop)); i = stop
    } else if (c === '"' || c === "'") {
      skipString(c)
    } else if (c === '`') {
      i++; out += ' '; skipTemplate()
    } else if (braces.length && c === '{') {
      braces[braces.length - 1]++; out += c; i++
    } else if (braces.length && c === '}') {
      if (braces[braces.length - 1] === 0) { braces.pop(); out += ' '; i++; skipTemplate() }
      else { braces[braces.length - 1]--; out += c; i++ }
    } else {
      out += c; i++
    }
  }
  return out
}

function bannedGlobals(text) {
  return [...codeOnly(text).matchAll(GLOBAL_USE)].map(m => m[1])
}

describe('the purity checks themselves', () => {
  it('flags framework and platform packages', () => {
    expect(['react', 'react-dom/client', 'react/jsx-runtime', 'zustand', '@capacitor/core'].every(isBannedPackage)).toBe(true)
    expect(['reactive', 'zustand-lite', 'vitest', './react.js'].some(isBannedPackage)).toBe(false)
  })

  it('flags browser globals used as code', () => {
    expect(bannedGlobals('const w = window.innerWidth')).toEqual(['window'])
    expect(bannedGlobals('if (typeof navigator !== "undefined") x()')).toEqual(['navigator'])
    expect(bannedGlobals('localStorage.getItem(k); indexedDB.open(n)')).toEqual(['localStorage', 'indexedDB'])
    expect(bannedGlobals('const s = `${document.title}!`')).toEqual(['document'])
  })

  it('ignores comments, strings, template text and property names', () => {
    const quiet = [
      '// reads window size',
      '/* the document view */',
      "const a = 'window.open'",
      'const b = "document"',
      'const c = `print the document ${n} times`',
      'opts.window = 3; ctx.navigator.share()',
      'const documents = []; const windowed = 1',
    ].join('\n')
    expect(bannedGlobals(quiet)).toEqual([])
  })
})

describe('lib/ stays pure and owns no browser or UI edge', () => {
  it('imports nothing from store/, components/, sheets/, views/ or platform/', () => {
    const offenders = sourceFiles(LIB).flatMap(file =>
      specifiers(readFileSync(file, 'utf8'))
        .filter(spec => escapesLib(file, spec))
        .map(spec => `${relative(LIB, file)} -> ${spec}`)
    )
    expect(offenders).toEqual([])
  })

  it('imports no React, React DOM, Zustand or Capacitor package', () => {
    const offenders = sourceFiles(LIB).flatMap(file =>
      specifiers(readFileSync(file, 'utf8'))
        .filter(isBannedPackage)
        .map(spec => `${relative(LIB, file)} -> ${spec}`)
    )
    expect(offenders).toEqual([])
  })

  it(`uses none of ${BANNED_GLOBALS.join(', ')}`, () => {
    const offenders = sourceFiles(LIB).flatMap(file => {
      const rel = relative(LIB, file).split(sep).join('/')
      const allowed = GLOBAL_ALLOWLIST[rel]?.globals ?? []
      return [...new Set(bannedGlobals(readFileSync(file, 'utf8')))]
        .filter(name => !allowed.includes(name))
        .map(name => `${rel} uses ${name}`)
    })
    expect(offenders).toEqual([])
  })

  it('allowlists only files that exist, each with a reason', () => {
    for (const [rel, entry] of Object.entries(GLOBAL_ALLOWLIST)) {
      expect(statSync(join(LIB, rel)).isFile()).toBe(true)
      expect(entry.reason.trim()).not.toBe('')
    }
  })
})
