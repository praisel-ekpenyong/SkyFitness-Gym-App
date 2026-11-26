import { describe, expect, it } from 'vitest'
import { DEF, RESTORE_TOP_KEYS } from './index.js'

// Independent known-good list. Deriving the expectation from DEF let a field
// that should not be restored change both sides together and pass by construction.
const EXPECTED_RESTORE_KEYS = [
  'accent', 'birthYear', 'body', 'bodyweight', 'customEx', 'dayPlan',
  'displayName', 'effort', 'exWeights', 'favorites', 'gifSize', 'keepAwake',
  'lastExport', 'reminder', 'restSec', 'routines', 'schemaVersion', 'sex',
  'showRir', 'sound', 'streakRule', 'targetW', 'theme', 'trainingStyle',
  'unit', 'volumeRanges', 'week', 'workouts',
]

describe('restore keys', () => {
  it('restores the known fields but not the in-flight Active workout', () => {
    expect([...RESTORE_TOP_KEYS].sort()).toEqual(EXPECTED_RESTORE_KEYS)
  })

  it('adds the legacy exWeights, streakRule and showRir keys that are not Profile fields', () => {
    for (const key of ['exWeights', 'streakRule', 'showRir']) {
      expect(DEF).not.toHaveProperty(key)
      expect(RESTORE_TOP_KEYS).toContain(key)
    }
  })
})
