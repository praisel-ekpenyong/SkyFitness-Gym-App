import { describe, expect, it } from 'vitest'
import { DEF, RESTORE_TOP_KEYS } from './index.js'

describe('restore keys derived from DEF', () => {
  it('takes every DEF key except the in-flight Active workout', () => {
    for (const key of Object.keys(DEF)) {
      if (key === 'active') expect(RESTORE_TOP_KEYS).not.toContain(key)
      else expect(RESTORE_TOP_KEYS).toContain(key)
    }
  })

  it('adds the legacy exWeights key without needing a second hand list', () => {
    expect(DEF).not.toHaveProperty('exWeights')
    expect(RESTORE_TOP_KEYS).toContain('exWeights')
    expect(RESTORE_TOP_KEYS).toHaveLength(Object.keys(DEF).length)
  })
})
