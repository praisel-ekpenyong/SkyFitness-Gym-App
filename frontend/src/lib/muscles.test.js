import { describe, expect, it } from 'vitest'
import { EXIDX, EXDB, smOf } from './exercises.js'
import { loadOfWorkouts, musclesOf } from './muscles.js'

// The catalogue keeps the source dataset's secondary-muscle spellings; musclesOf maps
// those aliases to the canonical body-map slugs and applies the 0.4 support weight.
describe('catalogue secondary muscles', () => {
  it('maps a bench press to chest, triceps and deltoids', () => {
    expect(musclesOf(EXIDX['0025'])).toMatchObject({
      chest: 1,
      triceps: 0.4,
      deltoids: 0.4,
    })
  })

  it('maps a squat to glutes, quads and hamstrings', () => {
    expect(musclesOf(EXIDX['0043'])).toMatchObject({
      gluteal: 1,
      quadriceps: 0.4,
      hamstring: 0.4,
    })
  })

  it('maps common row variations to the upper back, biceps and rear deltoids', () => {
    for (const id of ['0027', '0293', '0499', '0861']) {
      expect(musclesOf(EXIDX[id])).toMatchObject({
        'upper-back': 1,
        biceps: 0.4,
        deltoids: 0.4,
      })
    }
  })
})


describe('catalogue secondary additions', () => {
  it('enriches the muscle map without mutating the raw dataset', () => {
    const raw = EXDB.find(e => e.id === '0027')
    expect(raw.sm).not.toContain('rear deltoids')
    expect(smOf(raw)).toContain('rear deltoids')
    // the alias collapses onto the deltoids slug in the canonical muscle map
    expect(musclesOf(raw)).toHaveProperty('deltoids')
  })
})


describe('map load with warm-up phases', () => {
  it('excludes warm-up sets from the by-sets-worked map', () => {
    const w = {
      id: 'w1', d: '2026-08-01', start: Date.UTC(2026, 7, 1, 10), unit: 'kg',
      entries: [{
        id: '0025',
        sets: [
          { done: true, phase: 'warmup', w: 20, r: 8 },
          { done: true, phase: 'work', w: 60, r: 8 },
        ],
      }],
    }
    const load = loadOfWorkouts([w], null)
    expect(load.chest).toBe(1)
  })
})

describe('canonical muscle filter taxonomy & extraction helpers', () => {
  it('defines FILTER_MUSCLES with 18 anatomical muscles in head-to-toe order plus cardio', async () => {
    const { MUSCLES, FILTER_MUSCLES, MUSCLE_NAME } = await import('./muscles.js')
    expect(FILTER_MUSCLES).toHaveLength(19)
    expect(FILTER_MUSCLES.slice(0, 18)).toEqual(MUSCLES)
    expect(FILTER_MUSCLES[18]).toBe('cardio')
    FILTER_MUSCLES.forEach(slug => {
      expect(MUSCLE_NAME[slug]).toBeTruthy()
    })
  })

  it('correctly extracts primary muscle from catalogue exercises and custom exercises', async () => {
    const { primaryMuscleOf } = await import('./muscles.js')
    // Bench press -> chest
    expect(primaryMuscleOf(EXIDX['0025'])).toBe('chest')
    // Barbell row -> upper-back
    expect(primaryMuscleOf(EXIDX['0027'])).toBe('upper-back')
    // Squat -> gluteal
    expect(primaryMuscleOf(EXIDX['0043'])).toBe('gluteal')
    // Custom exercise with explicit tg
    expect(primaryMuscleOf({ id: 'c1', n: 'Incline Curl', tg: 'biceps', bp: 'upper arms' })).toBe('biceps')
    // Custom exercise with alias tg
    expect(primaryMuscleOf({ id: 'c2', n: 'Leg Extension', tg: 'quads', bp: 'upper legs' })).toBe('quadriceps')
    // Legacy custom exercise without tg falls back to first muscle in bodypart map
    expect(primaryMuscleOf({ id: 'c3', n: 'Pullup', bp: 'back' })).toBe('upper-back')
    expect(primaryMuscleOf({ id: 'c4', n: 'Bench', bp: 'chest' })).toBe('chest')
    // Cardio exercise
    expect(primaryMuscleOf({ id: 'c5', n: 'Treadmill', bp: 'cardio' })).toBe('cardio')
    expect(primaryMuscleOf({ id: 'c6', n: 'Running', tg: 'cardiovascular system', bp: 'cardio' })).toBe('cardio')
  })

  it('correctly extracts secondary muscles excluding the primary muscle', async () => {
    const { secondaryMusclesOf } = await import('./muscles.js')
    // Bench press (chest) -> triceps, deltoids
    const benchSm = secondaryMusclesOf(EXIDX['0025'])
    expect(benchSm).toContain('triceps')
    expect(benchSm).toContain('deltoids')
    expect(benchSm).not.toContain('chest')

    // Barbell row (upper-back) -> biceps, deltoids (via rear deltoids overlay)
    const rowSm = secondaryMusclesOf(EXIDX['0027'])
    expect(rowSm).toContain('biceps')
    expect(rowSm).toContain('deltoids')
    expect(rowSm).not.toContain('upper-back')

    // Squat (gluteal) -> quadriceps, hamstring
    const squatSm = secondaryMusclesOf(EXIDX['0043'])
    expect(squatSm).toContain('quadriceps')
    expect(squatSm).toContain('hamstring')
    expect(squatSm).not.toContain('gluteal')

    // Custom exercise with explicit sm array
    const customSm = secondaryMusclesOf({ id: 'c1', n: 'Hammer Curl', tg: 'biceps', sm: ['forearms', 'brachialis'] })
    expect(customSm).toEqual(['forearm'])

    // Cardio exercise has no secondary muscles
    expect(secondaryMusclesOf({ id: 'c5', bp: 'cardio' })).toEqual([])

    // Legacy custom exercise without explicit tg/sm falls back to secondary bodypart muscles
    const legacyBackSm = secondaryMusclesOf({ id: 'c3', bp: 'back' })
    expect(legacyBackSm).toContain('lower-back')
    expect(legacyBackSm).not.toContain('upper-back')
  })

  it('matches muscle filter for primary, secondary, and cardio movements', async () => {
    const { matchesMuscleFilter } = await import('./muscles.js')
    const bench = EXIDX['0025'] // tg: pectorals, sm: [triceps, deltoids]

    // Empty filter matches all
    expect(matchesMuscleFilter(bench, '')).toBe(true)
    expect(matchesMuscleFilter(bench, null)).toBe(true)

    // Matches primary
    expect(matchesMuscleFilter(bench, 'chest')).toBe(true)
    expect(matchesMuscleFilter(bench, 'pectorals')).toBe(true)

    // Matches secondary
    expect(matchesMuscleFilter(bench, 'triceps')).toBe(true)
    expect(matchesMuscleFilter(bench, 'deltoids')).toBe(true)
    expect(matchesMuscleFilter(bench, 'shoulders')).toBe(true)

    // Does not match unrelated muscles
    expect(matchesMuscleFilter(bench, 'biceps')).toBe(false)
    expect(matchesMuscleFilter(bench, 'quadriceps')).toBe(false)
    expect(matchesMuscleFilter(bench, 'cardio')).toBe(false)

    // Cardio exercise matches cardio
    const cardioEx = { id: 'c1', bp: 'cardio', tg: 'cardio' }
    expect(matchesMuscleFilter(cardioEx, 'cardio')).toBe(true)
    expect(matchesMuscleFilter(cardioEx, 'chest')).toBe(false)
  })

  it('derives legacy bodypart from canonical muscle group via bodypartForMuscle', async () => {
    const { bodypartForMuscle } = await import('./muscles.js')
    expect(bodypartForMuscle('trapezius')).toBe('neck')
    expect(bodypartForMuscle('traps')).toBe('neck')
    expect(bodypartForMuscle('deltoids')).toBe('shoulders')
    expect(bodypartForMuscle('chest')).toBe('chest')
    expect(bodypartForMuscle('upper-back')).toBe('back')
    expect(bodypartForMuscle('serratus')).toBe('chest')
    expect(bodypartForMuscle('biceps')).toBe('upper arms')
    expect(bodypartForMuscle('triceps')).toBe('upper arms')
    expect(bodypartForMuscle('forearm')).toBe('lower arms')
    expect(bodypartForMuscle('abs')).toBe('waist')
    expect(bodypartForMuscle('obliques')).toBe('waist')
    expect(bodypartForMuscle('lower-back')).toBe('back')
    expect(bodypartForMuscle('gluteal')).toBe('upper legs')
    expect(bodypartForMuscle('quadriceps')).toBe('upper legs')
    expect(bodypartForMuscle('hamstring')).toBe('upper legs')
    expect(bodypartForMuscle('adductors')).toBe('upper legs')
    expect(bodypartForMuscle('hip-flexors')).toBe('upper legs')
    expect(bodypartForMuscle('calves')).toBe('lower legs')
    expect(bodypartForMuscle('tibialis')).toBe('lower legs')
    expect(bodypartForMuscle('cardio')).toBe('cardio')
  })

  it('determines whether an exercise matched as a secondary muscle', async () => {
    const { isSecondaryMuscleMatch } = await import('./muscles.js')
    const bench = EXIDX['0025'] // primary: chest, secondary: triceps, deltoids

    // Bench press matches triceps and deltoids as secondary
    expect(isSecondaryMuscleMatch(bench, 'triceps')).toBe(true)
    expect(isSecondaryMuscleMatch(bench, 'deltoids')).toBe(true)
    expect(isSecondaryMuscleMatch(bench, 'shoulders')).toBe(true)
    expect(isSecondaryMuscleMatch('0025', 'triceps')).toBe(true)

    // Primary matches and unrelated muscles return false
    expect(isSecondaryMuscleMatch(bench, 'chest')).toBe(false)
    expect(isSecondaryMuscleMatch(bench, 'biceps')).toBe(false)
    expect(isSecondaryMuscleMatch(bench, 'cardio')).toBe(false)
    expect(isSecondaryMuscleMatch(bench, 'favorites')).toBe(false)
    expect(isSecondaryMuscleMatch(bench, '')).toBe(false)
  })

  it('matches keyword search across name, target, canonical muscles, secondary muscles, and equipment', async () => {
    const { matchesExerciseSearch } = await import('./muscles.js')
    const bench = EXIDX['0025'] // Barbell Bench Press (chest, triceps, deltoids, barbell)

    expect(matchesExerciseSearch(bench, '')).toBe(true)
    expect(matchesExerciseSearch(bench, 'bench')).toBe(true)
    expect(matchesExerciseSearch(bench, 'barbell')).toBe(true)
    expect(matchesExerciseSearch(bench, 'chest')).toBe(true)
    expect(matchesExerciseSearch(bench, 'triceps')).toBe(true)
    expect(matchesExerciseSearch('0025', 'deltoids')).toBe(true)
    expect(matchesExerciseSearch(bench, 'squat')).toBe(false)
  })

  it('extracts matching secondary muscle slug for search queries', async () => {
    const { secondaryMatchForQuery } = await import('./muscles.js')
    const bench = EXIDX['0025'] // primary: chest, secondary: triceps, deltoids

    // Matches secondary triceps when query is "triceps"
    expect(secondaryMatchForQuery(bench, 'triceps')).toBe('triceps')
    expect(secondaryMatchForQuery('0025', 'triceps')).toBe('triceps')
    // Matches secondary deltoids when query is "delts"
    expect(secondaryMatchForQuery(bench, 'delts')).toBe('deltoids')
    // Returns null when query matches primary or exercise name
    expect(secondaryMatchForQuery(bench, 'bench')).toBeNull()
    expect(secondaryMatchForQuery(bench, 'chest')).toBeNull()
    expect(secondaryMatchForQuery(bench, 'biceps')).toBeNull()
  })

  it('normalizes cardio target strings case-insensitively', async () => {
    const { primaryMuscleOf, secondaryMusclesOf, canonicalMuscle } = await import('./muscles.js')
    expect(canonicalMuscle('Cardiovascular System')).toBe('cardio')
    expect(canonicalMuscle('Cardio')).toBe('cardio')
    expect(primaryMuscleOf({ id: 'c1', tg: 'Cardiovascular System' })).toBe('cardio')
    expect(secondaryMusclesOf({ id: 'c1', tg: 'Cardiovascular System' })).toEqual([])
  })
})

