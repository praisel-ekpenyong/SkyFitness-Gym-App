import { describe, it, expect } from 'vitest'
import { selectStatsOverview, selectExerciseStats } from './stats-selectors.js'
import { MUSCLES } from './muscles.js'
import { STRENGTH_FLOOR } from './recovery.js'
import { toScale } from './effort.js'
import { switchTrainingStyle, setVolumeRange, clearVolumeRanges } from './volume-ranges.js'

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
    expect(over.strength.latest.chest).toBe(null)
    expect(over.strength.weeks.chest).toBe(null)
    expect(over.bodyweight.latest).toBe(null)
    expect(over.bodyweight.delta30).toBe(null)
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
  })

  it('cleanly tolerates workout.entries containing null, undefined, or non-objects', () => {
    const corrupted = {
      unit: 'kg',
      effort: 'none',
      bodyweight: [],
      workouts: [
        {
          id: 'w-corrupt',
          d: isoOfTs(NOW),
          start: NOW,
          entries: [
            null,
            undefined,
            'invalid-entry',
            42,
            { id: LIFT.id, sets: [doneSet(80, 5)] },
            null,
          ],
        },
      ],
    }
    const overview = selectStatsOverview(corrupted, { now: NOW, catalogue })
    expect(overview).toBeDefined()
    expect(overview.muscles.load[LIFT_SLUG]).toBeGreaterThan(0)
    expect(overview.counts.total).toBe(1)

    const exerciseStats = selectExerciseStats(corrupted, LIFT.id, { now: NOW, catalogue })
    expect(exerciseStats).toBeDefined()
    expect(exerciseStats.best).toBe(80)
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

describe('estimated 1RM best', () => {
  it('peaks at the strongest session estimate', () => {
    const st = selectExerciseStats(profile(), LIFT.id, { now: NOW, catalogue })
    expect(st.e1rmBest.est).toBeCloseTo(93.3, 1)
  })
})

describe('work-set-only counting', () => {
  it('ignores warm-ups and unchecked sets everywhere', () => {
    const S = {
      unit: 'kg', effort: 'rir', bodyweight: [], workouts: [{
        id: 'w1', d: isoOfTs(NOW - DAY), start: NOW - DAY,
        entries: [{ id: LIFT.id, sets: [
          { done: true, phase: 'warmup', w: 200, r: 1, rir: 0 },
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
    expect(over.counts).toEqual({ total: 3, month: 1, streak: { current: 3, best: 3 }, weeks12: 3 })
    expect(over.workouts.recent.map(w => w.d)).toEqual(['2026-07-01', '2026-06-23', '2026-06-16'])
    expect(over.workouts.forDay('2026-06-23')).toEqual([S.workouts[1]])
    expect(over.workouts.forDay('2026-06-24')).toEqual([])
  })
})

describe('exercise sessions read in the Profile unit (ADR 0031)', () => {
  it('lists the sets of a kg Workout in pounds after a switch, as the chart does', () => {
    const S = { unit: 'lb', effort: 'none', bodyweight: [], workouts: [workoutAt(LIFT.id, 2, [doneSet(100, 5)], { unit: 'kg' })] }
    const st = selectExerciseStats(S, LIFT.id, { now: NOW, catalogue })
    expect(st.recent[0].y).toBe(220.5)
    expect(st.recent[0].sets.map(s => s.w)).toEqual([220.5])
    expect(S.workouts[0].entries[0].sets[0].w).toBe(100)
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
  it('reads Weigh-ins stamped in kg in a pounds profile, after a unit switch (ADR 0031)', () => {
    const S = { unit: 'lb', targetW: 165.3, bodyweight: [
      { d: '2026-06-10', w: 80, unit: 'kg' }, { d: '2026-06-30', w: 176 },
    ] }
    const over = selectStatsOverview(S, { now: NOW, catalogue })
    expect(over.bodyweight.points.map(p => p.y)).toEqual([176.4, 176])
    expect(over.bodyweight.latest.w).toBe(176)
    expect(over.bodyweight.delta30).toBe(-0.4)
    const kgLatest = selectStatsOverview({ unit: 'lb', bodyweight: [{ d: '2026-06-30', w: 80, unit: 'kg' }] }, { now: NOW, catalogue })
    expect(kgLatest.bodyweightKg).toBeCloseTo(80, 6)
  })
})

describe('muscle attribution prefers the logged snapshot', () => {
  it('attributes load, fatigue and latest-trained by logged muscleWeights when they differ from the catalogue', () => {
    const S = { unit: 'kg', workouts: [workoutAt(LIFT.id, 2, [doneSet(50, 5)])] }
    S.workouts[0].entries[0].muscleWeights = { quadriceps: 1 }
    const over = selectStatsOverview(S, { now: NOW, catalogue })
    expect(over.muscles.load.quadriceps).toBe(1)
    expect(over.muscles.load.chest).toBe(0)
    expect(over.fatigue.values.quadriceps).toBeGreaterThan(0)
    expect(over.fatigue.values.chest).toBe(0)
    expect(over.strength.latest.quadriceps).not.toBe(null)
    expect(over.strength.latest.chest).toBe(null)
    expect(selectExerciseStats(S, LIFT.id, { now: NOW, catalogue }).name).toBe('Bench')
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

  it('marks only the Set that made a Record, read from the Training log: the heaviest Set of a Workout that beat every earlier one', () => {
    const S = { unit: 'kg', workouts: [
      workoutAt(LIFT.id, 20, [doneSet(90, 3)]),
      workoutAt(LIFT.id, 10, [doneSet(90, 10), doneSet(100, 3), doneSet(95, 6)]),
      workoutAt(LIFT.id, 1, [doneSet(80, 5)], { prs: [LIFT.id] }),
    ] }
    const st = selectExerciseStats(S, LIFT.id, { now: NOW, catalogue })
    expect(st.recent.map(p => p.record)).toEqual([null, 1, null])
  })

  it('marks the first Set at the heaviest load when several Sets share it', () => {
    const S = { unit: 'kg', workouts: [
      workoutAt(LIFT.id, 5, [doneSet(80, 5)]),
      workoutAt(LIFT.id, 1, [doneSet(90, 8), doneSet(100, 5), doneSet(100, 6)]),
    ] }
    expect(selectExerciseStats(S, LIFT.id, { now: NOW, catalogue }).recent[0].record).toBe(1)
  })

  it('survives a legacy top-weight Workout, which has no Set to mark', () => {
    const legacy = workoutAt(LIFT.id, 1, [])
    legacy.entries[0].topW = 120
    const S = { unit: 'kg', workouts: [workoutAt(LIFT.id, 5, [doneSet(80, 5)]), legacy] }
    const st = selectExerciseStats(S, LIFT.id, { now: NOW, catalogue })
    expect(st.recent.map(p => p.record)).toEqual([null])
  })

  it('marks no Set on a timed exercise, which has no estimate', () => {
    const S = { workouts: [workoutAt(KNOWN.id, 1, [{ done: true, sec: 60 }], { prs: [KNOWN.id] })] }
    expect(selectExerciseStats(S, KNOWN.id, { now: NOW, catalogue }).recent[0].record).toBe(null)
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

describe('read-time unit normalization across selectors (ADR 0031)', () => {
  it('normalizes exercise stats points and overview index to active profile unit', () => {
    const workoutLb = workoutAt(LIFT.id, 5, [doneSet(200, 5)], { unit: 'lb' })
    const stateKg = { unit: 'kg', customEx: [LIFT], workouts: [workoutLb] }

    const stKg = selectExerciseStats(stateKg, LIFT.id, { now: NOW, catalogue })
    expect(stKg.unit).toBe('kg')
    expect(stKg.best).toBe(90.7)
    expect(stKg.points[0].y).toBe(90.7)

    const overKg = selectStatsOverview(stateKg, { now: NOW, catalogue })
    expect(overKg.exerciseIndex[0]).toMatchObject({ id: LIFT.id, current: 90.7, unit: 'kg' })

    const stateLb = { unit: 'lb', customEx: [LIFT], workouts: [workoutLb] }
    const stLb = selectExerciseStats(stateLb, LIFT.id, { now: NOW, catalogue })
    expect(stLb.unit).toBe('lb')
    expect(stLb.best).toBe(200)
    expect(stLb.points[0].y).toBe(200)

    const overLb = selectStatsOverview(stateLb, { now: NOW, catalogue })
    expect(overLb.exerciseIndex[0]).toMatchObject({ id: LIFT.id, current: 200, unit: 'lb' })
  })
})

describe('history re-read through the catalogue corrections', () => {
  it('credits a stored back squat workout to quads in load and fatigue', () => {
    const stored = workoutAt('0043', 1, [doneSet(100, 5), doneSet(100, 5), doneSet(100, 5)])
    const S = { unit: 'kg', effort: 'none', bodyweight: [], workouts: [stored] }
    const before = JSON.stringify(S)

    const over = selectStatsOverview(S, { now: NOW })

    expect(over.muscles.load.quadriceps).toBe(3)
    expect(over.muscles.load.gluteal).toBe(1.2)
    expect(over.muscles.load.adductors).toBe(1.2)
    expect(over.muscles.load.hamstring).toBe(0)
    expect(over.fatigue.values.quadriceps).toBeGreaterThan(over.fatigue.values.gluteal)
    expect(over.fatigue.values.hamstring).toBe(0)
    expect(JSON.stringify(S)).toBe(before)
  })
})

describe('weekly volume', () => {
  // NOW is Wednesday 1 July 2026; the ISO week runs Monday 29 June to Sunday 5 July.
  const COUNT_ONLY = ['trapezius', 'forearm', 'lower-back', 'obliques', 'adductors', 'serratus', 'hip-flexors', 'tibialis']

  it('reads an empty week as zero done against the Standard volume ranges, with count-only muscles unranged', () => {
    const over = selectStatsOverview({ workouts: [] }, { now: NOW, catalogue })
    const { muscles } = over.weeklyVolume
    expect(Object.keys(muscles).sort()).toEqual([...MUSCLES].sort())
    expect(muscles.chest).toEqual({ done: 0, projected: null, range: [10, 20], verdict: 'below', edited: false })
    expect(muscles['side-delts'].range).toEqual([8, 20])
    expect(muscles.gluteal.range).toEqual([4, 16])
    for (const slug of COUNT_ONLY) {
      expect(muscles[slug]).toEqual({ done: 0, projected: null, range: null, verdict: null, edited: false })
    }
  })

  it('counts performed work sets from this week only, leaving out warm-ups, unchecked sets and last week', () => {
    const S = { workouts: [
      workoutAt(LIFT.id, 3, [doneSet(60, 8), doneSet(60, 8)]),
      workoutAt(LIFT.id, 1, [
        { done: true, phase: 'warmup', w: 40, r: 10 },
        { done: false, w: 60, r: 8 },
        doneSet(60, 8), doneSet(60, 8), doneSet(60, 8),
      ]),
    ] }
    const { chest } = selectStatsOverview(S, { now: NOW, catalogue }).weeklyVolume.muscles
    expect(chest.done).toBe(3)
    expect(chest.verdict).toBe('below')
  })

  it('counts the Active workout as done mid-session', () => {
    const S = {
      workouts: [workoutAt(LIFT.id, 1, Array.from({ length: 8 }, () => doneSet(60, 8)))],
      active: { name: 'Push', start: NOW - 3600e3, entries: [{ id: LIFT.id, sets: [
        doneSet(60, 8), doneSet(60, 8), { done: false, w: 60, r: 8 }, { done: true, phase: 'warmup', w: 40, r: 10 },
      ] }] },
    }
    const { chest } = selectStatsOverview(S, { now: NOW, catalogue }).weeklyVolume.muscles
    expect(chest.done).toBe(10)
    expect(chest.verdict).toBe('in')
  })

  it('reads above when the sets pass the top of the range, and secondary work counts 0.4', () => {
    const PRESS = { id: 'press', n: 'Press', muscleWeights: { 'front-delts': 1, triceps: 0.4 } }
    const cat = { lookup: id => [LIFT, PRESS].find(e => e.id === id) ?? null }
    const S = { workouts: [workoutAt(PRESS.id, 0, Array.from({ length: 13 }, () => doneSet(40, 8)))] }
    const { muscles } = selectStatsOverview(S, { now: NOW, catalogue: cat }).weeklyVolume
    expect(muscles['front-delts']).toMatchObject({ done: 13, range: [0, 12], verdict: 'above' })
    expect(muscles.triceps).toMatchObject({ done: 5.2, verdict: 'below' })
  })

  it('never reads front delts as below, even untrained', () => {
    const { muscles } = selectStatsOverview({ workouts: [] }, { now: NOW, catalogue }).weeklyVolume
    expect(muscles['front-delts'].verdict).toBe('in')
  })

  it('never reads front delts as below after a per-muscle edit: the low end stays at 0', () => {
    const stored = { workouts: [], volumeRanges: { 'front-delts': [4, 10] } }
    expect(selectStatsOverview(stored, { now: NOW, catalogue }).weeklyVolume.muscles['front-delts'])
      .toMatchObject({ range: [0, 10], verdict: 'in', edited: true })
    const edited = { workouts: [] }
    setVolumeRange(edited, 'front-delts', [6, 14])
    expect(selectStatsOverview(edited, { now: NOW, catalogue }).weeklyVolume.muscles['front-delts'])
      .toMatchObject({ range: [0, 14], verdict: 'in', edited: true })
  })

  it('gives a count-only muscle its count and no verdict', () => {
    const SHRUG = { id: 'shrug', n: 'Shrug', muscleWeights: { trapezius: 1 } }
    const cat = { lookup: id => (id === SHRUG.id ? SHRUG : null) }
    const S = { workouts: [workoutAt(SHRUG.id, 0, [doneSet(80, 10), doneSet(80, 10)])] }
    const { trapezius } = selectStatsOverview(S, { now: NOW, catalogue: cat }).weeklyVolume.muscles
    expect(trapezius).toEqual({ done: 2, projected: null, range: null, verdict: null, edited: false })
  })
})

describe('projected volume', () => {
  // NOW is Wednesday 1 July 2026; the ISO week runs Monday 29 June to Sunday 5 July.
  // S.week is indexed by getDay(): 0 Sunday … 6 Saturday.
  const MONDAY = NOW - 2 * DAY
  const push = { id: 'push', name: 'Push', ex: [{ id: LIFT.id, sets: 4 }] }
  const legs = { id: 'legs', name: 'Legs', ex: [{ id: 'squat', sets: 5 }] }
  const SQUAT = { id: 'squat', n: 'Squat', muscleWeights: { quadriceps: 1, gluteal: 0.4 } }
  const cat = { lookup: id => [LIFT, SQUAT].find(e => e.id === id) ?? null }
  const monWedFri = () => ({ routines: [push, legs], week: [null, 'push', null, 'push', null, 'push', null], workouts: [] })
  const volume = (S, now = NOW) => selectStatsOverview(S, { now, catalogue: cat }).weeklyVolume.muscles

  it('reads a Monday with a full week schedule and nothing trained as on track', () => {
    const { chest } = volume(monWedFri(), MONDAY)
    expect(chest).toMatchObject({ done: 0, projected: 12, range: [10, 20], verdict: 'in' })
  })

  it('adds nothing for a missed past day mid-week', () => {
    const { chest } = volume(monWedFri())
    expect(chest).toMatchObject({ done: 0, projected: 8, verdict: 'below' })
  })

  it('counts a Rescheduled day in place of the week schedule', () => {
    const S = { ...monWedFri(), dayPlan: { '2026-07-03': 'legs', '2026-07-02': 'push' } }
    const { chest, quadriceps, gluteal } = volume(S)
    expect(chest.projected).toBe(8)
    expect(quadriceps).toMatchObject({ done: 0, projected: 5, verdict: 'below' })
    expect(gluteal.projected).toBe(2)
  })

  it('adds nothing for a declared rest day', () => {
    const S = { ...monWedFri(), dayPlan: { '2026-07-03': 'rest' } }
    expect(volume(S).chest.projected).toBe(4)
  })

  it('has no projection without a week schedule, and the verdict reads sets done', () => {
    const S = { routines: [push], workouts: [workoutAt(LIFT.id, 1, Array.from({ length: 10 }, () => doneSet(60, 8)))] }
    expect(volume(S).chest).toMatchObject({ done: 10, projected: null, verdict: 'in' })
  })

  it('does not count today\'s routine again once today is trained', () => {
    const S = { ...monWedFri(), workouts: [workoutAt(LIFT.id, 0, [doneSet(60, 8), doneSet(60, 8), doneSet(60, 8)])] }
    expect(volume(S).chest).toMatchObject({ done: 3, projected: 7, verdict: 'below' })
  })

  it('counts an Active workout mid-session as done and leaves today\'s routine out', () => {
    const S = { ...monWedFri(), active: { name: 'Push', start: NOW - 1800e3, entries: [{ id: LIFT.id, sets: [
      doneSet(60, 8), doneSet(60, 8), { done: false, w: 60, r: 8 }, { done: true, phase: 'warmup', w: 40, r: 10 },
    ] }] } }
    expect(volume(S).chest).toMatchObject({ done: 2, projected: 6, verdict: 'below' })
  })

  it('reads above from the projection when the plan passes the top of the range', () => {
    const big = { ...push, ex: [{ id: LIFT.id, sets: 8 }] }
    const S = { ...monWedFri(), routines: [big, legs], workouts: [workoutAt(LIFT.id, 1, Array.from({ length: 6 }, () => doneSet(60, 8)))] }
    expect(volume(S).chest).toMatchObject({ done: 6, projected: 22, verdict: 'above' })
  })

  it('leaves out an Active workout left over from last week and still counts today\'s routine', () => {
    const lastWeek = NOW - 7 * DAY
    const S = { ...monWedFri(), active: { name: 'Push', d: '2026-06-24', start: lastWeek, entries: [{ id: LIFT.id, sets: [
      doneSet(60, 8), doneSet(60, 8), doneSet(60, 8),
    ] }] } }
    expect(volume(S).chest).toMatchObject({ done: 0, projected: 8, verdict: 'below' })
  })

  it('counts an Active workout from earlier this week as done but still projects today\'s routine', () => {
    const S = { ...monWedFri(), active: { name: 'Push', d: '2026-06-30', start: NOW - DAY, entries: [{ id: LIFT.id, sets: [
      doneSet(60, 8), doneSet(60, 8),
    ] }] } }
    expect(volume(S).chest).toMatchObject({ done: 2, projected: 10, verdict: 'in' })
  })

  it('has no projection when the week schedule only names routines that no longer exist', () => {
    const S = { routines: [push], week: [null, 'gone', null, 'gone', null, 'gone', null], workouts: [
      workoutAt(LIFT.id, 1, Array.from({ length: 10 }, () => doneSet(60, 8))),
    ] }
    expect(volume(S).chest).toMatchObject({ done: 10, projected: null, verdict: 'in' })
  })

  it('on Sunday counts the whole week from Monday and projects only Sunday\'s routine', () => {
    const SUNDAY = NOW + 4 * DAY
    const S = { ...monWedFri(), week: ['push', 'push', null, null, null, null, null], workouts: [
      { ...workoutAt(LIFT.id, -4, [doneSet(60, 8)]), d: '2026-06-29' },
      { ...workoutAt(LIFT.id, -3, [doneSet(60, 8), doneSet(60, 8)]), d: '2026-07-04' },
    ] }
    expect(volume(S, SUNDAY).chest).toMatchObject({ done: 3, projected: 7 })
    S.workouts.push({ ...workoutAt(LIFT.id, -5, [doneSet(60, 8)]), d: '2026-07-05' })
    expect(volume(S, SUNDAY).chest).toMatchObject({ done: 4, projected: 4 })
  })

  it('on Monday starts a fresh week: last week\'s workouts are not counted', () => {
    const NEXT_MONDAY = NOW + 5 * DAY
    const S = { ...monWedFri(), workouts: [
      workoutAt(LIFT.id, 0, Array.from({ length: 6 }, () => doneSet(60, 8))),
      { ...workoutAt(LIFT.id, -4, Array.from({ length: 6 }, () => doneSet(60, 8))), d: '2026-07-05' },
    ] }
    expect(volume(S, NEXT_MONDAY).chest).toMatchObject({ done: 0, projected: 12, verdict: 'in' })
  })
})

describe('training styles and range edits', () => {
  const ranges = S => Object.fromEntries(Object.entries(selectStatsOverview(S, { now: NOW, catalogue }).weeklyVolume.muscles)
    .map(([slug, m]) => [slug, m.range]))

  it('Low volume builds the ranges around the research minimum', () => {
    const r = ranges({ workouts: [], trainingStyle: 'low' })
    expect(r).toMatchObject({
      chest: [4, 10], lats: [4, 10], 'upper-back': [3, 8], 'front-delts': [0, 6], 'side-delts': [4, 10],
      'rear-delts': [3, 8], biceps: [3, 8], triceps: [3, 8], quadriceps: [4, 10], hamstring: [3, 8],
      gluteal: [2, 8], calves: [4, 8], abs: [3, 8], trapezius: null,
    })
  })

  it('High volume stretches every range', () => {
    const r = ranges({ workouts: [], trainingStyle: 'high' })
    expect(r).toMatchObject({
      chest: [14, 26], lats: [14, 26], 'upper-back': [10, 22], 'front-delts': [0, 16], 'side-delts': [12, 26],
      'rear-delts': [10, 22], biceps: [12, 22], triceps: [10, 20], quadriceps: [12, 22], hamstring: [10, 20],
      gluteal: [8, 20], calves: [12, 20], abs: [10, 20], trapezius: null,
    })
  })

  it('Standard is the style when none is set, or the stored one is unknown', () => {
    expect(ranges({ workouts: [], trainingStyle: 'standard' }).chest).toEqual([10, 20])
    expect(ranges({ workouts: [], trainingStyle: 'extreme' }).chest).toEqual([10, 20])
  })

  it('a lighter style reads the same sets as in range', () => {
    const S = { workouts: [workoutAt(LIFT.id, 1, Array.from({ length: 6 }, () => doneSet(60, 8)))] }
    expect(selectStatsOverview(S, { now: NOW, catalogue }).weeklyVolume.muscles.chest.verdict).toBe('below')
    expect(selectStatsOverview({ ...S, trainingStyle: 'low' }, { now: NOW, catalogue }).weeklyVolume.muscles.chest.verdict).toBe('in')
  })

  it('an edited range applies on top of the style and is marked as edited', () => {
    const S = { workouts: [workoutAt(LIFT.id, 1, Array.from({ length: 6 }, () => doneSet(60, 8)))], trainingStyle: 'high' }
    setVolumeRange(S, 'chest', [4, 8])
    const { chest, lats } = selectStatsOverview(S, { now: NOW, catalogue }).weeklyVolume.muscles
    expect(chest).toMatchObject({ done: 6, range: [4, 8], verdict: 'in', edited: true })
    expect(lats).toMatchObject({ range: [14, 26], edited: false })
  })

  it('an edit equal to the style range is not an edit', () => {
    const S = { workouts: [] }
    setVolumeRange(S, 'chest', [8, 12])
    setVolumeRange(S, 'chest', [10, 20])
    expect(selectStatsOverview(S, { now: NOW, catalogue }).weeklyVolume.muscles.chest).toMatchObject({ range: [10, 20], edited: false })
  })

  it('ignores stored edits that are not whole numbers from 0 to 40 with the low end at most the high end', () => {
    const S = { workouts: [], volumeRanges: {
      chest: [12, 8], lats: [-1, 10], 'upper-back': [5, 41], biceps: [2.5, 9], triceps: '4-8',
      quadriceps: [4], trapezius: [2, 6], calves: [0, 40],
    } }
    const m = selectStatsOverview(S, { now: NOW, catalogue }).weeklyVolume.muscles
    for (const slug of ['chest', 'lats', 'upper-back', 'biceps', 'triceps', 'quadriceps']) expect(m[slug].edited).toBe(false)
    expect(m.trapezius).toMatchObject({ range: null, verdict: null, edited: false })
    expect(m.calves).toMatchObject({ range: [0, 40], edited: true })
  })

  it('switching style clears every edit', () => {
    const S = { workouts: [] }
    setVolumeRange(S, 'chest', [4, 8])
    setVolumeRange(S, 'biceps', [2, 6])
    switchTrainingStyle(S, 'low')
    const m = selectStatsOverview(S, { now: NOW, catalogue }).weeklyVolume.muscles
    expect(m.chest).toMatchObject({ range: [4, 10], edited: false })
    expect(m.biceps).toMatchObject({ range: [3, 8], edited: false })
  })

  it('going back to the style\'s ranges keeps the style and clears the edits', () => {
    const S = { workouts: [], trainingStyle: 'high' }
    setVolumeRange(S, 'chest', [4, 8])
    clearVolumeRanges(S)
    expect(selectStatsOverview(S, { now: NOW, catalogue }).weeklyVolume.muscles.chest).toMatchObject({ range: [14, 26], edited: false })
  })
})

describe('a Set stamped in another unit from its Entry', () => {
  it('reads the row from its own stamp in the exercise points', () => {
    const S = { unit: 'kg', workouts: [workoutAt(LIFT.id, 2, [doneSet(100, 5, { unit: 'lb' })], { unit: 'kg' })] }
    S.workouts[0].entries[0].unit = 'kg'
    const [point] = selectExerciseStats(S, LIFT.id, { now: NOW, catalogue }).points
    expect(point.sets[0].w).toBe(45.4)
  })
})
