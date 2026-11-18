import { describe, it, expect } from 'vitest'
import { selectStatsOverview, selectExerciseStats } from './stats-selectors.js'

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
})
