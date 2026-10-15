import { describe, it, expect } from 'vitest'
import { selectStatsOverview, selectExerciseStats } from './stats-selectors.js'
import { MUSCLES } from './muscles.js'
import { STRENGTH_FLOOR } from './recovery.js'
import { toScale } from './effort.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 6, 1, 12)

const LIFT = { id: 'lift', n: 'Bench', bp: 'chest', tg: 'pectorals', sm: [], eq: 'barbell' }
const CARDIO = { id: 'run', n: 'Run', bp: 'cardio', tg: 'cardio', sm: [], mode: 'cardio' }
const KNOWN = { id: 'hold', n: 'Hold', bp: 'waist', tg: 'abs', sm: [], mode: 'time' }
const LIFT_SLUG = 'chest'
const records = [LIFT, CARDIO, KNOWN]
const catalogue = { lookup: id => records.find(e => e.id === id) ?? null }

const isoOfTs = ts => new Date(ts).toISOString().slice(0, 10)
const workoutAt = (id, ageDays, sets, extra = {}) => ({
  id: `w-${id}-${ageDays}`,
  d: isoOfTs(NOW - ageDays * DAY),
  start: NOW - ageDays * DAY,
  entries: [{ id, sets: sets.map(s => ({ ...s })) }],
  ...extra,
})
const doneSet = (w, r, extra = {}) => ({ done: true, w, r, ...extra })

// Fixed profile: recent progressive lift, an old lift outside a 30d window,
// a cardio session, and rated effort on the recent work.
const profile = () => ({
  unit: 'kg',
  effort: 'rir',
  bodyweight: [{ d: isoOfTs(NOW - 40 * DAY), w: 80 }],
  workouts: [
    workoutAt(LIFT.id, 40, [doneSet(60, 8), doneSet(60, 8)]),
    workoutAt(LIFT.id, 10, [doneSet(70, 8, { rir: 3 }), doneSet(70, 8, { rir: 4 })]),
    workoutAt(LIFT.id, 2, [doneSet(80, 5, { rir: 1 }), doneSet(80, 5, { rir: 2 }), doneSet(80, 5, { rir: 2 })]),
    workoutAt(CARDIO.id, 3, [{ done: true, min: 20, speed: 9 }]),
  ],
})

describe('now is required', () => {
  it('throws without an injected now', () => {
    const S = profile()
    expect(() => selectStatsOverview(S, {})).toThrow()
    expect(() => selectStatsOverview(S)).toThrow()
    expect(() => selectStatsOverview(S, { now: null })).toThrow()
    expect(() => selectExerciseStats(S, LIFT.id, {})).toThrow()
    expect(() => selectExerciseStats(S, LIFT.id)).toThrow()
  })
})

describe('empties', () => {
  it('returns zeroed overview values for empty history', () => {
    const S = { unit: 'kg', effort: 'none', bodyweight: [], workouts: [] }
    const over = selectStatsOverview(S, { now: NOW, catalogue })
    expect(over.muscles.rated).toBe(false)
    expect(over.muscles.hardActive).toBe(false)
    expect(over.muscles.worked).toEqual([])
    expect(over.muscles.missed).toEqual(MUSCLES)
    expect(over.effort).toBe(null)
    expect(Object.values(over.fatigue.values).every(v => v === 0)).toBe(true)
    expect(Object.values(over.strength.values).every(v => v === STRENGTH_FLOOR)).toBe(true)
    expect(over.exercisesFor(LIFT_SLUG)).toEqual([])
  })

  it('returns null for an unknown exercise', () => {
    expect(selectExerciseStats(profile(), 'no-such-exercise', { now: NOW, catalogue })).toBe(null)
  })

  it('returns empty curves for a known exercise with no logged sets', () => {
    const S = { unit: 'kg', workouts: [] }
    const st = selectExerciseStats(S, KNOWN.id, { now: NOW, catalogue })
    expect(st).not.toBe(null)
    expect(st.points).toEqual([])
    expect(st.effort).toBe(null)
    expect(st.record).toBe(null)
  })
})

describe('window slicing', () => {
  it('excludes out-of-window work from the muscle map but keeps it for all-time', () => {
    const S = profile()
    const scoped = selectStatsOverview(S, { now: NOW, catalogue, muscleDays: 30 })
    const all = selectStatsOverview(S, { now: NOW, catalogue, muscleDays: 0 })
    expect(scoped.muscles.load[LIFT_SLUG]).toBeGreaterThan(0)
    expect(all.muscles.load[LIFT_SLUG]).toBeGreaterThan(scoped.muscles.load[LIFT_SLUG])
  })

  it('slices the effort window off the injected now, not the wall clock', () => {
    const S = profile()
    const scoped = selectStatsOverview(S, { now: NOW, catalogue, effortDays: 5 })
    const wide = selectStatsOverview(S, { now: NOW, catalogue, effortDays: 30 })
    // 10-day-old rated session drops out of the 5-day window
    expect(scoped.effort.done).toBeLessThan(wide.effort.done)
    expect(scoped.effort.rated).toBe(3)
    expect(wide.effort.rated).toBe(5)
  })
})

describe('hard-set fallback', () => {
  it('applies the hard filter silently falling back when the window holds no hard sets', () => {
    const easy = {
      unit: 'kg', effort: 'rir', bodyweight: [], workouts: [
        workoutAt(LIFT.id, 2, [doneSet(50, 8, { rir: 5 }), doneSet(50, 8, { rir: 4 })]),
      ],
    }
    const on = selectStatsOverview(easy, { now: NOW, catalogue, muscleDays: 30, hardOnly: true })
    expect(on.muscles.rated).toBe(true)
    expect(on.muscles.hardActive).toBe(false)
    const off = selectStatsOverview(easy, { now: NOW, catalogue, muscleDays: 30, hardOnly: false })
    expect(on.muscles.load[LIFT_SLUG]).toBe(off.muscles.load[LIFT_SLUG])
  })

  it('narrows the map to hard sets when the window holds them', () => {
    const S = profile()
    const hard = selectStatsOverview(S, { now: NOW, catalogue, muscleDays: 30, hardOnly: true })
    const all = selectStatsOverview(S, { now: NOW, catalogue, muscleDays: 30, hardOnly: false })
    expect(hard.muscles.rated).toBe(true)
    expect(hard.muscles.hardActive).toBe(true)
    expect(hard.muscles.load[LIFT_SLUG]).toBeLessThan(all.muscles.load[LIFT_SLUG])
  })
})

describe('mode gating', () => {
  it('resolves reps authoritatively when an entry mixes reps and timed rows', () => {
    const S = {
      unit: 'kg', workouts: [
        workoutAt(LIFT.id, 2, [
          doneSet(80, 5),
          { done: true, sec: 60, w: 0 },
        ]),
      ],
    }
    const st = selectExerciseStats(S, LIFT.id, { now: NOW, catalogue })
    expect(st.mode).toBe('reps')
    expect(st.e1rmPoints.length).toBeGreaterThan(0)
  })

  it('gates cardio and timed work out of the 1RM curve', () => {
    const cardio = selectExerciseStats(profile(), CARDIO.id, { now: NOW, catalogue })
    expect(cardio.mode).toBe('cardio')
    expect(cardio.e1rmPoints).toEqual([])
    expect(cardio.e1rmBest).toBe(null)

    const timed = {
      unit: 'kg', workouts: [
        { ...workoutAt(LIFT.id, 2, [{ done: true, sec: 60, w: 10 }]), entries: [{ id: LIFT.id, target: { mode: 'time' }, sets: [{ done: true, sec: 60, w: 10 }] }] },
      ],
    }
    const tst = selectExerciseStats(timed, LIFT.id, { now: NOW, catalogue })
    expect(tst.mode).toBe('time')
    expect(tst.e1rmPoints).toEqual([])
    expect(tst.e1rmBest).toBe(null)
  })
})

describe('effort scale', () => {
  it('reports the average in the profile display scale', () => {
    const S = profile()
    const rir = selectStatsOverview(S, { now: NOW, catalogue })
    expect(rir.scale).toBe('rir')
    expect(rir.effort.avg).toBeCloseTo(2.4, 10)

    const rpe = selectStatsOverview({ ...S, effort: 'rpe' }, { now: NOW, catalogue })
    expect(rpe.scale).toBe('rpe')
    expect(rpe.effort.avg).toBe(toScale('rpe', 2.4))
  })

  it('is null when nothing was rated', () => {
    const S = {
      unit: 'kg', effort: 'none', bodyweight: [], workouts: [
        workoutAt(LIFT.id, 2, [doneSet(80, 5), doneSet(80, 5)]),
      ],
    }
    const over = selectStatsOverview(S, { now: NOW, catalogue })
    expect(over.effort).toBe(null)
    const st = selectExerciseStats(S, LIFT.id, { now: NOW, catalogue })
    expect(st.effort).toBe(null)
  })
})

describe('record', () => {
  it('flags the latest session when it sets a new estimated max', () => {
    const st = selectExerciseStats(profile(), LIFT.id, { now: NOW, catalogue })
    expect(st.e1rmBest.est).toBeCloseTo(93.3, 1)
    expect(st.record).not.toBe(null)
    expect(st.record.prev).toBeCloseTo(88.7, 1)
  })

  it('flags a clear progressive record with its previous best', () => {
    const S = {
      unit: 'kg', workouts: [
        workoutAt(LIFT.id, 10, [doneSet(60, 5)]),
        workoutAt(LIFT.id, 2, [doneSet(100, 5)]),
      ],
    }
    const st = selectExerciseStats(S, LIFT.id, { now: NOW, catalogue })
    expect(st.record).not.toBe(null)
    expect(st.record.prev).toBeLessThan(st.e1rmBest.est)
  })

  it('stays quiet when the latest session does not beat the best', () => {
    const S = {
      unit: 'kg', workouts: [
        workoutAt(LIFT.id, 10, [doneSet(100, 5)]),
        workoutAt(LIFT.id, 2, [doneSet(60, 5)]),
      ],
    }
    expect(selectExerciseStats(S, LIFT.id, { now: NOW, catalogue }).record).toBe(null)
  })
})

describe('work-set-only counting', () => {
  it('ignores warm-ups and unchecked sets everywhere', () => {
    const S = {
      unit: 'kg', effort: 'rir', bodyweight: [], workouts: [{
        id: 'w1', d: isoOfTs(NOW - DAY), start: NOW - DAY,
        entries: [{ id: LIFT.id, sets: [
          { done: true, warmup: true, w: 200, r: 1, rir: 0 },
          { done: false, w: 200, r: 5, rir: 0 },
          doneSet(60, 8, { rir: 2 }),
        ] }],
      }],
    }
    const over = selectStatsOverview(S, { now: NOW, catalogue })
    expect(over.muscles.load[LIFT_SLUG]).toBe(1)
    expect(over.effort.rated).toBe(1)
    const st = selectExerciseStats(S, LIFT.id, { now: NOW, catalogue })
    expect(st.best).toBe(60)
  })
})

describe('bodyweight and catalogue', () => {
  it('resolves bodyweight from the profile and lets the override win', () => {
    const a = selectStatsOverview(profile(), { now: NOW, catalogue })
    expect(a.bodyweightKg).toBe(80)
    const b = selectStatsOverview(profile(), { now: NOW, catalogue, bodyweightKg: 90 })
    expect(b.bodyweightKg).toBe(90)
  })

  it('accepts a custom catalogue adapter', () => {
    const custom = { id: 'custom-lift', n: 'Custom lift', bp: 'chest', tg: 'chest', sm: [] }
    const S = {
      unit: 'kg', workouts: [workoutAt(custom.id, 2, [doneSet(50, 8)])],
    }
    expect(selectExerciseStats(S, custom.id, { now: NOW })).toBe(null)
    const catalogue = { lookup: id => (id === custom.id ? custom : null) }
    const st = selectExerciseStats(S, custom.id, { now: NOW, catalogue })
    expect(st).not.toBe(null)
    expect(st.name).toBe('Custom lift')
  })
})

describe('display-ready values', () => {
  it('rounds loads and pre-sizes top-set dots', () => {
    const st = selectExerciseStats(profile(), LIFT.id, { now: NOW, catalogue })
    expect(Number.isInteger(st.best * 10)).toBe(true)
    for (const p of st.points) {
      if (p.m != null) expect(p.m).toBeGreaterThanOrEqual(0)
      if (p.m != null) expect(p.m).toBeLessThanOrEqual(1)
    }
    const rpe = selectExerciseStats({ ...profile(), effort: 'rpe' }, LIFT.id, { now: NOW, catalogue })
    expect(rpe.points.length).toBe(st.points.length)
  })
})

describe('calendar windows', () => {
  it('uses the current calendar week for the Week muscle window', () => {
    // NOW is Wednesday July 1. The preceding Sunday belongs to the prior week.
    const S = { workouts: [
      workoutAt(LIFT.id, 3, [doneSet(50, 5)]),
      workoutAt(LIFT.id, 1, [doneSet(60, 5), doneSet(60, 5)]),
    ] }
    const over = selectStatsOverview(S, { now: NOW, catalogue, muscleDays: 7 })
    expect(over.muscles.load.chest).toBe(2)
    expect(over.muscles.count).toBe(1)
  })
})

describe('overview history', () => {
  it('derives month counts, the trailing week streak and recent Workouts from the injected clock', () => {
    const S = { workouts: [
      workoutAt(LIFT.id, 15, [doneSet(50, 5)]),
      workoutAt(LIFT.id, 8, [doneSet(60, 5)]),
      workoutAt(LIFT.id, 0, [doneSet(70, 5)]),
    ] }
    const over = selectStatsOverview(S, { now: NOW, catalogue })
    expect(over.counts).toEqual({ total: 3, month: 1, streak: 3 })
    expect(over.workouts.recent.map(w => w.d)).toEqual(['2026-07-01', '2026-06-23', '2026-06-16'])
    expect(over.workouts.forDay('2026-06-23')).toEqual([S.workouts[1]])
    expect(over.workouts.forDay('2026-06-24')).toEqual([])
  })
})

describe('body-weight log readings', () => {
  it('returns selected-window chart points, the latest weigh-in, a 30-day delta and goal', () => {
    const S = { unit: 'lb', targetW: 165, bodyweight: [
      { d: '2026-05-01', w: 185 }, { d: '2026-06-10', w: 180 }, { d: '2026-06-30', w: 176 },
    ] }
    const over = selectStatsOverview(S, { now: NOW, catalogue, bodyweightDays: 7 })
    expect(over.bodyweight.points).toEqual([{ t: Date.UTC(2026, 5, 30), d: '2026-06-30', y: 176 }])
    expect(over.bodyweight.latest).toEqual({ d: '2026-06-30', w: 176 })
    expect(over.bodyweight.delta30).toBe(-4)
    expect(over.bodyweight.goal).toBe(165)
    expect(over.bodyweightKg).toBeCloseTo(79.832, 3)
  })
})

describe('catalogue snapshot', () => {
  it('uses Profile customs consistently for balance, Fatigue, strength and drilldown', () => {
    const S = { unit: 'kg', customEx: [LIFT], workouts: [workoutAt(LIFT.id, 21, [doneSet(60, 5)])] }
    const over = selectStatsOverview(S, { now: NOW })
    expect(over.muscles.load.chest).toBe(1)
    expect(over.fatigue.values.chest).toBeGreaterThan(0)
    expect(over.strength.values.chest).toBeCloseTo(0.8409, 4)
    expect(over.strength.weeks.chest).toBe(3)
    expect(over.strength.weeks.quadriceps).toBe(null)
    expect(over.strength.volume90.chest).toBe(1)
    expect(over.strength.order[0]).toBe('chest')
    expect(over.strength.detrained).toContain('chest')
    expect(over.exercisesFor('chest')[0]).toMatchObject({ id: 'lift', name: 'Bench', primary: 'chest', est: 70, current: 58.9 })
    expect(selectExerciseStats(S, 'lift', { now: NOW }).name).toBe('Bench')
  })
})

describe('exercise index and sessions', () => {
  it('sorts named exercises by latest positive metric and keeps recent session rows and targets', () => {
    const target = { mode: 'reps', reps: 5, weight: 60 }
    const latest = workoutAt(LIFT.id, 1, [doneSet(60, 5, { rir: 2 })])
    latest.entries[0].target = target
    const S = { unit: 'kg', customEx: [LIFT, KNOWN], workouts: [
      workoutAt(LIFT.id, 20, [doneSet(100, 5)]),
      workoutAt(KNOWN.id, 10, [{ done: true, sec: 75 }]), latest,
    ] }
    const over = selectStatsOverview(S, { now: NOW })
    expect(over.exerciseIndex).toEqual([
      { id: 'hold', name: 'Hold', current: 75, mode: 'time', unit: 's' },
      { id: 'lift', name: 'Bench', current: 60, mode: 'reps', unit: 'kg' },
    ])
    const st = selectExerciseStats(S, 'lift', { now: NOW })
    expect(st.best).toBe(100)
    expect(st.recent[0]).toMatchObject({ y: 60, sets: [doneSet(60, 5, { rir: 2 })], target })
    expect(st.points[1]).toMatchObject({ effort: 2, m: 0.5 })
  })
})

it('uses the latest entry Mode when an exercise changes from reps to time', () => {
  const S = { workouts: [
    workoutAt(LIFT.id, 10, [doneSet(80, 5)]),
    workoutAt(LIFT.id, 1, [{ done: true, sec: 60 }]),
  ] }
  const st = selectExerciseStats(S, LIFT.id, { now: NOW, catalogue })
  expect(st.mode).toBe('time')
  expect(st.points.map(p => p.y)).toEqual([60])
  expect(st.e1rmPoints).toEqual([])
})

it('returns scaled effort thresholds, histogram labels and bar widths', () => {
  const over = selectStatsOverview({ ...profile(), effort: 'rpe' }, { now: NOW, catalogue })
  expect(over.effort.hardThreshold).toBe(7)
  expect(over.effort.histogram[2]).toMatchObject({ value: 8, hard: true, width: 100, percent: 40 })
  expect(over.effort.histogram[4]).toMatchObject({ value: 6, tail: true, hard: false, width: 50, percent: 20 })
})

it('keeps a named historical exercise selectable after its Custom exercise was deleted', () => {
  const workout = workoutAt('deleted', 1, [doneSet(60, 5)])
  workout.entries[0].n = 'Old bench'
  workout.entries[0].muscleWeights = { chest: 1 }
  const S = { workouts: [workout] }
  const over = selectStatsOverview(S, { now: NOW })
  expect(over.exerciseIndex[0]).toMatchObject({ id: 'deleted', name: 'Old bench', current: 60 })
  expect(selectExerciseStats(S, 'deleted', { now: NOW }).best).toBe(60)
  expect(over.exercisesFor('chest')[0].name).toBe('Old bench')
})
