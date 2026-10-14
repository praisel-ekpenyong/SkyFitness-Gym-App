import { describe, it, expect } from 'vitest'
import {
  readSession, sessionsFor, stallCount, nextPrescription, MIN_TIME_SEC
} from './progression.js'
import { workoutVolume } from './workout-model.js'
import { fatigueOf } from './recovery.js'
import { EXDB } from './exercises.js'

// Prescription-plus-Stall seam: log work, finish the Workout, assert the next
// Prescription and its visible outcome. Vocabulary: Hit, Miss, Stall, Deload,
// Prescription, Warm-up set, Work set.
const LIFT = EXDB.find(e => e.bp !== 'cardio' && !['upper legs', 'lower legs', 'back', 'hips', 'glutes'].includes(e.bp)).id

const work = (w, r) => ({ w, r, done: true })
const unticked = (w, r) => ({ w, r: 0, done: false })
const warmupUnticked = (w, r) => ({ w, r: 0, done: false, warmup: true })

// A finished Workout: the Entry is judged exactly as the log left it.
const finishedWorkout = (day, target, rows) => ({
  d: day,
  entries: [{ id: LIFT, target, sets: rows }]
})
const stateWith = workouts => ({ unit: 'kg', workouts })

const LINEAR = { id: LIFT, sets: 3, reps: 5, weight: 60, prog: 'linear' }
const TARGET_3X5 = { sets: 3, reps: 5, weight: 60 }

describe('a finished Entry with zero performed Work sets is a Miss', () => {
  const fallenApart = stateWith([
    finishedWorkout('2026-04-01', TARGET_3X5, [
      warmupUnticked(20, 8),
      unticked(60, 5), unticked(60, 5), unticked(60, 5)
    ])
  ])

  it('judges the untouched Entry as a Miss and grows the Stall by one', () => {
    const sessions = sessionsFor(fallenApart, LIFT, LINEAR)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].ok).toBe(false)
    expect(stallCount(sessions)).toBe(1)
  })

  it('holds the Prescription at the same weight with a visible Miss outcome', () => {
    const p = nextPrescription(fallenApart, LINEAR)
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(60)
    expect(p.why[0]).toMatch(/Missed reps last time|same weight/)
  })

  it('earns a Deload Prescription after three fallen-apart Workouts in a row', () => {
    const S = stateWith([1, 2, 3].map(i => finishedWorkout(
      '2026-04-0' + i, TARGET_3X5,
      [unticked(60, 5), unticked(60, 5), unticked(60, 5)]
    )))
    expect(stallCount(sessionsFor(S, LIFT, LINEAR))).toBe(3)
    const p = nextPrescription(S, LINEAR)
    expect(p.kind).toBe('deload')
    expect(p.weight).toBe(55)
    expect(p.why[0]).toMatch(/reset/i)
  })
})

describe('unticked Warm-up sets never count as a Miss', () => {
  it('an Entry of Warm-up sets only is not a session at all', () => {
    const S = stateWith([
      finishedWorkout('2026-04-01', TARGET_3X5, [warmupUnticked(20, 8), warmupUnticked(25, 6)])
    ])
    expect(sessionsFor(S, LIFT, LINEAR)).toHaveLength(0)
    expect(nextPrescription(S, LINEAR).kind).toBe('first')
  })

  it('an unticked Warm-up set beside clean Work sets leaves the Hit intact', () => {
    const s = readSession({
      id: LIFT, target: TARGET_3X5,
      sets: [warmupUnticked(20, 8), work(60, 5), work(60, 5), work(60, 5)]
    })
    expect(s.ok).toBe(true)
  })
})

describe('bonus Work sets never flip a Hit to a Miss', () => {
  const cleanPlusBonus = stateWith([
    finishedWorkout('2026-04-01', TARGET_3X5, [work(60, 5), work(60, 5), work(60, 5), work(50, 4)])
  ])

  it('judges only the first N planned Work sets, so the Hit stands', () => {
    expect(readSession(cleanPlusBonus.workouts[0].entries[0]).ok).toBe(true)
  })

  it('advances the Prescription from the planned work with a visible Hit outcome', () => {
    const p = nextPrescription(cleanPlusBonus, LINEAR)
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(62.5)
    expect(p.why[0]).toMatch(/Every rep/)
  })

  it('still counts the bonus Work set toward volume and fatigue', () => {
    const w = cleanPlusBonus.workouts[0]
    expect(workoutVolume(w)).toBe(3 * 60 * 5 + 50 * 4)
    const plain = stateWith([
      finishedWorkout('2026-04-01', TARGET_3X5, [work(60, 5), work(60, 5), work(60, 5)])
    ])
    const now = Date.parse('2026-04-01T12:00:00Z')
    const peak = f => Math.max(...Object.values(f))
    expect(peak(fatigueOf(cleanPlusBonus.workouts, now)))
      .toBeGreaterThan(peak(fatigueOf(plain.workouts, now)))
  })
})

describe('added-set growth resumes from the current Routine target', () => {
  it('cutting sets in the Routine lowers the resume point below the history high', () => {
    const S = stateWith([
      finishedWorkout('2026-04-01', { sets: 4, reps: 15 }, [work(0, 15), work(0, 15), work(0, 15), work(0, 15)])
    ])
    const cutPlan = { id: LIFT, sets: 2, reps: 10, repsMax: 15, weight: 0, prog: 'linear' }
    const p = nextPrescription(S, cutPlan)
    expect(p.kind).toBe('up')
    expect(p.sets).toBe(3)
    expect(p.reps).toBe(10)
    expect(p.weight).toBe(0)
  })
})

describe('a Deload that cannot reduce reads as a hold', () => {
  it('already-minimum iron holds instead of a same-weight Deload', () => {
    const tiny = { sets: 3, reps: 5, weight: 2.5 }
    const S = stateWith([1, 2, 3].map(i => finishedWorkout(
      '2026-04-0' + i, tiny, [work(2.5, 1), work(2.5, 1), work(2.5, 1)]
    )))
    const p = nextPrescription(S, { id: LIFT, sets: 3, reps: 5, weight: 2.5, prog: 'linear' })
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(2.5)
    expect(p.why[0]).toMatch(/same weight/)
  })

  it('already-minimum time holds instead of a same-seconds Deload', () => {
    const target = { sets: 2, sec: MIN_TIME_SEC, mode: 'time' }
    const short = [{ sec: 2, w: 0, done: true }, { sec: 2, w: 0, done: true }]
    const S = stateWith([1, 2, 3].map(i => ({ d: '2026-04-0' + i, entries: [{ id: LIFT, target, sets: short }] })))
    const p = nextPrescription(S, { id: LIFT, mode: 'time', sets: 2, sec: MIN_TIME_SEC, prog: 'time' })
    expect(p.kind).toBe('hold')
    expect(p.sec).toBe(MIN_TIME_SEC)
  })
})

describe('hand-edited zero goals clamp to safe minimums', () => {
  it('a zeroed time target never yields an empty Prescription', () => {
    const target = { sets: 2, sec: 0, mode: 'time' }
    const held = [{ sec: 30, w: 0, done: true }, { sec: 30, w: 0, done: true }]
    const S = stateWith([{ d: '2026-04-01', entries: [{ id: LIFT, target, sets: held }] }])
    const p = nextPrescription(S, { id: LIFT, mode: 'time', sets: 2, sec: 0, prog: 'time' })
    expect(p.kind).toBe('hold')
    expect(p.sec).toBeGreaterThanOrEqual(MIN_TIME_SEC)
  })

  it('zeroed double-progression targets never yield an empty Prescription', () => {
    const S = stateWith([
      finishedWorkout('2026-04-01', { sets: 3, reps: 8 }, [work(40, 6), work(40, 6), work(40, 6)])
    ])
    const p = nextPrescription(S, { id: LIFT, sets: 3, reps: 0, repsMin: 0, weight: 40, prog: 'double' })
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(40)
    expect(p.reps).toBeGreaterThanOrEqual(1)
  })

  it('a zeroed bodyweight target holds at least a single rep', () => {
    const S = stateWith([
      finishedWorkout('2026-04-01', { sets: 3, reps: 0 }, [work(0, 5), work(0, 5), work(0, 4)])
    ])
    const p = nextPrescription(S, { id: LIFT, sets: 3, reps: 0, weight: 0, prog: 'linear' })
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(0)
    expect(p.reps).toBeGreaterThanOrEqual(1)
  })
})
