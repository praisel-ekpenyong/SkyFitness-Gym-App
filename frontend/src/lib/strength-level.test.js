import { describe, it, expect } from 'vitest'
import { selectStatsOverview, selectExerciseStats } from './stats-selectors.js'
import { best1RM } from './training-log.js'
import { switchUnit } from './units.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 6, 1, 12)

const SQUAT = { id: '0043', n: 'barbell full squat', bp: 'upper legs', eq: 'barbell', tg: 'glutes', mg: 'quadriceps', sm: [] }
const BENCH_NOT_GRADED = { id: 'lift', n: 'Cable fly', bp: 'chest', tg: 'pectorals', sm: [], eq: 'cable' }
const catalogue = { lookup: id => (id === SQUAT.id ? SQUAT : id === BENCH_NOT_GRADED.id ? BENCH_NOT_GRADED : null) }

const isoAgo = ageDays => new Date(NOW - ageDays * DAY).toISOString().slice(0, 10)
const session = (id, ageDays, sets, extra = {}) => ({
  id: `w-${id}-${ageDays}`,
  d: isoAgo(ageDays),
  start: NOW - ageDays * DAY,
  entries: [{ id, sets }],
  ...extra,
})
const single = (w, extra = {}) => ({ done: true, w, r: 1, ...extra })
const weighIn = (ageDays, w) => ({ d: isoAgo(ageDays), w })
const profile = (over = {}) => ({
  unit: 'kg',
  sex: 'male',
  effort: 'none',
  bodyweight: [weighIn(5, 80)],
  workouts: [],
  ...over,
})

const overviewOf = S => selectStatsOverview(S, { now: NOW, catalogue })
const liftOf = (S, key = 'squat') => overviewOf(S).strengthLevels.lifts.find(l => l.key === key)

describe('strength levels: reasons', () => {
  it('asks for sex and shows no levels when sex is not set', () => {
    const S = profile({ sex: undefined, workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })] })
    const reading = overviewOf(S).strengthLevels
    expect(reading.reason).toBe('sex')
    expect(reading.lifts.every(l => l.current === null && l.peak === null && l.next === null)).toBe(true)
  })

  it('asks for a weigh-in when no body weight is logged anywhere', () => {
    const S = profile({ bodyweight: [], workouts: [session(SQUAT.id, 10, [single(120)])] })
    expect(overviewOf(S).strengthLevels.reason).toBe('weighIn')
  })
})

describe('strength levels: body weight per workout', () => {
  it('grades a lift from the workout own weigh-in before the log', () => {
    const S = profile({
      bodyweight: [weighIn(5, 100)],
      workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })],
    })
    expect(liftOf(S).current).toEqual({ level: 'Intermediate', ratio: 1.5 })
  })

  it('grades a workout without a weigh-in from a log entry within 30 days', () => {
    const S = profile({
      bodyweight: [weighIn(5, 80)],
      workouts: [session(SQUAT.id, 10, [single(120)])],
    })
    expect(liftOf(S).current).toEqual({ level: 'Intermediate', ratio: 1.5 })
  })

  it('skips a workout with no body weight within 30 days', () => {
    const S = profile({
      bodyweight: [weighIn(45, 80)],
      workouts: [session(SQUAT.id, 10, [single(120)])],
    })
    const lift = liftOf(S)
    expect(lift.current).toBeNull()
    expect(lift.peak).toBeNull()
  })
})

describe('strength levels: current, peak and untrained', () => {
  it('takes the current level from the last 12 weeks and shows an older higher peak beside it', () => {
    const S = profile({
      workouts: [
        session(SQUAT.id, 100, [single(120)], { bw: 80 }),
        session(SQUAT.id, 10, [single(100)], { bw: 80 }),
      ],
    })
    const lift = liftOf(S)
    expect(lift.current).toEqual({ level: 'Novice', ratio: 1.25 })
    expect(lift.peak).toEqual({ level: 'Intermediate', ratio: 1.5 })
    expect(lift.trainedLately).toBe(true)
  })

  it('flags a lift trained long ago with no body weight on its sessions as ever trained, with no peak', () => {
    const S = profile({ bodyweight: [], workouts: [session(SQUAT.id, 100, [single(120)])] })
    const lift = liftOf(S)
    expect(lift.everTrained).toBe(true)
    expect(lift.trainedLately).toBe(false)
    expect(lift.peak).toBeNull()
    expect(lift.current).toBeNull()
  })

  it('flags a lift with no sessions at all as never trained', () => {
    const lift = liftOf(profile({ workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })] }), 'bench')
    expect(lift.everTrained).toBe(false)
  })

  it('shows only the peak for a lift not trained in 12 weeks', () => {
    const S = profile({ workouts: [session(SQUAT.id, 100, [single(120)], { bw: 80 })] })
    const lift = liftOf(S)
    expect(lift.trainedLately).toBe(false)
    expect(lift.current).toBeNull()
    expect(lift.peak).toEqual({ level: 'Intermediate', ratio: 1.5 })
  })

  it('never grades a set above 12 reps', () => {
    const S = profile({ workouts: [session(SQUAT.id, 10, [single(100, { r: 13 })], { bw: 80 })] })
    const lift = liftOf(S)
    expect(lift.current).toBeNull()
    expect(lift.peak).toBeNull()
  })

  it('grades all four squat catalogue ids as one lift', () => {
    const squatIds = ['0043', '1461', '1462', '1436']
    const S = profile({
      workouts: squatIds.map((id, i) => session(id, 10 + i * 5, [single(100)], { bw: 80 })),
    })
    const squats = overviewOf(S).strengthLevels.lifts.filter(l => l.key === 'squat')
    expect(squats).toHaveLength(1)
    expect(squats[0].current).toEqual({ level: 'Novice', ratio: 1.25 })
  })
})

describe('strength levels: sex tables', () => {
  it('uses the women table for a female profile', () => {
    const S = profile({
      sex: 'female',
      workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })],
    })
    expect(liftOf(S).current).toEqual({ level: 'Advanced', ratio: 1.5 })
  })

  it('uses the men table for a male profile on the same lift', () => {
    const S = profile({
      workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })],
    })
    expect(liftOf(S).current).toEqual({ level: 'Intermediate', ratio: 1.5 })
  })
})

describe('strength levels: thresholds and next level', () => {
  it('counts a ratio exactly on a threshold as that level', () => {
    const S = profile({ workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })] })
    expect(liftOf(S).current.level).toBe('Intermediate')
  })

  it('reports the weight that reaches the next level, rounded up to a loadable step', () => {
    const S = profile({
      bodyweight: [weighIn(5, 81)],
      workouts: [session(SQUAT.id, 10, [single(100)], { bw: 80 })],
    })
    expect(liftOf(S).next).toEqual({ level: 'Intermediate', weight: 122.5 })
  })

  it('has no next level at Elite', () => {
    const S = profile({ workouts: [session(SQUAT.id, 10, [single(240)], { bw: 80 })] })
    const lift = liftOf(S)
    expect(lift.current).toEqual({ level: 'Elite', ratio: 3 })
    expect(lift.next).toBeNull()
  })

  it('gives a pounds profile the same level and a next-level weight in pounds', () => {
    const kg = liftOf(profile({ workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })] }))
    const lb = liftOf(profile({
      unit: 'lb',
      bodyweight: [weighIn(5, 176)],
      workouts: [session(SQUAT.id, 10, [single(264)])],
    }))
    expect(lb.current.level).toBe(kg.current.level)
    expect(lb.next).toEqual({ level: 'Advanced', weight: 400 })
  })

  it('grades the same after a switch to pounds: stamped Weigh-ins and Session body weight read converted (ADR 0031)', () => {
    const kg = liftOf(profile({ workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80, unit: 'kg' })] }))
    const fromWorkout = liftOf(profile({
      unit: 'lb',
      bodyweight: [],
      workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80, unit: 'kg' })],
    }))
    const fromLog = liftOf(profile({
      unit: 'lb',
      bodyweight: [{ ...weighIn(5, 80), unit: 'kg' }],
      workouts: [session(SQUAT.id, 10, [single(120)], { unit: 'kg' })],
    }))
    expect(fromWorkout.current).toEqual(kg.current)
    expect(fromLog.current).toEqual(kg.current)
  })
})

describe('strength levels: read from the Training log', () => {
  it('grades from the Training log estimate after a switch to pounds, across the lift exercises of one Workout', () => {
    const S = profile({
      bodyweight: [],
      workouts: [{
        ...session(SQUAT.id, 10, [{ done: true, w: 100, r: 5 }], { bw: 80 }),
        entries: [
          { id: SQUAT.id, sets: [{ done: true, w: 100, r: 5 }] },
          { id: '1461', sets: [{ done: true, w: 225, r: 3, unit: 'lb' }] },
        ],
      }],
    })
    expect(switchUnit(S, 'lb')).toBe(true)
    const estimate = Math.max(best1RM(S, SQUAT.id).est, best1RM(S, '1461').est)
    expect(estimate).toBe(257.3)
    const bodyweightThen = 176.4 // the Workout's 80 kg, read in pounds
    const lift = liftOf(S)
    expect(lift.current).toEqual({ level: 'Novice', ratio: Math.round(estimate / bodyweightThen * 100) / 100 })
    expect(lift.peak).toEqual(lift.current)
  })
})

describe('strength levels: exercise stats', () => {
  it('returns the level for a graded lift', () => {
    const S = profile({ workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })] })
    const stats = selectExerciseStats(S, SQUAT.id, { now: NOW, catalogue })
    expect(stats.strength.current).toEqual({ level: 'Intermediate', ratio: 1.5 })
  })

  it('returns no strength reading for an exercise that is not graded', () => {
    const S = profile({ workouts: [session(BENCH_NOT_GRADED.id, 10, [single(60)], { bw: 80 })] })
    const stats = selectExerciseStats(S, BENCH_NOT_GRADED.id, { now: NOW, catalogue })
    expect(stats.strength).toBeNull()
  })

  it('shows the squat level on any squat catalogue id', () => {
    const HIGH_BAR = { ...SQUAT, id: '1461', n: 'barbell high bar squat' }
    const squatCatalogue = { lookup: id => (id === HIGH_BAR.id ? HIGH_BAR : catalogue.lookup(id)) }
    const S = profile({ workouts: [session(HIGH_BAR.id, 10, [single(120)], { bw: 80 })] })
    const stats = selectExerciseStats(S, HIGH_BAR.id, { now: NOW, catalogue: squatCatalogue })
    expect(stats.strength.current).toEqual({ level: 'Intermediate', ratio: 1.5 })
  })

  it('gives the sex reason and no levels when sex is not set', () => {
    const S = profile({ sex: undefined, workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })] })
    const stats = selectExerciseStats(S, SQUAT.id, { now: NOW, catalogue })
    expect(stats.strength.reason).toBe('sex')
    expect(stats.strength.current).toBeNull()
    expect(stats.strength.peak).toBeNull()
  })

  it('gives the next level from a workout weigh-in when the body-weight log is empty', () => {
    const S = profile({ bodyweight: [], workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })] })
    expect(liftOf(S).next).toEqual({ level: 'Advanced', weight: 180 })
  })

  it('takes the next level from the most recent weigh-in across the log and workouts', () => {
    const S = profile({
      bodyweight: [weighIn(20, 100)],
      workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })],
    })
    expect(liftOf(S).next).toEqual({ level: 'Advanced', weight: 180 })
  })

  it('takes the next level from a newer log entry over an older workout weigh-in', () => {
    const S = profile({
      bodyweight: [weighIn(5, 81)],
      workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })],
    })
    expect(liftOf(S).next).toEqual({ level: 'Advanced', weight: 182.5 })
  })

  it('gives the weigh-in reason when no body weight is logged anywhere', () => {
    const S = profile({ bodyweight: [], workouts: [session(SQUAT.id, 10, [single(120)])] })
    const stats = selectExerciseStats(S, SQUAT.id, { now: NOW, catalogue })
    expect(stats.strength.reason).toBe('weighIn')
    expect(stats.strength.current).toBeNull()
  })

  it('marks a lift not trained in 12 weeks as not trained lately and keeps its peak', () => {
    const S = profile({ workouts: [session(SQUAT.id, 100, [single(120)], { bw: 80 })] })
    const stats = selectExerciseStats(S, SQUAT.id, { now: NOW, catalogue })
    expect(stats.strength.trainedLately).toBe(false)
    expect(stats.strength.current).toBeNull()
    expect(stats.strength.peak).toEqual({ level: 'Intermediate', ratio: 1.5 })
  })

  it('gives the next level and its weight from the latest weigh-in', () => {
    const S = profile({ workouts: [session(SQUAT.id, 10, [single(120)], { bw: 80 })] })
    const stats = selectExerciseStats(S, SQUAT.id, { now: NOW, catalogue })
    expect(stats.strength.next).toEqual({ level: 'Advanced', weight: 180 })
  })
})

describe('strength levels: age adjustment', () => {
  it('leaves the thresholds unchanged at age 40', () => {
    const S = profile({ bodyweight: [weighIn(5, 100)], birthYear: 1986, workouts: [session(SQUAT.id, 10, [single(150)], { bw: 100 })] })
    expect(liftOf(S).current).toEqual({ level: 'Intermediate', ratio: 1.5 })
    expect(liftOf(S).next).toEqual({ level: 'Advanced', weight: 225 })
  })

  it('divides the thresholds by the age-60 coefficient of 1.30', () => {
    const S = profile({ bodyweight: [weighIn(5, 100)], birthYear: 1966, workouts: [session(SQUAT.id, 10, [single(120)], { bw: 100 })] })
    expect(liftOf(S).current).toEqual({ level: 'Intermediate', ratio: 1.2 })
    expect(liftOf(S).next).toEqual({ level: 'Advanced', weight: 175 })
  })

  it('interpolates the coefficient between the age-40 and age-45 rows', () => {
    const S = profile({ bodyweight: [weighIn(5, 100)], birthYear: 1984, workouts: [session(SQUAT.id, 10, [single(150)], { bw: 100 })] })
    expect(liftOf(S).next).toEqual({ level: 'Advanced', weight: 220 })
  })

  it('caps the coefficient at age 80 and above', () => {
    const S = profile({ bodyweight: [weighIn(5, 100)], birthYear: 1930, workouts: [session(SQUAT.id, 10, [single(100)], { bw: 100 })] })
    expect(liftOf(S).current).toEqual({ level: 'Intermediate', ratio: 1 })
    expect(liftOf(S).next).toEqual({ level: 'Advanced', weight: 112.5 })
  })

  it('does not adjust under 40', () => {
    const S = profile({ bodyweight: [weighIn(5, 100)], birthYear: 1990, workouts: [session(SQUAT.id, 10, [single(150)], { bw: 100 })] })
    expect(liftOf(S).next).toEqual({ level: 'Advanced', weight: 225 })
  })

  it('does not adjust without a birth year', () => {
    const S = profile({ bodyweight: [weighIn(5, 100)], workouts: [session(SQUAT.id, 10, [single(120)], { bw: 100 })] })
    expect(liftOf(S).current).toEqual({ level: 'Beginner', ratio: 1.2 })
    expect(liftOf(S).next).toEqual({ level: 'Novice', weight: 125 })
  })
})
