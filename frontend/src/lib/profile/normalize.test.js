import { describe, expect, it } from 'vitest'
import { normalizeState, freshProfile } from './index.js'

describe('normalizeState at the ingestion edge', () => {
  it('gives a fresh Profile for a missing or corrupt saved blob, not a crash', () => {
    const fresh = freshProfile()
    for (const corrupt of [null, undefined, 'x', 5, []]) {
      expect(normalizeState(corrupt, Date.now()), JSON.stringify(corrupt)).toEqual(fresh)
    }
  })
})
