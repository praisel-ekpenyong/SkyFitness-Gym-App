import { describe, it, expect } from 'vitest'
import { workoutTimestamp, parseDay } from './dates.js'

describe('dates: date-only workoutTimestamp and parseDay', () => {
  it('parses a date-only workout at local noon, not UTC midnight', () => {
    const d = '2026-03-10'
    const expected = new Date('2026-03-10T12:00:00').getTime()
    expect(workoutTimestamp({ d })).toBe(expected)
  })

  it('parseDay parses a day key into a Date at local noon', () => {
    const dt = parseDay('2026-03-10')
    expect(dt.getHours()).toBe(12)
    expect(dt.getMinutes()).toBe(0)
    expect(dt.getTime()).toBe(new Date('2026-03-10T12:00:00').getTime())
    expect(Number.isNaN(parseDay('').getTime())).toBe(true)
    expect(Number.isNaN(parseDay(null).getTime())).toBe(true)
  })
})
