import { describe, expect, it } from 'vitest'
import { EXIDX, EXDB, smOf } from './exercises.js'
import { loadOfWorkouts, musclesOf, loadOf } from './muscles.js'

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
  it('defines FILTER_MUSCLES with 19 anatomical muscles in head-to-toe order plus cardio', async () => {
    const { MUSCLES, FILTER_MUSCLES, MUSCLE_NAME } = await import('./muscles.js')
    expect(MUSCLES).toEqual([
      'trapezius', 'deltoids', 'chest', 'upper-back', 'lats', 'serratus',
      'biceps', 'triceps', 'forearm',
      'abs', 'obliques', 'lower-back',
      'gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors',
      'calves', 'tibialis',
    ])
    expect(MUSCLES).toHaveLength(19)
    expect(MUSCLES.indexOf('lats')).toBe(MUSCLES.indexOf('upper-back') + 1)
    expect(MUSCLES.indexOf('serratus')).toBe(MUSCLES.indexOf('lats') + 1)
    expect(MUSCLE_NAME['lats']).toBe('Lats')
    expect(FILTER_MUSCLES).toHaveLength(20)
    expect(FILTER_MUSCLES.slice(0, 19)).toEqual(MUSCLES)
    expect(FILTER_MUSCLES[19]).toBe('cardio')
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
    // Legacy custom exercise without tg falls back to first muscle in bodypart map (now lats for back)
    expect(primaryMuscleOf({ id: 'c3', n: 'Pullup', bp: 'back' })).toBe('lats')
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

    // Legacy custom exercise without explicit tg/sm falls back to secondary bodypart muscles (3-way for back)
    const legacyBackSm = secondaryMusclesOf({ id: 'c3', bp: 'back' })
    expect(legacyBackSm).toContain('upper-back')
    expect(legacyBackSm).toContain('lower-back')
    expect(legacyBackSm).not.toContain('lats')
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
    expect(bodypartForMuscle('lats')).toBe('back')
    expect(bodypartForMuscle('LATS')).toBe('back')
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

describe('lats taxonomy expansion', () => {
  it('resolves lats aliases to lats and keeps rhomboids on upper-back', async () => {
    const { canonicalMuscle, resolveMuscleSlug } = await import('./muscles.js')
    expect(canonicalMuscle('lats')).toBe('lats')
    expect(canonicalMuscle('LATS')).toBe('lats')
    expect(canonicalMuscle('Latissimus Dorsi')).toBe('lats')
    expect(canonicalMuscle('latissimus dorsi')).toBe('lats')
    expect(resolveMuscleSlug('LATS')).toBe('lats')
    expect(resolveMuscleSlug('LATISSIMUS DORSI')).toBe('lats')
    expect(canonicalMuscle('rhomboids')).toBe('upper-back')
    expect(canonicalMuscle('RHOMBOIDS')).toBe('upper-back')
    expect(canonicalMuscle('upper back')).toBe('upper-back')
    expect(canonicalMuscle('back')).toBe('upper-back')
    expect(resolveMuscleSlug('back')).toBe('upper-back')
  })

  it('distributes legacy { bp: back } across three muscles with documented weights', async () => {
    const { musclesOf } = await import('./muscles.js')
    const legacy = { id: 'c-back', n: 'Old Pull', bp: 'back' }
    const m = musclesOf(legacy)
    expect(m).toEqual({ lats: 0.50, 'upper-back': 0.35, 'lower-back': 0.15 })
    const sum = Object.values(m).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  // placeholder to hold sum check variable scope - actual test above covers distribution
  it('correctly handles lat-dominant and upper-back-dominant catalogue entries with cross-credit', async () => {
    const { primaryMuscleOf, secondaryMusclesOf, matchesMuscleFilter, isSecondaryMuscleMatch, musclesOf, loadOf } = await import('./muscles.js')
    // lat-dominant catalogue entry: alternate lateral pulldown (id 0007) tg lats, sm biceps + rhomboids
    const latEx = EXIDX['0007']
    expect(primaryMuscleOf(latEx)).toBe('lats')
    const latSm = secondaryMusclesOf(latEx)
    expect(latSm).toContain('biceps')
    expect(latSm).toContain('upper-back')
    expect(latSm).not.toContain('lats')
    expect(musclesOf(latEx)).toEqual({ lats: 1, 'upper-back': 0.4, biceps: 0.4 })
    expect(matchesMuscleFilter(latEx, 'lats')).toBe(true)
    expect(matchesMuscleFilter(latEx, 'upper-back')).toBe(true)
    expect(isSecondaryMuscleMatch(latEx, 'upper-back')).toBe(true)
    expect(isSecondaryMuscleMatch(latEx, 'lats')).toBe(false)

    // upper-back-dominant entry: barbell bent over row
    const rowEx = EXIDX['0027']
    expect(primaryMuscleOf(rowEx)).toBe('upper-back')
    const rowSm = secondaryMusclesOf(rowEx)
    expect(rowSm).not.toContain('upper-back')
    expect(musclesOf(rowEx)).toMatchObject({ 'upper-back': 1 })
    expect(matchesMuscleFilter(rowEx, 'upper-back')).toBe(true)
    expect(matchesMuscleFilter(rowEx, 'lats')).toBe(false)

    // intentional secondary cross-credit: lat primary listing rhomboids as secondary
    const latWithRhomboids = { id: 'c-lat', n: 'Custom Pulldown', tg: 'lats', sm: ['rhomboids'], bp: 'back' }
    expect(primaryMuscleOf(latWithRhomboids)).toBe('lats')
    expect(secondaryMusclesOf(latWithRhomboids)).toEqual(['upper-back'])
    expect(musclesOf(latWithRhomboids)).toEqual({ lats: 1, 'upper-back': 0.4 })
    // deduplication excludes primary slug
    const dup = { id: 'c-dup', n: 'Dup', tg: 'lats', sm: ['lats', 'latissimus dorsi'], bp: 'back' }
    expect(secondaryMusclesOf(dup)).toEqual([])
    expect(musclesOf(dup)).toEqual({ lats: 1 })

    // loadOf for legacy back exercise uses three-way split
    const legacyBack = { id: 'c-back', n: 'Old Pull', bp: 'back' }
    const legacyLoad = loadOf([{ id: 'c-back', ex: legacyBack, sets: 2 }])
    expect(legacyLoad).toEqual({ lats: 1.0, 'upper-back': 0.7, 'lower-back': 0.3 })
  })

  it('handles case-insensitive lats slug via canonicalMuscle and resolveMuscleSlug', async () => {
    const { canonicalMuscle, resolveMuscleSlug, bodypartForMuscle } = await import('./muscles.js')
    expect(canonicalMuscle('Lats')).toBe('lats')
    expect(canonicalMuscle('LATS')).toBe('lats')
    expect(canonicalMuscle('LaTs')).toBe('lats')
    expect(resolveMuscleSlug('Lats')).toBe('lats')
    expect(resolveMuscleSlug('LATS')).toBe('lats')
    expect(bodypartForMuscle('lats')).toBe('back')
    expect(bodypartForMuscle('Lats')).toBe('back')
    expect(bodypartForMuscle('LATS')).toBe('back')
  })

  it('reinterprets historic 2-way back snapshots live as 3-way lats split (no migration)', async () => {
    const { musclesOf, loadOfWorkouts } = await import('./muscles.js')
    // Old snapshot stored before lats taxonomy: back 0.75/0.25 without lats
    const staleSnapshot = { n: 'Old Back Lift', bp: 'back', muscleWeights: { 'upper-back': 0.75, 'lower-back': 0.25 } }
    expect(musclesOf(staleSnapshot)).toEqual({ lats: 0.5, 'upper-back': 0.35, 'lower-back': 0.15 })
    // New snapshot with lats is preserved verbatim
    const freshSnapshot = { n: 'New Back Lift', bp: 'back', muscleWeights: { lats: 0.5, 'upper-back': 0.35, 'lower-back': 0.15 } }
    expect(musclesOf(freshSnapshot)).toEqual({ lats: 0.5, 'upper-back': 0.35, 'lower-back': 0.15 })
    // Explicit primary snapshot (e.g., row) is never reinterpreted
    const explicitSnapshot = { n: 'Row', bp: 'back', muscleWeights: { 'upper-back': 1, biceps: 0.4 }, muscleGroups: ['upper-back', 'biceps'] }
    expect(musclesOf(explicitSnapshot)).toEqual({ 'upper-back': 1, biceps: 0.4 })
    // Bare latissimus alias (User Story 11) resolves to lats
    const { canonicalMuscle } = await import('./muscles.js')
    expect(canonicalMuscle('latissimus')).toBe('lats')

    // loadOfWorkouts with stale muscleSnapshot in historic entry reinterprets
    const histW = {
      id: 'w-hist', d: '2026-01-01', start: Date.UTC(2026, 0, 1, 10), unit: 'kg',
      entries: [{ id: 'c-old', sets: [{ done: true, w: 50, r: 10 }, { done: true, w: 50, r: 10 }], muscleSnapshot: staleSnapshot }],
    }
    const load = loadOfWorkouts([histW], null)
    expect(load.lats).toBeCloseTo(1.0, 5)
    expect(load['upper-back']).toBeCloseTo(0.7, 5)
    expect(load['lower-back']).toBeCloseTo(0.3, 5)
  })
})

describe('legacy custom exercises and BY_BODYPART fallbacks', () => {
  it('resolves primary and secondary muscles across all 10 legacy body parts', async () => {
    const { primaryMuscleOf, secondaryMusclesOf, matchesMuscleFilter, isSecondaryMuscleMatch, musclesOf } = await import('./muscles.js')

    const legacyChest = { id: 'c-chest', n: 'Old Fly', bp: 'chest' }
    expect(primaryMuscleOf(legacyChest)).toBe('chest')
    expect(secondaryMusclesOf(legacyChest)).toEqual([])
    expect(matchesMuscleFilter(legacyChest, 'chest')).toBe(true)
    expect(isSecondaryMuscleMatch(legacyChest, 'chest')).toBe(false)
    expect(musclesOf(legacyChest)).toEqual({ chest: 1 })

    const legacyBack = { id: 'c-back', n: 'Old Pull', bp: 'back' }
    expect(primaryMuscleOf(legacyBack)).toBe('lats')
    expect(secondaryMusclesOf(legacyBack)).toEqual(['upper-back', 'lower-back'])
    expect(matchesMuscleFilter(legacyBack, 'lats')).toBe(true)
    expect(matchesMuscleFilter(legacyBack, 'upper-back')).toBe(true)
    expect(matchesMuscleFilter(legacyBack, 'lower-back')).toBe(true)
    expect(isSecondaryMuscleMatch(legacyBack, 'lats')).toBe(false)
    expect(isSecondaryMuscleMatch(legacyBack, 'upper-back')).toBe(true)
    expect(isSecondaryMuscleMatch(legacyBack, 'lower-back')).toBe(true)
    expect(musclesOf(legacyBack)).toEqual({ lats: 0.50, 'upper-back': 0.35, 'lower-back': 0.15 })

    const legacyShoulders = { id: 'c-sh', n: 'Old Press', bp: 'shoulders' }
    expect(primaryMuscleOf(legacyShoulders)).toBe('deltoids')
    expect(secondaryMusclesOf(legacyShoulders)).toEqual([])
    expect(matchesMuscleFilter(legacyShoulders, 'deltoids')).toBe(true)
    expect(musclesOf(legacyShoulders)).toEqual({ deltoids: 1 })

    const legacyUpperArms = { id: 'c-arms', n: 'Old Arm Lift', bp: 'upper arms' }
    expect(primaryMuscleOf(legacyUpperArms)).toBe('biceps')
    expect(secondaryMusclesOf(legacyUpperArms)).toEqual(['triceps'])
    expect(matchesMuscleFilter(legacyUpperArms, 'biceps')).toBe(true)
    expect(matchesMuscleFilter(legacyUpperArms, 'triceps')).toBe(true)
    expect(isSecondaryMuscleMatch(legacyUpperArms, 'biceps')).toBe(false)
    expect(isSecondaryMuscleMatch(legacyUpperArms, 'triceps')).toBe(true)
    expect(musclesOf(legacyUpperArms)).toEqual({ biceps: 0.5, triceps: 0.5 })

    const legacyLowerArms = { id: 'c-larms', n: 'Old Wrist Roll', bp: 'lower arms' }
    expect(primaryMuscleOf(legacyLowerArms)).toBe('forearm')
    expect(secondaryMusclesOf(legacyLowerArms)).toEqual([])
    expect(matchesMuscleFilter(legacyLowerArms, 'forearm')).toBe(true)
    expect(musclesOf(legacyLowerArms)).toEqual({ forearm: 1 })

    const legacyWaist = { id: 'c-waist', n: 'Old Crunch', bp: 'waist' }
    expect(primaryMuscleOf(legacyWaist)).toBe('abs')
    expect(secondaryMusclesOf(legacyWaist)).toEqual(['obliques'])
    expect(matchesMuscleFilter(legacyWaist, 'abs')).toBe(true)
    expect(matchesMuscleFilter(legacyWaist, 'obliques')).toBe(true)
    expect(isSecondaryMuscleMatch(legacyWaist, 'abs')).toBe(false)
    expect(isSecondaryMuscleMatch(legacyWaist, 'obliques')).toBe(true)
    expect(musclesOf(legacyWaist)).toEqual({ abs: 0.7, obliques: 0.3 })

    const legacyUpperLegs = { id: 'c-ulegs', n: 'Old Leg Move', bp: 'upper legs' }
    expect(primaryMuscleOf(legacyUpperLegs)).toBe('quadriceps')
    expect(secondaryMusclesOf(legacyUpperLegs)).toEqual(['hamstring', 'gluteal'])
    expect(matchesMuscleFilter(legacyUpperLegs, 'quadriceps')).toBe(true)
    expect(matchesMuscleFilter(legacyUpperLegs, 'hamstring')).toBe(true)
    expect(matchesMuscleFilter(legacyUpperLegs, 'gluteal')).toBe(true)
    expect(isSecondaryMuscleMatch(legacyUpperLegs, 'quadriceps')).toBe(false)
    expect(isSecondaryMuscleMatch(legacyUpperLegs, 'hamstring')).toBe(true)
    expect(isSecondaryMuscleMatch(legacyUpperLegs, 'gluteal')).toBe(true)
    expect(musclesOf(legacyUpperLegs)).toEqual({ quadriceps: 0.4, hamstring: 0.35, gluteal: 0.25 })

    const legacyLowerLegs = { id: 'c-llegs', n: 'Old Calf Raise', bp: 'lower legs' }
    expect(primaryMuscleOf(legacyLowerLegs)).toBe('calves')
    expect(secondaryMusclesOf(legacyLowerLegs)).toEqual(['tibialis'])
    expect(matchesMuscleFilter(legacyLowerLegs, 'calves')).toBe(true)
    expect(matchesMuscleFilter(legacyLowerLegs, 'tibialis')).toBe(true)
    expect(isSecondaryMuscleMatch(legacyLowerLegs, 'calves')).toBe(false)
    expect(isSecondaryMuscleMatch(legacyLowerLegs, 'tibialis')).toBe(true)
    expect(musclesOf(legacyLowerLegs)).toEqual({ calves: 0.8, tibialis: 0.2 })

    const legacyNeck = { id: 'c-neck', n: 'Old Shrug', bp: 'neck' }
    expect(primaryMuscleOf(legacyNeck)).toBe('trapezius')
    expect(secondaryMusclesOf(legacyNeck)).toEqual([])
    expect(matchesMuscleFilter(legacyNeck, 'trapezius')).toBe(true)
    expect(musclesOf(legacyNeck)).toEqual({ trapezius: 1 })

    const legacyCardio = { id: 'c-cardio', n: 'Old Run', bp: 'cardio' }
    expect(primaryMuscleOf(legacyCardio)).toBe('cardio')
    expect(secondaryMusclesOf(legacyCardio)).toEqual([])
    expect(matchesMuscleFilter(legacyCardio, 'cardio')).toBe(true)
    expect(musclesOf(legacyCardio)).toEqual({})
  })

  it('keeps explicit empty secondary muscles when tg is set, without falling back to bodypart secondaries', async () => {
    const { primaryMuscleOf, secondaryMusclesOf } = await import('./muscles.js')

    const explicitBicepIsolation = {
      id: 'c-iso-1',
      n: 'Strict Preacher Curl',
      tg: 'biceps',
      sm: [],
      bp: 'upper arms',
    }

    expect(primaryMuscleOf(explicitBicepIsolation)).toBe('biceps')
    // Should be empty array, NOT ['triceps']
    expect(secondaryMusclesOf(explicitBicepIsolation)).toEqual([])
  })
})
