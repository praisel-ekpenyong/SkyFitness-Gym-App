import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { workoutTimestamp, parseDay } from './dates.js'

describe('dates: date-only workoutTimestamp and parseDay', () => {
  const origTZ = process.env.TZ

  beforeEach(() => {
    process.env.TZ = 'America/Los_Angeles'
  })

  afterEach(() => {
    if (origTZ === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = origTZ
    }
  })

  it('parses a date-only workout at local noon, not UTC midnight', () => {
    const d = '2026-03-10'
    const expected = new Date('2026-03-10T12:00:00').getTime()
    const utcMidnight = Date.UTC(2026, 2, 10, 0, 0, 0)
    expect(workoutTimestamp({ d })).toBe(expected)
    expect(workoutTimestamp({ d })).not.toBe(utcMidnight)
  })

  it('parseDay parses a day key into a Date at local noon', () => {
    const dt = parseDay('2026-03-10')
    expect(dt.getHours()).toBe(12)
    expect(dt.getMinutes()).toBe(0)
    expect(dt.getDate()).toBe(10)
    expect(dt.getTime()).toBe(new Date('2026-03-10T12:00:00').getTime())
    expect(Number.isNaN(parseDay('').getTime())).toBe(true)
    expect(Number.isNaN(parseDay(null).getTime())).toBe(true)
  })
})
