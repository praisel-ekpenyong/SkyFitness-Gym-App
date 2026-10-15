import { describe, it, expect } from 'vitest'
import { toggleActiveSet, peekWeightCommit, commitWorkingWeight } from './active-toggle.js'

const clone = o => JSON.parse(JSON.stringify(o))
const solo = () => ({
  active: {
    cur: 0,
    entries: [{
      id: 'ex1',
      target: { reps: 5, weight: 80 },
      sets: [{ w: 80, r: 5, done: false }, { w: 80, r: 5, done: false }],
    }],
  },
  exWeights: {},
})

describe('toggle next action', () => {
  it('mid-workout toggle stays, opening nothing', () => {
    const S = solo()
    const r = toggleActiveSet(S, 0, 0, { highWater: 0 })
    expect(r.checked).toBe(true)
    expect(r.next).toEqual({ kind: 'stay', targetIdx: null })
  })

  it('final loaded set opens the weight prompt, commit finishes the workout', () => {
    const S = solo()
    toggleActiveSet(S, 0, 0, { highWater: 0 })
    const r = toggleActiveSet(S, 0, 1, { highWater: 1 })
    expect(r.askTop).toBe(true)
    expect(r.next).toEqual({ kind: 'open-topweight', targetIdx: null })
    const next = commitWorkingWeight(S, 0, 82.5, { todayISO: () => '2026-08-24' })
    expect(next).toEqual({ kind: 'topweight-then-finish', targetIdx: null, unitDone: true, isLastUnit: true, unitSize: 1 })
    expect(S.active.entries[0].topW).toBe(82.5)
    expect(S.exWeights.ex1).toEqual({ w: 82.5, d: '2026-08-24' })
  })

  it('finishing the first of two entries advances after commit', () => {
    const S = {
      active: {
        cur: 0,
        entries: [
          { id: 'ex1', target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: false }] },
          { id: 'ex2', target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
        ],
      },
      exWeights: {},
    }
    const r = toggleActiveSet(S, 0, 0, { highWater: 0 })
    expect(r.next).toEqual({ kind: 'open-topweight', targetIdx: null })
    const peek = peekWeightCommit(S, 0)
    expect(peek).toEqual({ kind: 'topweight-then-advance', targetIdx: 1, unitDone: true, isLastUnit: false, unitSize: 1 })
    const next = commitWorkingWeight(S, 0, 80, { todayISO: () => '2026-08-24' })
    expect(next.targetIdx).toBe(1)
    expect(next.kind).toBe('topweight-then-advance')
  })

  it('cardio finale opens the finish prompt with no weight step', () => {
    const S = {
      active: {
        cur: 0,
        entries: [{
          id: 'ex-cardio',
          target: { mode: 'cardio', min: 20, speed: 8 },
          sets: [{ min: 20, speed: 8, done: false }],
        }],
      },
      exWeights: {},
    }
    const r = toggleActiveSet(S, 0, 0, { highWater: 0 })
    expect(r.askTop).toBe(false)
    expect(r.next).toEqual({ kind: 'open-finish', targetIdx: null })
  })

  it('an unticked warm-up never blocks the finish chain', () => {
    const S = {
      active: {
        cur: 0,
        entries: [{
          id: 'ex1',
          target: { reps: 5, weight: 80 },
          sets: [
            { w: 40, r: 5, done: false, phase: 'warmup', warmup: true },
            { w: 80, r: 5, done: false },
          ],
        }],
      },
      exWeights: {},
    }
    const r = toggleActiveSet(S, 0, 1, { highWater: 0 })
    expect(r.unitDone).toBe(true)
    expect(r.next).toEqual({ kind: 'open-topweight', targetIdx: null })
    const next = commitWorkingWeight(S, 0, 80, { todayISO: () => '2026-08-24' })
    expect(next.kind).toBe('topweight-then-finish')
  })

  it('unchecking reports stay and reopens nothing', () => {
    const S = solo()
    S.active.entries[0].sets[0].done = true
    const r = toggleActiveSet(S, 0, 0, { highWater: 1 })
    expect(r.checked).toBe(false)
    expect(r.next).toEqual({ kind: 'stay', targetIdx: null })
  })

  it('invalid commit weight returns null and stores nothing', () => {
    const S = solo()
    const next = commitWorkingWeight(S, 0, -5)
    expect(next).toBe(null)
    expect(S.active.entries[0].topW).toBeUndefined()
    expect(commitWorkingWeight(S, 9, 80)).toBe(null)
  })

  it('peeking a gone entry returns null instead of a lying advance', () => {
    const S = solo()
    expect(peekWeightCommit(S, 9)).toBe(null)
    expect(peekWeightCommit({ active: null }, 0)).toBe(null)
  })
})
