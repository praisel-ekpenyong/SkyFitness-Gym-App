import { describe, it, expect } from 'vitest'
import { cleanBirthYear, ageCoefficientOf } from './birth-year.js'

const NOW = Date.UTC(2026, 6, 1, 12)

describe('birth year clock', () => {
  it('rejects a year after the injected current year', () => {
    expect(cleanBirthYear(2026, NOW)).toBe(2026)
    expect(cleanBirthYear(2027, NOW)).toBeNull()
  })

  it('accepts a year that is only in the future of the real clock when the injected clock allows it', () => {
    const future = Date.UTC(2040, 0, 1)
    expect(cleanBirthYear(2035, future)).toBe(2035)
  })

  it('rejects anything that is not a four-digit integer', () => {
    expect(cleanBirthYear(999, NOW)).toBeNull()
    expect(cleanBirthYear('1990', NOW)).toBeNull()
    expect(cleanBirthYear(1990.5, NOW)).toBeNull()
  })
})

describe('age coefficient clock', () => {
  it('reads age from the same injected clock as the birth-year check', () => {
    const birthYear = cleanBirthYear(1966, NOW)
    expect(ageCoefficientOf(birthYear, NOW)).toBe(1.3)
    expect(ageCoefficientOf(birthYear, Date.UTC(2000, 0, 1))).toBe(1)
  })
})
