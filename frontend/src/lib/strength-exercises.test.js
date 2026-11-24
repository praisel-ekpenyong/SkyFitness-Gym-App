import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { strengthExerciseRowsForMuscle, primaryMuscleOf } from './strength-exercises.js'
import { loadOfWorkouts } from './muscles.js'
import { registerCustom } from './exercises.js'
import { isoOf } from './dates.js'

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
  const iso = isoOf(d)
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
    expect(flyRow.primary).toBe('front-delts')
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

  it('leaves out exercises with no performed, loaded Work set', () => {
    const S = unitState([workout(3, [bench, squat]), workout(2, [undone, noLoad])])
    expect(strengthExerciseRowsForMuscle(S, NOW, 'upper-back')).toEqual([])
    expect(strengthExerciseRowsForMuscle(S, NOW, 'chest').map(r => r.id)).toEqual(['bench'])
    expect(strengthExerciseRowsForMuscle(S, NOW, 'quadriceps').map(r => r.id)).toEqual(['squat'])
  })

  it('returns nothing for a muscle nothing trains', () => {
    const S = unitState([workout(3, [bench])])
    expect(strengthExerciseRowsForMuscle(S, NOW, 'biceps')).toEqual([])
  })
})

describe('strengthExerciseRowsForMuscle: decay and units', () => {
  it('applies the exercise own decay, read from its latest Work set', () => {
    const S = unitState([workout(30, [bench]), workout(3, [fly])])
    const benchRow = strengthExerciseRowsForMuscle(S, NOW, 'chest').find(r => r.id === 'bench')
    const benchDecay = 0.5 ** (16 / 28)
    expect(benchRow.decay).toBeCloseTo(benchDecay, 4)
    expect(benchRow.current).toBeCloseTo(Math.round(102 * benchDecay * 10) / 10, 2)
  })

  it('yields 1.0 strength retention for future-dated sets', () => {
    const S = unitState([workout(-2, [bench])])
    const [row] = strengthExerciseRowsForMuscle(S, NOW, 'chest')
    expect(row.decay).toBe(1)
    expect(row.current).toBe(102)
  })

  it('reads the estimated 1RM in the Profile unit', () => {
    const entryLb = { id: 'bench', sets: [{ phase: 'work', w: 220.462, r: 1, done: true, unit: 'lb' }] }
    const [row] = strengthExerciseRowsForMuscle({ unit: 'kg', workouts: [workout(3, [entryLb])] }, NOW, 'chest')
    expect(row.est).toBe(100)
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
