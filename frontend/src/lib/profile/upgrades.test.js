import { describe, expect, it } from 'vitest'
import {
  DEF, SCHEMA_VERSION, NewerProfileError, admit, isNewerProfile, normalizeState,
  sanitizeRestorePayload, validateBackup,
} from './index.js'
import { UPGRADES, schemaVersionOf, upgrade } from './upgrades.js'

// A Profile as every one on disk looked before the schema version: no `schemaVersion`.
const legacy = () => ({
  showRir: true,
  unit: 'lb',
  topW: { '0025': 100 },
  workouts: [{
    id: 'w1', d: '2026-01-02', start: 2,
    entries: [{ id: '0025', topW: 100, sets: [{ warmup: true, w: 40, r: 5, done: true }] }],
  }],
  routines: [],
})

const newer = () => ({ ...legacy(), schemaVersion: SCHEMA_VERSION + 1 })

describe('Profile schema version', () => {
  it('is 1, one upgrade step per version, and a fresh Profile starts at it', () => {
    expect(SCHEMA_VERSION).toBe(1)
    expect(UPGRADES).toHaveLength(SCHEMA_VERSION)
    expect(DEF.schemaVersion).toBe(SCHEMA_VERSION)
    expect(normalizeState(null).schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('reads a Profile with no version as version 0', () => {
    expect(schemaVersionOf({})).toBe(0)
    expect(schemaVersionOf(legacy())).toBe(0)
    expect(schemaVersionOf({ schemaVersion: 0 })).toBe(0)
    expect(schemaVersionOf({ schemaVersion: 1 })).toBe(1)
  })

  it('runs the 0 → 1 step on a version-0 Profile and stamps the current version, values untouched', () => {
    const raw = legacy()
    const out = admit(raw)
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
    expect(out.effort).toBe('rir')
    expect(out).not.toHaveProperty('showRir')
    expect(out.workouts[0].entries[0].sets[0]).toEqual({ w: 40, r: 5, done: true, phase: 'warmup' })
    expect(out.unit).toBe('lb')
    expect(out.topW).toEqual({ '0025': 100 })
    expect(out.workouts[0].entries[0].topW).toBe(100)
    expect(raw).not.toHaveProperty('schemaVersion')
    expect(raw.showRir).toBe(true)
  })

  it('never fills a missing unit stamp: only a unit switch does that (ADR 0031)', () => {
    const raw = { ...legacy(), bodyweight: [{ d: '2026-01-01', w: 80, t: 1 }] }
    for (const out of [admit(raw), normalizeState(raw), admit(admit(raw))]) {
      expect(out.workouts[0]).not.toHaveProperty('unit')
      expect(out.bodyweight[0]).toEqual({ d: '2026-01-01', w: 80, t: 1 })
    }
  })

  it('upgrades through normalizeState too, which every way in uses', () => {
    const out = normalizeState(legacy())
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
    expect(out.effort).toBe('rir')
    expect(out.workouts[0].entries[0].sets[0].phase).toBe('warmup')
  })

  it('admits a Profile already at the current version as stored', () => {
    const once = admit(legacy())
    expect(admit(once)).toEqual(once)
    expect(normalizeState(JSON.parse(JSON.stringify(once)))).toEqual(normalizeState(once))
  })
})

describe('upgrade runs ordered steps from the stored version', () => {
  const steps = seen => [
    S => { seen.push('0→1'); return { ...S, a: 'one' } },
    S => { seen.push('1→2'); return { ...S, b: 'two' } },
    S => { seen.push('2→3'); return { ...S, c: 'three' } },
  ]

  it('runs every step, in order, on a version-0 Profile', () => {
    const seen = []
    expect(upgrade({ x: 1 }, 0, steps(seen))).toEqual({ x: 1, a: 'one', b: 'two', c: 'three' })
    expect(seen).toEqual(['0→1', '1→2', '2→3'])
  })

  it('skips the steps a Profile has already taken', () => {
    const seen = []
    expect(upgrade({ x: 1 }, 2, steps(seen))).toEqual({ x: 1, c: 'three' })
    expect(seen).toEqual(['2→3'])
    const none = []
    expect(upgrade({ x: 1 }, 3, steps(none))).toEqual({ x: 1 })
    expect(none).toEqual([])
  })
})

describe('a Profile from a newer Sky is never admitted', () => {
  it('admit and normalizeState refuse it', () => {
    expect(isNewerProfile(newer())).toBe(true)
    expect(() => admit(newer())).toThrow(NewerProfileError)
    expect(() => normalizeState(newer())).toThrow(NewerProfileError)
  })

  it('refuses a version it cannot read, rather than guess it is old', () => {
    for (const schemaVersion of ['1', -1, 1.5, null, {}]) {
      expect(isNewerProfile({ schemaVersion }), String(schemaVersion)).toBe(true)
      expect(() => admit({ schemaVersion })).toThrow(NewerProfileError)
    }
  })

  it('admits its own version and every older one', () => {
    expect(isNewerProfile({})).toBe(false)
    expect(isNewerProfile({ schemaVersion: 0 })).toBe(false)
    expect(isNewerProfile({ schemaVersion: SCHEMA_VERSION })).toBe(false)
  })
})

describe('the restore path and the schema version', () => {
  it('refuses a backup from a newer Sky with a clear message, before anything is cleaned', () => {
    expect(() => validateBackup(newer())).toThrow(/newer version of Sky/)
    // Even when the newer shape no longer looks like an older backup.
    expect(() => validateBackup({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer version of Sky/)
  })

  it('upgrades a version-0 backup from 0 and stamps it, as boot does', () => {
    const { clean } = sanitizeRestorePayload(legacy())
    expect(clean).not.toHaveProperty('schemaVersion')
    const S = normalizeState(clean)
    expect(S.schemaVersion).toBe(SCHEMA_VERSION)
    expect(S.workouts[0].entries[0].sets[0]).toEqual({ w: 40, r: 5, done: true, phase: 'warmup' })
    expect(S.effort).toBe('rir')
    expect(S).not.toHaveProperty('showRir')
  })

  it('keeps the version a current backup carries', () => {
    const backup = admit(legacy())
    const { clean } = sanitizeRestorePayload(backup)
    expect(clean.schemaVersion).toBe(SCHEMA_VERSION)
    expect(normalizeState(clean).workouts).toEqual(backup.workouts)
  })
})
