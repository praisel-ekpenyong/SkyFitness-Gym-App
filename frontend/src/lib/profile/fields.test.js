import { describe, expect, it } from 'vitest'
import { admit, normalizeState, SCHEMA_VERSION } from './index.js'

const NOW = new Date(2026, 0, 15, 12).getTime()
const comeIn = unit => normalizeState({ schemaVersion: SCHEMA_VERSION, unit }, NOW).unit

describe('a stored unit is cleaned once on the way in', () => {
  it('reads lbs as lb', () => {
    expect(comeIn('lbs')).toBe('lb')
    expect(comeIn(' LB ')).toBe('lb')
  })

  it('keeps a valid unit', () => {
    expect(comeIn('kg')).toBe('kg')
    expect(comeIn('lb')).toBe('lb')
  })

  it.each([null, 5, '', 'stone', undefined])('turns %s into kg', unit => {
    expect(comeIn(unit)).toBe('kg')
  })
})

describe('admit cleans a unit on the boundary before anything else reads it', () => {
  it('reads lbs as lb', () => {
    expect(admit({ unit: 'lbs' }).unit).toBe('lb')
    expect(admit({ unit: ' LB ' }).unit).toBe('lb')
  })

  it('keeps a valid unit', () => {
    expect(admit({ unit: 'kg' }).unit).toBe('kg')
    expect(admit({ unit: 'lb' }).unit).toBe('lb')
  })

  it.each([null, 5, '', 'stone'])('turns %s into kg', unit => {
    expect(admit({ unit }).unit).toBe('kg')
  })
})
