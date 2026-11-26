import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEF, normalizeState, freshProfile } from './index.js'

const HERE = dirname(fileURLToPath(import.meta.url))

function profileSources() {
  return readdirSync(HERE)
    .filter(name => /\.js$/.test(name) && !/\.test\.js$/.test(name))
    .map(name => join(HERE, name))
    .filter(p => statSync(p).isFile())
}

describe('lib/profile is a seam with no DOM and no store', () => {
  it('loads and normalizes a Profile in a node environment', () => {
    expect(typeof document).toBe('undefined')
    expect(typeof window).toBe('undefined')
    expect(normalizeState({ workouts: [] }, Date.now()).workouts).toEqual([])
  })

  it('imports no store module', () => {
    const hits = profileSources()
      .filter(p => /from\s+['"][^'"]*store\//.test(readFileSync(p, 'utf8')))
      .map(p => relative(HERE, p))
    expect(hits).toEqual([])
  })

  it('freshProfile returns a fresh Profile that shares no defaults with DEF', () => {
    const fresh = freshProfile()
    expect(fresh).toEqual(DEF)
    expect(fresh).not.toBe(DEF)
    expect(fresh.reminder).not.toBe(DEF.reminder)
  })
})
