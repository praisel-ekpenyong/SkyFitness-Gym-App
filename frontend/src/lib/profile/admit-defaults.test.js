import { describe, expect, it } from 'vitest'
import { admit, normalizeState, sanitizeRestorePayload, SCHEMA_VERSION } from './index.js'

const stored = extra => ({
  schemaVersion: SCHEMA_VERSION,
  workouts: [],
  routines: [],
  ...extra,
})

describe('admit fills nested defaults from the factory defaults Sky ships', () => {
  it('fills a partially stored reminder from the shipped defaults, keeping stored fields', () => {
    const out = admit(stored({ reminder: { on: true } }))
    expect(out.reminder).toEqual({ on: true, time: '08:00', tz: null })
  })

  it('fills an absent reminder with the shipped default object', () => {
    expect(admit(stored()).reminder).toEqual({ on: false, time: '08:00', tz: null })
  })

  it('never overwrites a stored value, however falsy', () => {
    const out = admit(stored({
      reminder: { on: false, time: '', tz: null },
      restSec: 0,
      sound: false,
      targetW: 0,
    }))
    expect(out.reminder).toEqual({ on: false, time: '', tz: null })
    expect(out.restSec).toBe(0)
    expect(out.sound).toBe(false)
    expect(out.targetW).toBe(0)
  })

  it('fills a version-0 Profile the same way and stamps the current version', () => {
    const raw = stored()
    delete raw.schemaVersion
    const out = admit(raw)
    expect(out.reminder).toEqual({ on: false, time: '08:00', tz: null })
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('does not change the stored object or share default objects between Profiles', () => {
    const raw = stored()
    const out = admit(raw)
    expect(raw).not.toHaveProperty('reminder')
    const other = admit(stored())
    expect(out.reminder).not.toBe(other.reminder)
    out.reminder.time = '22:00'
    expect(other.reminder.time).toBe('08:00')
    expect(admit(stored()).reminder.time).toBe('08:00')
  })

  it('reaches boot, another tab and a Restore through normalizeState', () => {
    expect(normalizeState(stored(), Date.now()).reminder).toEqual({ on: false, time: '08:00', tz: null })
    expect(normalizeState(stored({ reminder: { on: true, time: '09:30' } }), Date.now()).reminder)
      .toEqual({ on: true, time: '09:30', tz: null })
    const { clean } = sanitizeRestorePayload(stored())
    expect(normalizeState(clean, Date.now()).reminder).toEqual({ on: false, time: '08:00', tz: null })
  })
})
