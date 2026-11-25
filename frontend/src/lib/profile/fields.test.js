import { describe, expect, it } from 'vitest'
import { normalizeState, SCHEMA_VERSION } from './index.js'

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
