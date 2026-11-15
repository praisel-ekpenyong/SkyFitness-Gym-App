import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { strengthExerciseRows, strengthExerciseRowsForMuscle, primaryMuscleOf } from './strength-exercises.js'
import { loadOfWorkouts } from './muscles.js'
import { registerCustom } from './exercises.js'

const DAY = 86400000
const NOW = Date.UTC(2026, 7, 8, 12)

const CUSTOMS = [
  { id: 'bench', n: 'Bench Press', tg: 'chest', mg: 'triceps', sm: ['deltoids'] },
  { id: 'squat', n: 'Squat', tg: 'quadriceps', mg: 'glutes' },
  { id: 'fly', n: 'Cable Crossovers', tg: 'deltoids', mg: 'chest' },
  { id: 'pushdown', n: 'Triceps Pushdown', tg: 'triceps' },
  { id: 'undone', n: 'Undone Lift', tg: 'upper-back' },
  { id: 'stretch', n: 'Chest Stretch', tg: 'chest' },
]

beforeEach(() => registerCustom(CUSTOMS))
afterEach(() => registerCustom([]))

function workout(dayAgo, entries) {
  const d = new Date(NOW - dayAgo * DAY)
  const iso = d.toISOString().slice(0, 10)
  return { id: 'x' + iso, d: iso, start: NOW - dayAgo * DAY, unit: 'kg', entries }
}

const bench = { id: 'bench', n: 'Bench Press', muscleWeights: { chest: 1, triceps: 0.4, deltoids: 0.4 }, sets: [
  { phase: 'warmup', w: 40, r: 8, done: true, unit: 'kg' },
  { phase: 'work', w: 80, r: 8, done: true, unit: 'kg' },
  { phase: 'work', w: 85, r: 6, done: true, unit: 'kg' },
] }

const squat = { id: 'squat', n: 'Squat', muscleWeights: { quadriceps: 1, glutes: 0.4 }, sets: [
  { phase: 'work', w: 100, r: 5, done: true, unit: 'kg' },
] }

const fly = { id: 'fly', n: 'Cable Crossovers', muscleWeights: { chest: 0.4, deltoids: 1 }, sets: [
  { phase: 'work', w: 20, r: 12, done: true, unit: 'kg' },
] }

const pushdown = { id: 'pushdown', n: 'Triceps Pushdown', muscleWeights: { triceps: 1 }, sets: [
  { phase: 'work', w: 30, r: 10, done: true, unit: 'kg' },
] }

const undone = { id: 'undone', n: 'Undone Lift', muscleWeights: { 'upper-back': 1 }, sets: [
  { phase: 'work', w: 200, r: 5, done: false, unit: 'kg' },
] }

const noLoad = { id: 'stretch', n: 'Chest Stretch', muscleWeights: { chest: 0.4 }, sets: [
  { phase: 'work', w: 0, r: 10, done: true },
] }

const unitState = (workouts) => ({ unit: 'kg', workouts })

describe('strengthExerciseRows', () => {
  it('lists every exercise with an estimate, warm-ups excluded, sorted by expected current 1RM', () => {
    const S = unitState([
      workout(3, [bench]),
      workout(30, [squat]),
      workout(3, [fly, pushdown]),
      workout(2, [undone, noLoad]),
    ])
    const rows = strengthExerciseRows(S, NOW)
    expect(rows.map(r => r.id).sort()).toEqual(['bench', 'fly', 'pushdown', 'squat'])
    expect(rows[0].id).toBe('bench')
    expect(rows.at(-1).id).toBe('fly')
  })

  it('keeps warm-up sets out of the estimate and reports the date of the best work set', () => {
    const S = unitState([workout(3, [bench])])
    const rows = strengthExerciseRows(S, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0].est).toBe(102)
    expect(rows[0].estDate).toBe('2026-08-05')
    expect(rows[0].primary).toBe('chest')
  })

  it('resolves real exercise names from the catalogue even when entries lack a name snapshot', () => {
    const nameless = { id: 'bench', sets: bench.sets }
    const S = unitState([workout(3, [nameless])])
    const rows = strengthExerciseRows(S, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Bench Press')
    expect(rows[0].id).toBe('bench')
    const muscleRows = strengthExerciseRowsForMuscle(S, NOW, 'chest')
    expect(muscleRows[0].name).toBe('Bench Press')
  })

  it('uses nested exercise snapshots for a deleted custom exercise', () => {
    const deleted = {
      id: 'deleted-custom',
      muscleSnapshot: { n: 'Deleted custom', muscleWeights: { chest: 1 } },
      sets: [{ phase: 'work', warmup: true, w: 80, r: 8, done: true, unit: 'kg' }],
    }
    const S = unitState([workout(3, [deleted])])
    const rows = strengthExerciseRows(S, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'deleted-custom', name: 'Deleted custom', primary: 'chest', est: 101.3 })
    expect(strengthExerciseRowsForMuscle(S, NOW, 'chest')[0].name).toBe('Deleted custom')
  })

  it('applies the exercise own decay to the expected current 1RM', () => {
    const S = unitState([workout(3, [bench]), workout(30, [squat])])
    const rows = strengthExerciseRows(S, NOW)
    const benchRow = rows.find(r => r.id === 'bench')
    const squatRow = rows.find(r => r.id === 'squat')
    expect(benchRow.decay).toBe(1)
    expect(benchRow.current).toBe(102)
    const squatDecay = 0.5 ** (16 / 28)
    expect(squatRow.decay).toBeCloseTo(squatDecay, 4)
    expect(squatRow.current).toBeCloseTo(Math.round(116.7 * squatDecay * 10) / 10, 2)
  })

  it('keeps the exercise own decay even when its muscle is kept fresh by other work', () => {
    const S = unitState([workout(30, [bench]), workout(3, [fly])])
    const rows = strengthExerciseRows(S, NOW)
    const benchRow = rows.find(r => r.id === 'bench')
    const benchDecay = 0.5 ** (16 / 28)
    expect(benchRow.decay).toBeCloseTo(benchDecay, 4)
    expect(benchRow.current).toBeCloseTo(Math.round(102 * benchDecay * 10) / 10, 2)
  })

  it('yields 1.0 strength retention for future-dated workout sets', () => {
    const futureWorkout = {
      id: 'w-future',
      d: new Date(NOW + 2 * DAY).toISOString().slice(0, 10),
      start: NOW + 2 * DAY,
      unit: 'kg',
      entries: [bench],
    }
    const S = unitState([futureWorkout])
    const rows = strengthExerciseRows(S, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0].decay).toBe(1)
    expect(rows[0].current).toBe(102)
  })
})

describe('strengthExerciseRowsForMuscle', () => {
  it('lists primary and secondary exercises for the tapped muscle, with that muscle decay', () => {
    const S = unitState([workout(3, [bench, fly, pushdown])])
    const rows = strengthExerciseRowsForMuscle(S, NOW, 'chest')
    expect(rows.map(r => r.id).sort()).toEqual(['bench', 'fly'])
    const benchRow = rows.find(r => r.id === 'bench')
    const flyRow = rows.find(r => r.id === 'fly')
    expect(benchRow.weight).toBe(1)
    expect(benchRow.primary).toBe('chest')
    expect(flyRow.weight).toBe(0.4)
    expect(flyRow.primary).toBe('deltoids')
    expect(flyRow.decay).toBe(1)
    expect(flyRow.current).toBe(28)
  })

  it('the tapped muscle filters the list; the row decay stays the exercise own', () => {
    const S = unitState([workout(3, [bench]), workout(30, [fly])])
    const rows = strengthExerciseRowsForMuscle(S, NOW, 'triceps')
    const benchRow = rows.find(r => r.id === 'bench')
    expect(benchRow.weight).toBe(0.4)
    expect(benchRow.primary).toBe('chest')
    expect(benchRow.decay).toBe(1)
    expect(benchRow.current).toBe(102)
  })

  it('returns nothing for a muscle nothing trains', () => {
    const S = unitState([workout(3, [bench])])
    expect(strengthExerciseRowsForMuscle(S, NOW, 'biceps')).toEqual([])
  })
})

describe('primaryMuscleOf', () => {
  it('prefers the catalogue, then the logged snapshot, and handles missing metadata', () => {
    expect(primaryMuscleOf({ id: 'bench', muscleWeights: {} }).slug).toBe('chest')
    expect(primaryMuscleOf({ muscleWeights: { chest: 1, triceps: 0.4 } }).slug).toBe('chest')
    expect(primaryMuscleOf({ tg: 'back', mg: 'biceps' }).slug).toBe('upper-back')
    expect(primaryMuscleOf({})).toBeNull()
    expect(primaryMuscleOf(null)).toBeNull()
  })

  it('reads the same entry weights the body map reads', () => {
    const entry = {
      id: 'gone',
      muscleSnapshot: { muscleWeights: { chest: 1, hands: 3 } },
      sets: [{ done: true, w: 60, r: 8 }],
    }
    expect(primaryMuscleOf(entry).slug).toBe('chest')
    expect(loadOfWorkouts([{ entries: [entry] }]).chest).toBe(1)
  })
})

describe('strengthExerciseRows unit normalization (ADR 0017)', () => {
  it('normalizes estimated 1RM to profile unit (kg)', () => {
    const entryLb = {
      id: 'bench',
      sets: [{ phase: 'work', w: 220.462, r: 1, done: true, unit: 'lb' }],
    }
    const S = {
      unit: 'kg',
      workouts: [workout(3, [entryLb])],
    }
    const rows = strengthExerciseRows(S, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0].est).toBe(100)
    expect(rows[0].current).toBe(100)
  })

  it('normalizes estimated 1RM to profile unit (lb)', () => {
    const entryKg = {
      id: 'bench',
      sets: [{ phase: 'work', w: 100, r: 1, done: true, unit: 'kg' }],
    }
    const S = {
      unit: 'lb',
      workouts: [workout(3, [entryKg])],
    }
    const rows = strengthExerciseRows(S, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0].est).toBe(220.5)
    expect(rows[0].current).toBe(220.5)
  })
})

