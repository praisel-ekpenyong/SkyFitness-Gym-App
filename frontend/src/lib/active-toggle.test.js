import { describe, it, expect } from 'vitest'
import { toggleActiveSet, nextUnitTarget } from './active-workout.js'

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

  it('final loaded set of the last Entry opens the finish prompt and asks for no weight', () => {
    const S = solo()
    toggleActiveSet(S, 0, 0)
    const r = toggleActiveSet(S, 0, 1)
    expect(r.next).toEqual({ kind: 'open-finish', targetIdx: null })
    expect(r.rest).toEqual({ start: false, stop: true })
    expect(r.notice).toBe(null)
    expect(S.active.entries[0].topW).toBeUndefined()
    expect(S.exWeights).toEqual({})
  })

  it('finishing the first of two loaded entries stays and opens nothing', () => {
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
    expect(r.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r.rest).toEqual({ start: true, stop: true })
    expect(S.active.cur).toBe(0)
    expect(S.active.entries[0].topW).toBeUndefined()
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
    expect(r.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r.rest).toEqual({ start: true, stop: true })

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

    const S4 = {
      active: {
        cur: 0,
        entries: [
          { id: 'ex-loaded', target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: false }] },
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
          { id: 'ex2', sg: 'sg-0-1', target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
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

    const S2 = {
      active: {
        cur: 1,
        entries: [
          { id: 'ex1', sg: 'sg-0-1', target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: true }] },
          { id: 'ex2', sg: 'sg-0-1', target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
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
    expect(r.next).toEqual({ kind: 'open-finish', targetIdx: null })
    expect(r.notice).toBe(null)
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
    expect(r2.next).toEqual({ kind: 'open-finish', targetIdx: null })
    expect(S.active.entries[0].hw).toBe(2)
  })

  it('a resumed pre-hw Entry: uncheck then re-check never reads as new progress', () => {
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
})

const twoLoaded = () => ({
  active: {
    cur: 0,
    entries: [
      { id: 'ex1', target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: false }, { w: 80, r: 5, done: false }] },
      { id: 'ex2', target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
    ],
  },
  exWeights: {},
})

describe('next unit target (the Next key)', () => {
  it('is null while a Work set of the open Entry is left', () => {
    const S = twoLoaded()
    toggleActiveSet(S, 0, 0)
    expect(nextUnitTarget(S, 0)).toBe(null)
  })

  it('names the next Entry once every Work set is performed, and goes away on an uncheck', () => {
    const S = twoLoaded()
    toggleActiveSet(S, 0, 0)
    toggleActiveSet(S, 0, 1)
    expect(nextUnitTarget(S, 0)).toBe(1)
    toggleActiveSet(S, 0, 1)
    expect(nextUnitTarget(S, 0)).toBe(null)
  })

  it('is null on the last Entry, where the finish prompt opens instead', () => {
    const S = twoLoaded()
    S.active.cur = 1
    toggleActiveSet(S, 1, 0)
    expect(nextUnitTarget(S, 1)).toBe(null)
  })

  it('reads the same for bodyweight, timed and cardio Entries', () => {
    for (const first of [
      { id: 'ex-bw', target: { mode: 'reps', reps: 10, bodyweight: true }, sets: [{ w: 0, r: 10, done: false }] },
      { id: 'ex-timed', target: { mode: 'time', sec: 45 }, sets: [{ sec: 45, done: false }] },
      { id: 'ex-cardio', target: { mode: 'cardio', min: 20, speed: 8 }, sets: [{ min: 20, speed: 8, done: false }] },
    ]) {
      const S = { active: { cur: 0, entries: [first, { id: 'ex2', target: { reps: 5 }, sets: [{ w: 60, r: 5, done: false }] }] }, exWeights: {} }
      toggleActiveSet(S, 0, 0)
      expect(nextUnitTarget(S, 0)).toBe(1)
    }
  })

  it('an unticked warm-up does not hold it back', () => {
    const S = twoLoaded()
    S.active.entries[0].sets.unshift({ w: 40, r: 5, done: false, phase: 'warmup', warmup: true })
    toggleActiveSet(S, 0, 1)
    toggleActiveSet(S, 0, 2)
    expect(nextUnitTarget(S, 0)).toBe(1)
  })

  it('a superset shows it once, after its last Work set, naming the first Entry of the next unit', () => {
    const S = {
      active: {
        cur: 0,
        entries: [
          { id: 'ex1', sg: 'sg-0-1', target: { reps: 5, weight: 80 }, sets: [{ w: 80, r: 5, done: false }] },
          { id: 'ex2', sg: 'sg-0-1', target: { reps: 5, weight: 60 }, sets: [{ w: 60, r: 5, done: false }] },
          { id: 'ex3', sg: 'sg-2-3', target: { reps: 5, weight: 70 }, sets: [{ w: 70, r: 5, done: false }] },
          { id: 'ex4', sg: 'sg-2-3', target: { reps: 5, weight: 70 }, sets: [{ w: 70, r: 5, done: false }] },
        ],
      },
      exWeights: {},
    }
    toggleActiveSet(S, 0, 0)
    expect(nextUnitTarget(S, 0)).toBe(null)
    expect(nextUnitTarget(S, 1)).toBe(null)
    toggleActiveSet(S, 1, 0)
    expect(nextUnitTarget(S, 0)).toBe(2)
    expect(nextUnitTarget(S, 1)).toBe(2)
  })

  it('is null for an Entry with no Work sets, or when the Entry is gone', () => {
    const S = twoLoaded()
    S.active.entries[0].sets = []
    expect(nextUnitTarget(S, 0)).toBe(null)
    expect(nextUnitTarget(S, 9)).toBe(null)
    expect(nextUnitTarget({ active: null }, 0)).toBe(null)
  })
})
