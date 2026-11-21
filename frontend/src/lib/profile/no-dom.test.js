import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEF, normalizeState, freshProfile } from './index.js'
import * as profileIndex from './index.js'

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
    expect(DEF.unit).toBe('kg')
    expect(normalizeState({ workouts: [] }).workouts).toEqual([])
  })

  it('imports no store module', () => {
    const hits = profileSources()
      .filter(p => /from\s+['"][^'"]*store\//.test(readFileSync(p, 'utf8')))
      .map(p => relative(HERE, p))
    expect(hits).toEqual([])
  })

  it('exports freshProfile and keeps plain helpers internal', () => {
    expect(profileIndex.freshProfile).toBeTypeOf('function')
    const fresh = freshProfile()
    expect(fresh).toEqual(DEF)
    expect(fresh).not.toBe(DEF)
    expect(fresh.reminder).not.toBe(DEF.reminder)

    expect(profileIndex.cloneProfile).toBeUndefined()
    expect(profileIndex.isRecord).toBeUndefined()
  })
})
