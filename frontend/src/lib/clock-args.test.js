import { describe, it, expect } from 'vitest'
import { normalizeState } from './profile/index.js'
import { streakOf } from './streak.js'
import { trainedWeeks } from './history.js'
import { buildCompletedWorkout } from './active-finish.js'
import { effortSummary, effortWeeks, effortHistogram } from './effort.js'
import { assertClock, mondayIndexOf } from './dates.js'

// A forgotten or misplaced clock must throw, never turn into NaN dates (CODING_STANDARDS "Function signatures").
describe('clock arguments fail loudly', () => {
  const bad = [undefined, null, NaN, '2026-01-01', new Date(0)]
  const S = { workouts: [] }
  const cases = {
    normalizeState: now => normalizeState({}, now),
    streakOf: now => streakOf(S, now),
    trainedWeeks: now => trainedWeeks(S, now),
    effortSummary: now => effortSummary(S, 7, now),
    effortWeeks: now => effortWeeks(S, 7, now),
    effortHistogram: now => effortHistogram(S, 7, now),
    buildCompletedWorkout: end => buildCompletedWorkout({ entries: [] }, { end }),
  }
  for (const [name, call] of Object.entries(cases)) {
    it(`${name} throws a TypeError on a non-finite clock`, () => {
      for (const b of bad) expect(() => call(b)).toThrow(TypeError)
    })
    it(`${name} accepts a millisecond timestamp`, () => {
      expect(() => call(Date.UTC(2026, 0, 5))).not.toThrow()
    })
  }
  it('trainedWeeks takes the clock before the window size', () => {
    expect(trainedWeeks({ workouts: [{ d: '2026-01-05' }] }, new Date(2026, 0, 6).getTime(), 1)).toBe(1)
  })
  it('assertClock names the parameter', () => {
    expect(() => assertClock(undefined, 'end')).toThrow(/end/)
  })
})

describe('mondayIndexOf', () => {
  it('is Monday-first', () => {
    expect(mondayIndexOf(new Date(2026, 0, 5, 12))).toBe(0)
    expect(mondayIndexOf(new Date(2026, 0, 11, 12))).toBe(6)
  })
})
