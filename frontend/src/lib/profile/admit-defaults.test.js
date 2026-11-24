import { describe, expect, it, vi } from 'vitest'
import { admit, normalizeState, sanitizeRestorePayload, SCHEMA_VERSION } from './index.js'

// A future DEF that gained a field inside `reminder`, one level deeper inside it, and a new nested
// default object. No Profile on disk has any of them.
vi.mock('./def.js', async importOriginal => {
  const { DEF } = await importOriginal()
  return {
    DEF: {
      ...DEF,
      reminder: { ...DEF.reminder, lead: 10, snooze: { min: 5, max: 30 } },
      display: { compact: false },
    },
  }
})

const stored = extra => ({
  schemaVersion: SCHEMA_VERSION,
  workouts: [],
  routines: [],
  reminder: { on: true, time: '07:00', tz: 'Europe/London' },
  ...extra,
})

describe('admit fills nested defaults from DEF', () => {
  it('fills a new field inside reminder and keeps every stored one', () => {
    const out = admit(stored())
    expect(out.reminder).toEqual({ on: true, time: '07:00', tz: 'Europe/London', lead: 10, snooze: { min: 5, max: 30 } })
    expect(out.display).toEqual({ compact: false })
  })

  it('never overwrites a stored value, however falsy', () => {
    const out = admit(stored({
      reminder: { on: false, time: '', tz: null, lead: 0, snooze: { min: null } },
      display: { compact: true },
    }))
    expect(out.reminder).toEqual({ on: false, time: '', tz: null, lead: 0, snooze: { min: null, max: 30 } })
    expect(out.display).toEqual({ compact: true })
  })

  it('fills a version-0 Profile the same way', () => {
    const raw = stored()
    delete raw.schemaVersion
    expect(admit(raw).reminder.lead).toBe(10)
  })

  it('does not change the stored object or share DEF objects', () => {
    const raw = stored()
    const out = admit(raw)
    expect(raw.reminder).toEqual({ on: true, time: '07:00', tz: 'Europe/London' })
    expect(raw).not.toHaveProperty('display')
    out.display.compact = true
    out.reminder.snooze.min = 1
    const again = admit(stored())
    expect(again.display.compact).toBe(false)
    expect(again.reminder.snooze.min).toBe(5)
  })

  it('reaches boot, another tab and a Restore through normalizeState', () => {
    expect(normalizeState(stored(), Date.now()).reminder.lead).toBe(10)
    expect(normalizeState(stored({ reminder: { on: true, lead: 25 } }), Date.now()).reminder).toMatchObject({ on: true, time: '08:00', lead: 25 })
    const { clean } = sanitizeRestorePayload(stored())
    expect(normalizeState(clean, Date.now()).reminder).toMatchObject({ time: '07:00', lead: 10, snooze: { min: 5, max: 30 } })
    expect(normalizeState(clean, Date.now()).display).toEqual({ compact: false })
  })
})
