import { describe, it, expect } from 'vitest'
import { validateBackup, sanitizeBackup } from './index.js'

describe('backup validation and sanitization', () => {
  it('validateBackup accepts valid payloads and rejects malformed objects', () => {
    expect(validateBackup({ workouts: [], routines: [] })).toBe(true)
    expect(() => validateBackup(null)).toThrow('not a Sky backup')
    expect(() => validateBackup([])).toThrow('not a Sky backup')
    expect(() => validateBackup({ workouts: [] })).toThrow('not a Sky backup')
    expect(() => validateBackup({ routines: [] })).toThrow('not a Sky backup')
  })

  it('sanitizeBackup clears in-flight active workout sessions', () => {
    expect(sanitizeBackup(null)).toBeNull()
    const state = { active: { id: 'act-1' }, workouts: [] }
    expect(sanitizeBackup(state)).toEqual({ active: null, workouts: [] })
  })

  it('sanitizeBackup drops unknown top-level keys instead of passing them through', () => {
    const state = { active: null, workouts: [], routines: [], alien: { x: 1 } }
    const clean = sanitizeBackup(state)
    expect(clean).not.toHaveProperty('alien')
    expect(clean.workouts).toEqual([])
  })
})
