import { describe, it, expect, vi } from 'vitest'
import { isRecord, cloneProfile } from './plain.js'

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({})).toBe(true)
    for (const v of [null, undefined, [], 'x', 0, false]) expect(isRecord(v)).toBe(false)
  })
})

describe('cloneProfile', () => {
  it('copies deeply', () => {
    const o = { a: [{ b: 1 }] }
    const c = cloneProfile(o)
    expect(c).toEqual(o)
    expect(c.a).not.toBe(o.a)
  })
  it('falls back to JSON when structuredClone throws', () => {
    vi.stubGlobal('structuredClone', () => { throw new Error('DataCloneError') })
    try {
      expect(cloneProfile({ a: 1, f: () => 1 })).toEqual({ a: 1 })
    } finally { vi.unstubAllGlobals() }
  })
})
