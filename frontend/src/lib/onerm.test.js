import { describe, it, expect } from 'vitest'
import { estimate1RM, epleyReps, REP_CAP, FORMULAS } from './onerm.js'

describe('estimate1RM', () => {
  it('returns the load unchanged for a single rep', () => {
    expect(estimate1RM(100, 1)).toBe(100)
    expect(estimate1RM(62.5, 1)).toBe(62.5)
  })

  it('matches Epley by hand across the usual rep ranges', () => {
    expect(estimate1RM(100, 5)).toBe(116.7)
    expect(estimate1RM(100, 10)).toBe(133.3)
    expect(estimate1RM(80, 8)).toBe(101.3)
    expect(estimate1RM(60, 3)).toBe(66)
  })

  it('rounds to one decimal', () => {
    expect(estimate1RM(101.25, 7)).toBe(124.9)
    expect(Number.isInteger(estimate1RM(100, 3) * 10)).toBe(true)
  })

  it('refuses reps beyond the cap rather than guessing', () => {
    expect(estimate1RM(100, REP_CAP)).not.toBeNull()
    expect(estimate1RM(100, REP_CAP + 1)).toBeNull()
    expect(estimate1RM(60, 30)).toBeNull()
  })

  it('rejects invalid, zero and negative input', () => {
    expect(estimate1RM(0, 5)).toBeNull()
    expect(estimate1RM(-100, 5)).toBeNull()
    expect(estimate1RM(100, 0)).toBeNull()
    expect(estimate1RM(100, -3)).toBeNull()
    expect(estimate1RM(undefined, 5)).toBeNull()
    expect(estimate1RM(100, undefined)).toBeNull()
    expect(estimate1RM(NaN, 5)).toBeNull()
    expect(estimate1RM(Infinity, 5)).toBeNull()
    expect(estimate1RM('', '')).toBeNull()
  })

  it('accepts numeric strings, the shape number inputs arrive in', () => {
    expect(estimate1RM('100', '5')).toBe(116.7)
  })

  it('offers the other documented formulas and agrees with them at low reps', () => {
    expect(estimate1RM(100, 5, 'brzycki')).toBe(112.5)
    expect(estimate1RM(100, 5, 'lombardi')).toBe(117.5)
    expect(Object.keys(FORMULAS)).toContain('epley')
  })

  it('keeps the formulas within a few percent up to 8 reps, and diverges most at the cap', () => {
    const spread = r => Math.max(...Object.keys(FORMULAS).map(f => estimate1RM(100, r, f)))
      - Math.min(...Object.keys(FORMULAS).map(f => estimate1RM(100, r, f)))
    expect(spread(1)).toBe(0)
    for (let r = 2; r <= 8; r++) expect(spread(r)).toBeLessThan(6)
    const upTo = []
    for (let r = 1; r < REP_CAP; r++) upTo.push(spread(r))
    expect(spread(REP_CAP)).toBeGreaterThan(Math.max(...upTo))
  })

  it('falls back to the default for an unknown formula name', () => {
    expect(estimate1RM(100, 5, 'nope')).toBe(estimate1RM(100, 5))
  })

  it('normalizes load when setUnit and targetUnit are passed', () => {
    expect(estimate1RM(220.462, 1, 'epley', 'lb', 'kg')).toBe(100)
    expect(estimate1RM(100, 1, 'epley', 'kg', 'lb')).toBe(220.5)
    expect(estimate1RM(220.462, 5, 'epley', 'lb', 'kg')).toBe(116.7)
    expect(estimate1RM(100, 5, 'epley', 'kg', 'kg')).toBe(116.7)
  })
})

describe('epleyReps', () => {
  it('inverts the Epley formula for positive 1RM and load', () => {
    expect(epleyReps(120, 100)).toBeCloseTo(6, 10)
    expect(epleyReps(100, 100)).toBe(0)
    expect(epleyReps(90, 100)).toBeCloseTo(-3, 10)
    expect(FORMULAS.epley(75, epleyReps(110, 75))).toBeCloseTo(110, 10)
  })

  it('returns null for non-positive or non-finite inputs', () => {
    expect(epleyReps(100, 0)).toBeNull()
    expect(epleyReps(100, -10)).toBeNull()
    expect(epleyReps(0, 50)).toBeNull()
    expect(epleyReps(NaN, 50)).toBeNull()
    expect(epleyReps(100, Infinity)).toBeNull()
  })
})
