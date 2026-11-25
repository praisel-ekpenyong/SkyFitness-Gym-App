import { describe, it, expect } from 'vitest'
import { validateBackup } from './index.js'

describe('backup validation and sanitization', () => {
  it('validateBackup accepts valid payloads and rejects malformed objects', () => {
    expect(validateBackup({ workouts: [], routines: [] })).toBe(true)
    expect(() => validateBackup(null)).toThrow('not a Sky backup')
    expect(() => validateBackup([])).toThrow('not a Sky backup')
    expect(() => validateBackup({ workouts: [] })).toThrow('not a Sky backup')
    expect(() => validateBackup({ routines: [] })).toThrow('not a Sky backup')
  })
})
