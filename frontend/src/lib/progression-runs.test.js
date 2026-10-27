import { describe, it, expect } from 'vitest'
import {
  readSession, sessionsFor, stallCount, nextPrescription, DELOAD_AFTER, MIN_TIME_SEC
} from './progression.js'
import {
  createActiveSession, buildCompletedWorkout, addActiveExercise
} from './active-workout.js'
import { EXDB } from './exercises.js'

// Regressions for double progression's deload cascade, wide ranges, stream
// contamination, off-grid increments, and add-time's stale baseline. The seam is
// the same one the app uses: log finished Workouts, ask for the next Prescription,
// and (where it matters) run the Active workout through the finish boundary.

const LIFT = EXDB.find(e => e.bp !== 'cardio' && !['upper legs', 'lower legs', 'back', 'hips', 'glutes'].includes(e.bp)).id
const DOUBLE = { id: LIFT, sets: 3, reps: 12, repsMin: 10, weight: 40, prog: 'double' }
const REP_TARGET = { sets: 3, reps: 12, weight: 40 }
const TIME_TARGET = { sets: 2, sec: 45, mode: 'time' }

const work = (w, r) => ({ w, r, done: true })
const held = (sec, done = true) => ({ sec, w: 0, done })
const rowsOf = (w, r) => [work(w, r), work(w, r), work(w, r)]

const session = ({ d = '2026-01-01', target = REP_TARGET, rows, plan, routineId = null } = {}) => ({
  d,
  routineId,
  entries: [{ id: LIFT, target, plan, sets: rows }]
})
const state = (workouts, extra = {}) => ({ unit: 'kg', workouts, ...extra })
const repeat = (n, make) => Array.from({ length: n }, (_, i) => make(i))
const day = i => `2026-01-${String(i + 1).padStart(2, '0')}`

describe('progression streams', () => {
  it('does not let a different Target top feed a double-progression stream', () => {
    const S = state([
      session({ target: { sets: 3, reps: 5, weight: 60 }, rows: rowsOf(60, 5) })
    ])
    const p = nextPrescription(S, { ...DOUBLE, weight: 60 })
    expect(p.kind).toBe('first')
  })

  it('does not let another Routine\'s heavy history seed a new light stream', () => {
    const light = { id: 'light', name: 'Light', ex: [{ ...DOUBLE, weight: 40 }] }
    const heavy = { id: 'heavy', name: 'Heavy', ex: [] }
    const S = state([
      { d: '2026-01-01', routineId: 'heavy', entries: [{
        id: LIFT,
        target: { sets: 3, reps: 5, weight: 100 },
        sets: rowsOf(100, 5),
      }] },
    ], {
      routines: [light, heavy],
      exWeights: { [LIFT]: { w: 100, d: '2026-01-01' } },
    })

    const A = createActiveSession(S, 'light', null, {
      todayISO: () => '2026-01-02', uid: () => 'a1', now: () => 0,
    })
    expect(A.entries[0].plan.kind).toBe('first')
    expect(A.entries[0].sets.map(s => s.w)).toEqual([40, 40, 40])
    expect(A.entries[0].sets.map(s => s.r)).toEqual([12, 12, 12])
  })

  it('seeds a new Target shape from the same Routine\'s last working weight, at the plan top', () => {
    const routine = { id: 'r1', name: 'Push', ex: [{ ...DOUBLE, weight: 40 }] }
    const S = state([
      { d: '2026-01-01', routineId: 'r1', entries: [{
        id: LIFT,
        target: { sets: 3, reps: 10, weight: 45 },
        sets: rowsOf(45, 10),
      }] },
    ], { routines: [routine] })

    const A = createActiveSession(S, 'r1', null, {
      todayISO: () => '2026-01-02', uid: () => 'a1', now: () => 0,
    })
    expect(A.entries[0].plan.kind).toBe('first')
    expect(A.entries[0].sets.map(s => s.w)).toEqual([45, 45, 45])
    expect(A.entries[0].sets.map(s => s.r)).toEqual([12, 12, 12])
  })

  it('does not start a new stream when only the rep-range bottom changes', () => {
    const S = state([
      session({
        target: { sets: 3, reps: 12, repsMin: 8, weight: 40 },
        rows: rowsOf(40, 10),
      })
    ])
    const p = nextPrescription(S, { ...DOUBLE, repsMin: 6 })
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(40)
    expect(p.reps).toBe(11)
  })

  it('a policy change on the same Target shape still reads the stream', () => {
    const S = state([session({ rows: rowsOf(40, 12) })])
    const p = nextPrescription(S, { id: LIFT, sets: 3, reps: 12, weight: 40, prog: 'linear' })
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(42.5)
  })
})

describe('double progression runs', () => {
  it('deloads only after four no-progress sessions following the baseline', () => {
    expect(DELOAD_AFTER.double).toBe(4)
    const four = state(repeat(4, i => session({ d: day(i), rows: rowsOf(40, 9) })))
    expect(nextPrescription(four, DOUBLE).kind).toBe('hold')

    const five = state(repeat(5, i => session({ d: day(i), rows: rowsOf(40, 9) })))
    const p = nextPrescription(five, DOUBLE)
    expect(p.kind).toBe('deload')
    expect(p.weight).toBe(35)
    expect(p.reps).toBe(10)
  })

  it('following a deload builds up instead of cascading', () => {
    const workouts = repeat(5, i => session({ d: day(i), rows: rowsOf(40, 9) }))
    const S = state(workouts)

    const deload = nextPrescription(S, DOUBLE)
    expect(deload).toMatchObject({ kind: 'deload', weight: 35, reps: 10 })

    S.workouts.push(session({ d: '2026-01-06', rows: rowsOf(35, 10), plan: deload }))
    const next = nextPrescription(S, DOUBLE)
    expect(next.kind).toBe('hold')
    expect(next.weight).toBe(35)
    expect(next.reps).toBe(11)

    S.workouts.push(session({ d: '2026-01-07', rows: rowsOf(35, 11), plan: next }))
    const next2 = nextPrescription(S, DOUBLE)
    expect(next2.kind).toBe('hold')
    expect(next2.weight).toBe(35)
    expect(next2.reps).toBe(12)

    S.workouts.push(session({ d: '2026-01-08', rows: rowsOf(35, 12), plan: next2 }))
    const next3 = nextPrescription(S, DOUBLE)
    expect(next3.kind).toBe('up')
    expect(next3.weight).toBe(37.5)
    expect(next3.reps).toBe(10)
  })

  it('climbs a wide range without deloading before the top', () => {
    const wide = { ...DOUBLE, reps: 14 }
    const target = { sets: 3, reps: 14, weight: 40 }
    const S = state([10, 11, 12, 13].map((r, i) => session({
      d: day(i), target, rows: rowsOf(40, r),
    })))
    const p = nextPrescription(S, wide)
    expect(p.kind).toBe('hold')
    expect(p.reps).toBe(14)

    S.workouts.push(session({ d: '2026-01-05', target, rows: rowsOf(40, 14) }))
    const top = nextPrescription(S, wide)
    expect(top.kind).toBe('up')
    expect(top.weight).toBe(42.5)
    expect(top.reps).toBe(10)
  })

  it('holds at the lightest load with an honest message instead of a fake deload', () => {
    const S = state(repeat(5, i => session({
      d: day(i),
      target: { sets: 3, reps: 5, weight: 2.5 },
      rows: rowsOf(2.5, 1),
    })))
    const p = nextPrescription(S, { ...DOUBLE, reps: 5, repsMin: 3, weight: 2.5 })
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(2.5)
    expect(p.reps).toBe(3)
    expect(p.why[0]).toMatch(/lightest load/i)
  })

  it('keeps readSession.ok as "reached the Target top"', () => {
    const s = readSession(session({ rows: rowsOf(40, 11) }).entries[0])
    expect(s.ok).toBe(false)
    expect(s.low).toBe(11)
    expect(stallCount([s])).toBe(1)
  })

  it('holds at the prescribed deload weight when the deload session was not performed', () => {
    const S = state(repeat(5, i => session({ d: day(i), rows: rowsOf(40, 9) })))
    const deload = nextPrescription(S, DOUBLE)
    expect(deload).toMatchObject({ kind: 'deload', weight: 35, reps: 10 })

    // The lifter opens the deload session, warms up, and skips every work set. The Entry
    // still persists because a warm-up was performed.
    S.workouts.push(session({
      d: '2026-01-06',
      rows: [
        { w: 20, r: 5, done: true, warmup: true },
        { w: 35, r: 10, done: false },
        { w: 35, r: 10, done: false },
        { w: 35, r: 10, done: false },
      ],
      plan: deload,
    }))

    const p = nextPrescription(S, DOUBLE)
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(35)
    expect(p.reps).toBe(10)
  })
})

describe('linear deload runs', () => {
  const LINEAR = { id: LIFT, sets: 3, reps: 5, weight: 60, prog: 'linear' }
  const target = { sets: 3, reps: 5, weight: 60 }
  const miss = (w, d, plan) => session({ d, target, rows: rowsOf(w, 3), plan })

  it('a Miss on the first session after a Deload does not cascade', () => {
    const S = state(repeat(3, i => miss(60, day(i), { kind: 'hold', weight: 60 })))
    const deload = nextPrescription(S, LINEAR)
    expect(deload).toMatchObject({ kind: 'deload', weight: 55 })

    S.workouts.push(miss(55, '2026-01-04', deload))
    const p = nextPrescription(S, LINEAR)
    expect(p.kind).toBe('hold')
    expect(p.weight).toBe(55)
  })

  it('still deloads after three further Misses at the reduced load', () => {
    const S = state(repeat(3, i => miss(60, day(i), { kind: 'hold', weight: 60 })))
    const deload = nextPrescription(S, LINEAR)
    S.workouts.push(miss(55, '2026-01-04', deload))

    S.workouts.push(miss(55, '2026-01-05', { kind: 'hold', weight: 55 }))
    S.workouts.push(miss(55, '2026-01-06', { kind: 'hold', weight: 55 }))
    expect(nextPrescription(S, LINEAR).kind).toBe('hold')

    S.workouts.push(miss(55, '2026-01-07', { kind: 'hold', weight: 55 }))
    const p = nextPrescription(S, LINEAR)
    expect(p.kind).toBe('deload')
    expect(p.weight).toBe(50)
  })
})

describe('bodyweight progression runs', () => {
  const BW = { id: LIFT, sets: 3, reps: 10, repsMax: 15, weight: 0, bodyweight: true, prog: 'linear' }
  const routine = { id: 'bw', name: 'Bodyweight', ex: [BW] }

  it('climbs reps from the prescribed goal, not the frozen Target', () => {
    let S = state([], { routines: [routine] })
    const plans = []
    for (let i = 0; i < 6; i++) {
      const A = createActiveSession(S, 'bw', null, {
        todayISO: () => day(i), uid: () => `bw${i}`, now: () => i,
      })
      const e = A.entries[0]
      plans.push(e.plan.reps)
      // Follow the Prescription exactly.
      e.sets.forEach(s => { s.done = true })
      S = { ...S, workouts: [...S.workouts, buildCompletedWorkout(A, { end: 1, unit: 'kg' })] }
    }
    expect(plans).toEqual([undefined, 11, 12, 13, 14, 15])
  })

  it('adds a set at the ceiling and keeps that set on the next climb', () => {
    let S = state([], { routines: [routine] })
    const run = i => {
      const A = createActiveSession(S, 'bw', null, {
        todayISO: () => day(i), uid: () => `bw${i}`, now: () => i,
      })
      const e = A.entries[0]
      e.sets.forEach(s => { s.done = true })
      S = { ...S, workouts: [...S.workouts, buildCompletedWorkout(A, { end: 1, unit: 'kg' })] }
      return e
    }
    // 10 → 11 → 12 → 13 → 14 → 15
    for (let i = 0; i < 6; i++) run(i)

    const added = run(6)
    expect(added.plan).toMatchObject({ kind: 'up', reps: 10, sets: 4 })
    expect(added.sets).toHaveLength(4)

    // The added set is part of the new working volume, not a one-session bonus.
    const climbed = run(7)
    expect(climbed.plan).toMatchObject({ kind: 'up', reps: 11, sets: 4 })
    expect(climbed.sets).toHaveLength(4)
    expect(climbed.sets.every(s => s.r === 11)).toBe(true)
  })

  it('holds at the prescribed goal when only the Target bottom was hit', () => {
    const target = { sets: 3, reps: 10, weight: 0, bodyweight: true }
    const S = state([session({
      target,
      plan: { kind: 'up', weight: 0, reps: 15 },
      rows: rowsOf(0, 10),
    })])
    const p = nextPrescription(S, BW)
    expect(p.kind).toBe('hold')
    expect(p.reps).toBe(15)
  })

  it('judges the added set as part of the session', () => {
    const target = { sets: 3, reps: 10, weight: 0, bodyweight: true }
    const S = state([session({
      target,
      plan: { kind: 'up', weight: 0, reps: 10, sets: 4 },
      rows: rowsOf(0, 10),
    })])
    // Only three of the four prescribed sets were performed.
    const p = nextPrescription(S, BW)
    expect(p.kind).toBe('hold')
    expect(p.reps).toBe(10)
    expect(p.sets).toBe(4)
  })
})

describe('exact increments', () => {
  it('announces and delivers the same off-grid increment', () => {
    const cfg = { ...DOUBLE, weight: 41, inc: 2.5 }
    const p = nextPrescription(state([session({
      target: { sets: 3, reps: 12, weight: 41 },
      rows: rowsOf(41, 12),
    })]), cfg)
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(43.5)
    expect(p.weight - 41).toBe(2.5)
    expect(p.why).toContain(2.5)
  })

  it('uses the exact increment for linear progression too, not a snap from zero', () => {
    const p = nextPrescription(state([
      session({ target: { sets: 3, reps: 5, weight: 41 }, rows: rowsOf(41, 5) }),
    ]), { id: LIFT, sets: 3, reps: 5, weight: 41, prog: 'linear' })
    expect(p.kind).toBe('up')
    expect(p.weight).toBe(43.5)
  })

  it('uses the exact increment for a lower-body lift', () => {
    const p = nextPrescription(state([
      session({ target: { sets: 3, reps: 5, weight: 41 }, rows: rowsOf(41, 5) }),
    ]), { id: LIFT, sets: 3, reps: 5, weight: 41, prog: 'linear', inc: 5 })
    expect(p.weight).toBe(46)
  })
})

describe('add-time runs', () => {
  const timeSession = (sec, { plan, targetSec = 45, d = '2026-01-01' } = {}) => session({
    d,
    target: { sets: 2, sec: targetSec, mode: 'time' },
    rows: [held(sec), held(sec)],
    plan,
  })
  const TIME = { id: LIFT, mode: 'time', sets: 2, sec: 45, prog: 'time' }

  it('climbs gradually from the weakest performed hold', () => {
    const p = nextPrescription(state([timeSession(30)]), TIME)
    expect(p.kind).toBe('hold')
    expect(p.sec).toBe(35)
  })

  it('advances from the achieved hold, not the frozen Target', () => {
    const p = nextPrescription(state([timeSession(50)]), TIME)
    expect(p.kind).toBe('up')
    expect(p.sec).toBe(55)
  })

  it('deloads from the achieved hold after three no-progress sessions following the baseline', () => {
    const S = state(repeat(4, i => timeSession(30, { d: day(i) })))
    const p = nextPrescription(S, TIME)
    expect(p.kind).toBe('deload')
    expect(p.sec).toBe(25)
  })

  it('following a deload builds up instead of sticking at the old Target', () => {
    const S = state(repeat(4, i => timeSession(30, { d: day(i) })))
    const deload = nextPrescription(S, TIME)
    expect(deload).toMatchObject({ kind: 'deload', sec: 25 })

    S.workouts.push(timeSession(25, { d: '2026-01-05', plan: deload }))
    const next = nextPrescription(S, TIME)
    expect(next.kind).toBe('up')
    expect(next.sec).toBe(30)
  })

  it('holds at the shortest hold instead of deloading below it', () => {
    const S = state(repeat(4, i => timeSession(2, { targetSec: MIN_TIME_SEC, d: day(i) })))
    const p = nextPrescription(S, { ...TIME, sec: MIN_TIME_SEC })
    expect(p.kind).toBe('hold')
    expect(p.sec).toBe(MIN_TIME_SEC)
  })
})

describe('Prescription records and the finish boundary', () => {
  it('persists the resolved Prescription on a finished Entry', () => {
    const routine = { id: 'r1', name: 'Push', ex: [{ ...DOUBLE }] }
    const S = state([
      { d: '2026-01-01', routineId: 'r1', entries: [{
        id: LIFT,
        target: REP_TARGET,
        sets: rowsOf(40, 9),
      }] },
    ], { routines: [routine] })

    const A = createActiveSession(S, 'r1', null, {
      todayISO: () => '2026-01-02', uid: () => 'a1', now: () => 0,
    })
    expect(A.entries[0].plan.kind).toBe('hold')
    A.entries[0].sets.forEach(s => { s.done = true })

    const completed = buildCompletedWorkout(A, { end: 1, unit: 'kg' })
    expect(completed.entries[0].plan).toEqual({
      kind: 'hold', weight: 40, reps: 10,
    })
  })

  it('the deload run survives the finish boundary', () => {
    const routine = { id: 'r1', name: 'Push', ex: [{ ...DOUBLE }] }
    let S = state(repeat(5, i => ({
      d: day(i),
      routineId: 'r1',
      entries: [{ id: LIFT, target: REP_TARGET, sets: rowsOf(40, 9) }],
    })), { routines: [routine] })

    const first = createActiveSession(S, 'r1', null, {
      todayISO: () => '2026-01-10', uid: () => 'a1', now: () => 0,
    })
    const deload = first.entries[0].plan
    expect(deload).toMatchObject({ kind: 'deload', weight: 35, reps: 10 })
    // The lifter follows the prescription exactly.
    first.entries[0].sets.forEach(s => { s.done = true })

    const done = buildCompletedWorkout(first, { end: 1, unit: 'kg' })
    S = { ...S, workouts: [...S.workouts, done] }

    const second = createActiveSession(S, 'r1', null, {
      todayISO: () => '2026-01-11', uid: () => 'a2', now: () => 0,
    })
    expect(second.entries[0].plan.kind).toBe('hold')
    expect(second.entries[0].plan.weight).toBe(35)
    expect(second.entries[0].plan.reps).toBe(11)
    expect(second.entries[0].sets.map(s => s.w)).toEqual([35, 35, 35])
    expect(second.entries[0].sets.map(s => s.r)).toEqual([11, 11, 11])
  })

  it('the add-time deload survives the finish boundary', () => {
    const routine = {
      id: 'r1', name: 'Push',
      ex: [{ id: LIFT, mode: 'time', sets: 2, sec: 45, prog: 'time' }],
    }
    const timeTarget = { sets: 2, sec: 45, mode: 'time' }
    let S = state(repeat(4, i => ({
      d: day(i),
      routineId: 'r1',
      entries: [{ id: LIFT, target: timeTarget, sets: [held(30), held(30)] }],
    })), { routines: [routine] })

    const first = createActiveSession(S, 'r1', null, {
      todayISO: () => '2026-01-10', uid: () => 'a1', now: () => 0,
    })
    expect(first.entries[0].plan).toMatchObject({ kind: 'deload', sec: 25 })
    expect(first.entries[0].sets.map(s => s.sec)).toEqual([25, 25])
    first.entries[0].sets.forEach(s => { s.done = true })

    const done = buildCompletedWorkout(first, { end: 1, unit: 'kg' })
    expect(done.entries[0].plan).toMatchObject({ kind: 'deload', sec: 25 })
    S = { ...S, workouts: [...S.workouts, done] }

    // The next session climbs from the 25 s actually prescribed, not the frozen 45 s Target.
    const second = createActiveSession(S, 'r1', null, {
      todayISO: () => '2026-01-11', uid: () => 'a2', now: () => 0,
    })
    expect(second.entries[0].plan).toMatchObject({ kind: 'up', sec: 30 })
    expect(second.entries[0].sets.map(s => s.sec)).toEqual([30, 30])
  })

  it('an added routine exercise uses the same stream-aware seed', () => {
    const routine = { id: 'r1', name: 'Push', ex: [] }
    const S = state([
      { d: '2026-01-01', routineId: 'r1', entries: [{
        id: LIFT,
        target: { sets: 3, reps: 10, weight: 45 },
        sets: rowsOf(45, 10),
      }] },
    ], { routines: [routine], exWeights: { [LIFT]: { w: 100, d: '2026-01-01' } } })
    S.active = { id: 'a1', routineId: 'r1', entries: [], cur: 0 }

    const entry = addActiveExercise(S, LIFT, { ...DOUBLE, weight: 40 })
    expect(entry.plan.kind).toBe('first')
    expect(entry.sets.map(s => s.w)).toEqual([45, 45, 45])
    expect(entry.sets.map(s => s.r)).toEqual([12, 12, 12])
  })
})
