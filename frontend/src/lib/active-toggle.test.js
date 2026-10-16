import { describe, it, expect } from 'vitest'
// Imports cross the facade seam, not the module file directly: this pins the
// interface the store and sheets actually consume.
import { toggleActiveSet, peekWeightCommit, commitWorkingWeight } from './active-workout.js'

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
    const r = toggleActiveSet(S, 0, 0)
    expect(r.checked).toBe(true)
    expect(r.mode).toBe('reps')
    expect(r.cur).toBe(0)
    expect(r.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r.rest).toEqual({ start: true, stop: false })
    expect(r.notice).toBe(null)
    expect(S.active.entries[0].hw).toBe(1)
  })

  it('final loaded set opens the weight prompt, commit finishes the workout', () => {
    const S = solo()
    toggleActiveSet(S, 0, 0)
    const r = toggleActiveSet(S, 0, 1)
    expect(r.next).toEqual({ kind: 'open-topweight', targetIdx: null })
    expect(r.rest).toEqual({ start: false, stop: true })
    expect(r.notice).toBe(null)
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
    const r = toggleActiveSet(S, 0, 0)
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
    const r = toggleActiveSet(S, 0, 0)
    expect(r.next).toEqual({ kind: 'open-finish', targetIdx: null })
    expect(r.notice).toBe('cardio')
    expect(r.rest).toEqual({ start: false, stop: true })
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
    const r = toggleActiveSet(S, 0, 1)
    expect(r.next).toEqual({ kind: 'open-topweight', targetIdx: null })
    expect(r.notice).toBe(null)
    const next = commitWorkingWeight(S, 0, 80, { todayISO: () => '2026-08-24' })
    expect(next.kind).toBe('topweight-then-finish')
  })

  it('unchecking reports stay and reopens nothing', () => {
    const S = solo()
    S.active.entries[0].sets[0].done = true
    const r = toggleActiveSet(S, 0, 0)
    expect(r.checked).toBe(false)
    expect(r.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r.rest).toEqual({ start: false, stop: false })
    expect(r.notice).toBe(null)
  })

  it('mid-superset progress navigates to the partner with advance-to', () => {
    const S = {
      active: {
        cur: 0,
        entries: [
          { id: 'ex1', sg: 'sg-0-1', target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: false }, { w: 80, r: 5, done: false }] },
          { id: 'ex2', sg: 'sg-0-1', target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
        ],
      },
      exWeights: {},
    }
    const r = toggleActiveSet(S, 0, 0)
    expect(r.next).toEqual({ kind: 'advance-to', targetIdx: 1 })
    expect(r.rest).toEqual({ start: false, stop: false })
    expect(S.active.cur).toBe(1)
  })

  it('progress survives as Entry state, not caller state', () => {
    const S = solo()
    toggleActiveSet(S, 0, 0)
    expect(S.active.entries[0].hw).toBe(1)
    const r2 = toggleActiveSet(S, 0, 1)
    expect(r2.next).toEqual({ kind: 'open-topweight', targetIdx: null })
    expect(S.active.entries[0].hw).toBe(2)
  })

  it('a resumed pre-hw Entry: uncheck then re-check never reads as new progress', () => {
    // Sessions saved before hw existed replay here: the first interaction can
    // be an uncheck, and the later re-check must not restart or cut rest.
    const S = solo()
    S.active.entries[0].sets[0].done = true
    S.active.entries[0].sets[1].done = true
    const un = toggleActiveSet(S, 0, 0)
    expect(un.rest).toEqual({ start: false, stop: false })
    expect(S.active.entries[0].hw).toBe(2)
    const re = toggleActiveSet(S, 0, 0)
    expect(re.checked).toBe(true)
    expect(re.rest).toEqual({ start: false, stop: false })
    expect(S.active.entries[0].hw).toBe(2)
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
