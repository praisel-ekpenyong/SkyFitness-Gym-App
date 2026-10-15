import { describe, expect, it } from 'vitest'
import { hasWork, isExerciseDone, setProgressHighWater, supersetFlowStep } from './supersetFlow.js'

const entry = done => ({ sets: done.map(value => ({ done: value })) })

// The one definition of "work left" that every completion check reads: the
// superset step, the set toggle, the working-weight sheet and the finish label.
describe('hasWork', () => {
  const warmup = { done: false, phase: 'warmup', warmup: true }

  it('ignores warm-up rows, so prep alone never counts as work left', () => {
    expect(hasWork([{ sets: [warmup, { done: true }, { done: true }] }], 0)).toBe(false)
  })

  it('counts an undone work row', () => {
    expect(hasWork([{ sets: [{ done: true }, { done: false }] }], 0)).toBe(true)
  })

  it('reads an entry with no rows as no work left', () => {
    expect(hasWork([{ sets: [] }], 0)).toBe(false)
  })
  it('reads a missing entry as no work left', () => {
    expect(hasWork([], 3)).toBe(false)
    expect(hasWork([undefined], 0)).toBe(false)
    expect(hasWork(null)).toBe(false)
    expect(hasWork(undefined)).toBe(false)
  })

  it('accepts a single entry directly without requiring an entries array and index', () => {
    expect(hasWork({ sets: [{ done: false }] })).toBe(true)
    expect(hasWork({ sets: [{ done: true }] })).toBe(false)
    expect(hasWork({ sets: [warmup, { done: true }] })).toBe(false)
  })
})

describe('isExerciseDone', () => {
  const warmupDone = { done: true, phase: 'warmup', warmup: true }
  const warmupUndone = { done: false, phase: 'warmup', warmup: true }

  it('returns false for nullish entries or entries with no sets', () => {
    expect(isExerciseDone(null)).toBe(false)
    expect(isExerciseDone(undefined)).toBe(false)
    expect(isExerciseDone({ sets: [] })).toBe(false)
  })

  it('returns false for entries with only warm-up sets', () => {
    // Warm-ups are prep, not an exercise workout; an all-warmup entry has no work to finish
    expect(isExerciseDone({ sets: [warmupDone, warmupDone] })).toBe(false)
    expect(isExerciseDone({ sets: [warmupUndone] })).toBe(false)
  })

  it('returns false when work sets remain undone', () => {
    expect(isExerciseDone({ sets: [{ done: true }, { done: false }] })).toBe(false)
    expect(isExerciseDone({ sets: [warmupDone, { done: false }] })).toBe(false)
  })

  it('returns true when all work sets are done, even with unticked warm-up sets', () => {
    expect(isExerciseDone({ sets: [{ done: true }, { done: true }] })).toBe(true)
    expect(isExerciseDone({ sets: [warmupUndone, { done: true }] })).toBe(true)
    expect(isExerciseDone({ sets: [warmupDone, { done: true }] })).toBe(true)
  })
})

describe('supersetFlowStep', () => {
  it('does not create navigation or rest flow for a normal singleton exercise', () => {
    const entries = [entry([true]), entry([false])]
    expect(supersetFlowStep(entries, [0], 0)).toBeNull()
  })

  it('does not count an uncheck/re-check of previously completed work as new progress', () => {
    const finished = entry([true, true, true])
    expect(setProgressHighWater(finished, 3)).toEqual({ isNew: false, highWater: 3 })
    expect(setProgressHighWater(finished, 2)).toEqual({ isNew: true, highWater: 3 })
  })

  it('skips a spent short member and uses the last member with work as the round boundary', () => {
    // A has just completed set two of three; B's only set was completed last round.
    const entries = [entry([true, true, false]), entry([true])]
    expect(supersetFlowStep(entries, [0, 1], 0)).toEqual({
      unitDone: false,
      roundDone: true,
      nextIdx: 0
    })
  })

  it('wraps to the next member with work at a normal round boundary', () => {
    const entries = [entry([true, false, false]), entry([true])]
    expect(supersetFlowStep(entries, [0, 1], 1)).toEqual({
      unitDone: false,
      roundDone: true,
      nextIdx: 0
    })
  })
})
