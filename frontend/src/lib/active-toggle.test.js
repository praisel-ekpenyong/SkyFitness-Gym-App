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
    expect(r.rest).toEqual({ start: true, stop: true })
    const peek = peekWeightCommit(S, 0)
    expect(peek).toEqual({ kind: 'topweight-then-advance', targetIdx: 1, unitDone: true, isLastUnit: false, unitSize: 1 })
    const next = commitWorkingWeight(S, 0, 80, { todayISO: () => '2026-08-24' })
    expect(next.targetIdx).toBe(1)
    expect(next.kind).toBe('topweight-then-advance')
  })

  it('performing the final set of a solo exercise starts rest when another exercise follows', () => {
    const S = {
      active: {
        cur: 0,
        entries: [
          { id: 'ex1', target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: true }, { w: 80, r: 5, done: false }] },
          { id: 'ex2', target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
        ],
      },
      exWeights: {},
    }
    const r = toggleActiveSet(S, 0, 1)
    expect(r.next).toEqual({ kind: 'open-topweight', targetIdx: null })
    expect(r.rest).toEqual({ start: true, stop: true })

    // Unchecking and re-checking does not restart or stop rest (high-water mark respected)
    const un = toggleActiveSet(S, 0, 1)
    expect(un.checked).toBe(false)
    expect(un.rest).toEqual({ start: false, stop: false })

    const re = toggleActiveSet(S, 0, 1)
    expect(re.checked).toBe(true)
    expect(re.rest).toEqual({ start: false, stop: false })
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

  it('unprompted exercises (cardio, timed, bodyweight without load) start rest and stay when another exercise follows', () => {
    // 1. Cardio followed by another exercise
    const S1 = {
      active: {
        cur: 0,
        entries: [
          { id: 'ex-cardio', target: { mode: 'cardio', min: 20, speed: 8 }, sets: [{ min: 20, speed: 8, done: false }] },
          { id: 'ex2', target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
        ],
      },
      exWeights: {},
    }
    const r1 = toggleActiveSet(S1, 0, 0)
    expect(r1.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r1.notice).toBe('cardio')
    expect(r1.rest).toEqual({ start: true, stop: true })

    // 2. Timed hold followed by another exercise
    const S2 = {
      active: {
        cur: 0,
        entries: [
          { id: 'ex-timed', target: { mode: 'time', sec: 45 }, sets: [{ sec: 45, done: false }] },
          { id: 'ex2', target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
        ],
      },
      exWeights: {},
    }
    const r2 = toggleActiveSet(S2, 0, 0)
    expect(r2.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r2.notice).toBe('timed')
    expect(r2.rest).toEqual({ start: true, stop: true })

    // 3. Bodyweight without load followed by another exercise
    const S3 = {
      active: {
        cur: 0,
        entries: [
          { id: 'ex-bw', target: { mode: 'reps', reps: 10, bodyweight: true }, sets: [{ w: 0, r: 10, done: false }] },
          { id: 'ex2', target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
        ],
      },
      exWeights: {},
    }
    const r3 = toggleActiveSet(S3, 0, 0)
    expect(r3.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r3.notice).toBe(null)
    expect(r3.rest).toEqual({ start: true, stop: true })

    // 4. Exercise whose weight was already confirmed (asked: true) followed by another exercise
    const S4 = {
      active: {
        cur: 0,
        entries: [
          { id: 'ex-asked', asked: true, target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: false }] },
          { id: 'ex2', target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
        ],
      },
      exWeights: {},
    }
    const r4 = toggleActiveSet(S4, 0, 0)
    expect(r4.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r4.notice).toBe(null)
    expect(r4.rest).toEqual({ start: true, stop: true })
  })

  it('superset unit completion starts inter-exercise rest and stays on completed unit when another exercise follows', () => {
    const S = {
      active: {
        cur: 1,
        entries: [
          { id: 'ex1', sg: 'sg-0-1', target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: true }] },
          { id: 'ex2', sg: 'sg-0-1', asked: true, target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
          { id: 'ex3', target: { reps: 5, weight: 70 }, sets: [{ w: 70, r: 5, done: false }] },
        ],
      },
      exWeights: {},
    }
    const r = toggleActiveSet(S, 1, 0)
    expect(r.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r.cur).toBe(1)
    expect(r.rest).toEqual({ start: true, stop: true })
  })

  it('session finale suppresses rest and stops running rest on the final unit for unprompted and superset exercises', () => {
    // Single unprompted cardio finale
    const S1 = {
      active: {
        cur: 0,
        entries: [{ id: 'ex-cardio', target: { mode: 'cardio', min: 20, speed: 8 }, sets: [{ min: 20, speed: 8, done: false }] }],
      },
      exWeights: {},
    }
    const r1 = toggleActiveSet(S1, 0, 0)
    expect(r1.next).toEqual({ kind: 'open-finish', targetIdx: null })
    expect(r1.rest).toEqual({ start: false, stop: true })

    // Superset as the final unit in the session
    const S2 = {
      active: {
        cur: 1,
        entries: [
          { id: 'ex1', sg: 'sg-0-1', target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: true }] },
          { id: 'ex2', sg: 'sg-0-1', asked: true, target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
        ],
      },
      exWeights: {},
    }
    const r2 = toggleActiveSet(S2, 1, 0)
    expect(r2.next).toEqual({ kind: 'open-finish', targetIdx: null })
    expect(r2.cur).toBe(1)
    expect(r2.rest).toEqual({ start: false, stop: true })
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
