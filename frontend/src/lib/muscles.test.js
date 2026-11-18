import { describe, expect, it, afterEach } from 'vitest'
import { EXIDX, EXDB, smOf, registerCustom } from './exercises.js'
import { UPPER_BODY_CORRECTIONS } from './catalogue-corrections.js'
import { matchesMuscleFilter, isSecondaryMuscleMatch, loadOfWorkouts, musclesOf, loadOf, muscleWeightsOf, lastTrainedByMuscle, primaryMuscleOf, primaryMuscleName, secondaryMusclesOf, sessionMuscleDistribution } from './muscles.js'

describe('catalogue secondary muscles', () => {
  it('maps a bench press to chest, triceps and front delts', () => {
    expect(musclesOf(EXIDX['0025'])).toMatchObject({
      chest: 1,
      triceps: 0.4,
      'front-delts': 0.4,
    })
  })


  it('maps common row variations to the upper back, biceps and rear deltoids', () => {
    for (const id of ['0027', '0293', '0499', '0861']) {
      expect(musclesOf(EXIDX[id])).toMatchObject({
        'upper-back': 1,
        biceps: 0.4,
        'rear-delts': 0.4,
      })
    }
  })
})


describe('catalogue secondary additions', () => {
  it('enriches the muscle map without mutating the raw dataset', () => {
    const raw = EXDB.find(e => e.id === '0027')
    expect(raw.sm).not.toContain('rear deltoids')
    expect(smOf(raw)).toContain('rear deltoids')
    expect(musclesOf(raw)).toHaveProperty('rear-delts')
  })
})

describe('hamstring hinge catalogue curations and set distribution', () => {
  const HINGE_IDS = [
    '0085', '1459',
    '0116', '0432', '0434', '1009', '1023',
    '1756', '1757', '2805',
    '0115',
  ]

  it('curates primary to hamstring and secondaries to gluteal and lower-back for all hinge variations', () => {
    for (const id of HINGE_IDS) {
      expect(primaryMuscleOf(id)).toBe('hamstring')
      const secondaries = secondaryMusclesOf(id)
      expect(secondaries).toContain('gluteal')
      expect(secondaries).toContain('lower-back')
      expect(musclesOf(EXIDX[id])).toEqual({
        hamstring: 1,
        gluteal: 0.4,
        'lower-back': 0.4,
      })
    }
  })

  it('resolves string exercise IDs transparently in musclesOf', () => {
    expect(musclesOf('0085')).toEqual({
      hamstring: 1,
      gluteal: 0.4,
      'lower-back': 0.4,
    })
  })

  it('continues to enrich rear delts for existing row variations', () => {
    for (const id of ['0027', '0293', '0499', '0861']) {
      expect(musclesOf(EXIDX[id])).toMatchObject({
        'upper-back': 1,
        biceps: 0.4,
        'rear-delts': 0.4,
      })
    }
  })
})



describe('lower-body movement corrections', () => {
  it('credits a back squat to quads, with glutes and adductors secondary', () => {
    expect(musclesOf('0043')).toEqual({ quadriceps: 1, gluteal: 0.4, adductors: 0.4 })
  })

  it.each([
    ['front squat', '0042', { quadriceps: 1, gluteal: 0.4, adductors: 0.4 }],
    ['sled hack squat', '0743', { quadriceps: 1, gluteal: 0.4, adductors: 0.4 }],
    ['goblet squat', '1760', { quadriceps: 1, gluteal: 0.4, adductors: 0.4 }],
    ['leg press', '0739', { quadriceps: 1, gluteal: 0.4, adductors: 0.4 }],
    ['lunge', '0054', { quadriceps: 1, gluteal: 0.4, adductors: 0.4 }],
    ['split squat', '2368', { quadriceps: 1, gluteal: 0.4, adductors: 0.4 }],
    ['step-up', '0431', { quadriceps: 1, gluteal: 0.4, adductors: 0.4 }],
    ['hip thrust', '3236', { gluteal: 1, hamstring: 0.4 }],
    ['glute bridge', '1409', { gluteal: 1, hamstring: 0.4 }],
    ['deadlift', '0032', { gluteal: 1, hamstring: 0.4, 'lower-back': 0.4, quadriceps: 0.4, trapezius: 0.4, forearm: 0.4 }],
    ['rack pull', '0074', { gluteal: 1, hamstring: 0.4, 'lower-back': 0.4, quadriceps: 0.4, trapezius: 0.4, forearm: 0.4 }],
    ['Romanian deadlift', '0085', { hamstring: 1, gluteal: 0.4, 'lower-back': 0.4 }],
    ['lying leg curl', '0586', { hamstring: 1, calves: 0.4 }],
    ['kneeling leg curl', '0582', { hamstring: 1, calves: 0.4 }],
    ['leg extension', '0585', { quadriceps: 1 }],
    ['standing calf raise', '1372', { calves: 1 }],
    ['seated calf raise', '0088', { calves: 1 }],
    ['back extension', '0489', { 'lower-back': 1, gluteal: 0.4, hamstring: 0.4 }],
  ])('credits a %s (%s) with its corrected weights', (_name, id, weights) => {
    expect(musclesOf(id)).toEqual(weights)
  })

  it('shows the corrected primary in the Library filter and exercise detail', () => {
    expect(matchesMuscleFilter('0043', 'quadriceps')).toBe(true)
    expect(isSecondaryMuscleMatch('0043', 'quadriceps')).toBe(false)
    expect(isSecondaryMuscleMatch('0043', 'gluteal')).toBe(true)
    expect(matchesMuscleFilter('0043', 'hamstring')).toBe(false)
    expect(matchesMuscleFilter('0585', 'hamstring')).toBe(false)
    expect(primaryMuscleName('0043')).toBe('Quads')
    expect(primaryMuscleName('0739')).toBe('Quads')
  })

  it('keeps catalogue tags on an exercise the review left out', () => {
    expect(musclesOf('1489')).toEqual({ quadriceps: 1, calves: 0.4, gluteal: 0.4 })
    expect(musclesOf('2798')).toEqual({ quadriceps: 1, gluteal: 0.4, hamstring: 0.4, calves: 0.4 })
  })

  it('re-reads a stored squat workout through the correction in the session distribution', () => {
    const stored = { id: 'w-old', d: '2025-01-10', entries: [{ id: '0043', sets: [
      { w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }, { w: 100, r: 5, done: true },
    ] }] }
    const before = JSON.stringify(stored)
    const dist = Object.fromEntries(sessionMuscleDistribution(stored).map(m => [m.slug, m]))
    expect(Object.keys(dist).sort()).toEqual(['adductors', 'gluteal', 'quadriceps'])
    expect(dist.quadriceps).toMatchObject({ primarySets: 3, effectiveSets: 3 })
    expect(dist.gluteal).toMatchObject({ secondarySets: 3, effectiveSets: 1.2 })
    expect(JSON.stringify(stored)).toBe(before)
  })

  it('keeps the muscles a lifter picked for a custom squat', () => {
    const custom = { id: 'custom-squat', n: 'My squat', bp: 'upper legs', tg: 'glutes', sm: ['hamstrings'] }
    expect(musclesOf(custom)).toEqual({ gluteal: 1, hamstring: 0.4 })
  })
})

describe('upper-body and core movement corrections', () => {
  it.each([
    ['barbell bench press', '0025', { chest: 1, 'front-delts': 0.4, triceps: 0.4 }],
    ['barbell incline bench press', '0047', { chest: 1, 'front-delts': 0.4, triceps: 0.4 }],
    ['standing military press', '1456', { 'front-delts': 1, 'side-delts': 0.4, triceps: 0.4 }],
    ['dumbbell lateral raise', '0334', { 'side-delts': 1, trapezius: 0.4 }],
    ['rope rear-delt row (face pull)', '0203', { 'rear-delts': 1, 'upper-back': 0.4, trapezius: 0.4 }],
    ['band reverse fly (face pull)', '0993', { 'rear-delts': 1, 'upper-back': 0.4, trapezius: 0.4 }],
    ['barbell upright row', '0120', { 'side-delts': 1, trapezius: 0.4, biceps: 0.4 }],
    ['barbell bent over row', '0027', { 'upper-back': 1, lats: 0.4, 'rear-delts': 0.4, biceps: 0.4 }],
    ['cable pulldown', '0198', { lats: 1, 'upper-back': 0.4, biceps: 0.4 }],
    ['pull-up', '0652', { lats: 1, 'upper-back': 0.4, biceps: 0.4 }],
    ['cable triceps pushdown', '0241', { triceps: 1 }],
    ['barbell curl', '0031', { biceps: 1, forearm: 0.4 }],
    ['dumbbell hammer curl', '0313', { forearm: 1, biceps: 0.4 }],
    ['crunch', '0274', { abs: 1, obliques: 0.4 }],
  ])('credits a %s (%s) with its corrected weights', (_name, id, weights) => {
    expect(musclesOf(id)).toEqual(weights)
  })

  // The spec's table, row by row, as muscle weights.
  const TABLE = {
    'pull-up, chin-up, pulldown': { lats: 1, 'upper-back': 0.4, biceps: 0.4 },
    pullover: { lats: 1, chest: 0.4, triceps: 0.4 },
    row: { 'upper-back': 1, lats: 0.4, 'rear-delts': 0.4, biceps: 0.4 },
    'face pull, rear-delt raise, reverse fly': { 'rear-delts': 1, 'upper-back': 0.4, trapezius: 0.4 },
    shrug: { trapezius: 1, forearm: 0.4 },
    'lateral raise': { 'side-delts': 1, trapezius: 0.4 },
    'upright row': { 'side-delts': 1, trapezius: 0.4, biceps: 0.4 },
    'front raise': { 'front-delts': 1 },
    'overhead press': { 'front-delts': 1, 'side-delts': 0.4, triceps: 0.4 },
    'bench, chest press, push-up, chest dip, incline press': { chest: 1, 'front-delts': 0.4, triceps: 0.4 },
    'close-grip bench, triceps dip': { triceps: 1, chest: 0.4, 'front-delts': 0.4 },
    'fly, crossover, pec deck': { chest: 1, 'front-delts': 0.4 },
    'triceps extension, pushdown, kickback': { triceps: 1 },
    curl: { biceps: 1, forearm: 0.4 },
    'hammer and reverse curl': { forearm: 1, biceps: 0.4 },
    'crunch, sit-up': { abs: 1, obliques: 0.4 },
    'leg raise': { abs: 1, 'hip-flexors': 0.4 },
    'twist, woodchop': { obliques: 1, abs: 0.4 },
    'plank, rollout': { abs: 1, obliques: 0.4 },
  }

  it('covers every row of the table', () => {
    expect(UPPER_BODY_CORRECTIONS.map(p => p.pattern).sort()).toEqual(Object.keys(TABLE).sort())
  })

  it.each(Object.entries(TABLE))('credits every reviewed %s id with the table weights', (pattern, weights) => {
    const { ids } = UPPER_BODY_CORRECTIONS.find(p => p.pattern === pattern)
    for (const id of ids) expect([id, musclesOf(id)]).toEqual([id, weights])
  })

  it('shows the corrected primary in the Library filter and exercise detail', () => {
    expect(primaryMuscleName('0313')).toBe('Forearms')
    expect(primaryMuscleName('0687')).toBe('Obliques')
    expect(matchesMuscleFilter('0027', 'lats')).toBe(true)
    expect(isSecondaryMuscleMatch('0027', 'lats')).toBe(true)
    expect(matchesMuscleFilter('0241', 'front-delts')).toBe(false)
  })

  it('keeps catalogue tags on a combination move the review left out', () => {
    expect(musclesOf('3547')).toEqual({ biceps: 1, 'front-delts': 0.4 })
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
  it('defines FILTER_MUSCLES with 21 anatomical muscles in head-to-toe order plus a Shoulders chip and cardio', async () => {
    const { MUSCLES, FILTER_MUSCLES, MUSCLE_NAME } = await import('./muscles.js')
    expect(MUSCLES).toEqual([
      'trapezius', 'front-delts', 'side-delts', 'rear-delts', 'chest', 'upper-back', 'lats', 'serratus',
      'biceps', 'triceps', 'forearm',
      'abs', 'obliques', 'lower-back',
      'gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors',
      'calves', 'tibialis',
    ])
    expect(MUSCLES).toHaveLength(21)
    expect(MUSCLES.indexOf('lats')).toBe(MUSCLES.indexOf('upper-back') + 1)
    expect(MUSCLES.indexOf('serratus')).toBe(MUSCLES.indexOf('lats') + 1)
    expect(MUSCLE_NAME['lats']).toBe('Lats')
    expect(FILTER_MUSCLES).toHaveLength(23)
    expect(FILTER_MUSCLES.filter(m => m !== 'shoulders').slice(0, 21)).toEqual(MUSCLES)
    expect(FILTER_MUSCLES[1]).toBe('shoulders')
    expect(FILTER_MUSCLES[22]).toBe('cardio')
    FILTER_MUSCLES.forEach(slug => {
      expect(MUSCLE_NAME[slug]).toBeTruthy()
    })
  })

  it('correctly extracts primary muscle from catalogue exercises and custom exercises', async () => {
    const { primaryMuscleOf } = await import('./muscles.js')
    expect(primaryMuscleOf(EXIDX['0025'])).toBe('chest')
    expect(primaryMuscleOf(EXIDX['0027'])).toBe('upper-back')
    expect(primaryMuscleOf(EXIDX['0043'])).toBe('quadriceps')
    expect(primaryMuscleOf({ id: 'c1', n: 'Incline Curl', tg: 'biceps', bp: 'upper arms' })).toBe('biceps')
    expect(primaryMuscleOf({ id: 'c2', n: 'Leg Extension', tg: 'quads', bp: 'upper legs' })).toBe('quadriceps')
    expect(primaryMuscleOf({ id: 'c3', n: 'Pullup', bp: 'back' })).toBe('lats')
    expect(primaryMuscleOf({ id: 'c4', n: 'Bench', bp: 'chest' })).toBe('chest')
    expect(primaryMuscleOf({ id: 'c5', n: 'Treadmill', bp: 'cardio' })).toBe('cardio')
    expect(primaryMuscleOf({ id: 'c6', n: 'Running', tg: 'cardiovascular system', bp: 'cardio' })).toBe('cardio')
  })

  it('correctly extracts secondary muscles excluding the primary muscle', async () => {
    const { secondaryMusclesOf } = await import('./muscles.js')
    const benchSm = secondaryMusclesOf(EXIDX['0025'])
    expect(benchSm).toContain('triceps')
    expect(benchSm).toContain('front-delts')
    expect(benchSm).not.toContain('chest')

    const rowSm = secondaryMusclesOf(EXIDX['0027'])
    expect(rowSm).toContain('biceps')
    expect(rowSm).toContain('rear-delts')
    expect(rowSm).not.toContain('upper-back')

    const squatSm = secondaryMusclesOf(EXIDX['0043'])
    expect(squatSm).toContain('gluteal')
    expect(squatSm).not.toContain('hamstring')
    expect(squatSm).not.toContain('quadriceps')

    const customSm = secondaryMusclesOf({ id: 'c1', n: 'Hammer Curl', tg: 'biceps', sm: ['forearms', 'brachialis'] })
    expect(customSm).toEqual(['forearm'])

    expect(secondaryMusclesOf({ id: 'c5', bp: 'cardio' })).toEqual([])

    const legacyBackSm = secondaryMusclesOf({ id: 'c3', bp: 'back' })
    expect(legacyBackSm).toContain('upper-back')
    expect(legacyBackSm).toContain('lower-back')
    expect(legacyBackSm).not.toContain('lats')
  })

  it('matches muscle filter for primary, secondary, and cardio movements', async () => {
    const { matchesMuscleFilter } = await import('./muscles.js')
    const bench = EXIDX['0025']

    expect(matchesMuscleFilter(bench, '')).toBe(true)
    expect(matchesMuscleFilter(bench, null)).toBe(true)

    expect(matchesMuscleFilter(bench, 'chest')).toBe(true)
    expect(matchesMuscleFilter(bench, 'pectorals')).toBe(true)

    expect(matchesMuscleFilter(bench, 'triceps')).toBe(true)
    expect(matchesMuscleFilter(bench, 'front-delts')).toBe(true)
    expect(matchesMuscleFilter(bench, 'shoulders')).toBe(true)

    expect(matchesMuscleFilter(bench, 'biceps')).toBe(false)
    expect(matchesMuscleFilter(bench, 'quadriceps')).toBe(false)
    expect(matchesMuscleFilter(bench, 'cardio')).toBe(false)

    const cardioEx = { id: 'c1', bp: 'cardio', tg: 'cardio' }
    expect(matchesMuscleFilter(cardioEx, 'cardio')).toBe(true)
    expect(matchesMuscleFilter(cardioEx, 'chest')).toBe(false)
  })

  it('derives legacy bodypart from canonical muscle group via bodypartForMuscle', async () => {
    const { bodypartForMuscle } = await import('./muscles.js')
    expect(bodypartForMuscle('trapezius')).toBe('neck')
    expect(bodypartForMuscle('traps')).toBe('neck')
    expect(bodypartForMuscle('front-delts')).toBe('shoulders')
    expect(bodypartForMuscle('rear-delts')).toBe('shoulders')
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
    const bench = EXIDX['0025']

    expect(isSecondaryMuscleMatch(bench, 'triceps')).toBe(true)
    expect(isSecondaryMuscleMatch(bench, 'front-delts')).toBe(true)
    expect(isSecondaryMuscleMatch(bench, 'shoulders')).toBe(true)
    expect(isSecondaryMuscleMatch('0025', 'triceps')).toBe(true)

    expect(isSecondaryMuscleMatch(bench, 'chest')).toBe(false)
    expect(isSecondaryMuscleMatch(bench, 'biceps')).toBe(false)
    expect(isSecondaryMuscleMatch(bench, 'cardio')).toBe(false)
    expect(isSecondaryMuscleMatch(bench, 'favorites')).toBe(false)
    expect(isSecondaryMuscleMatch(bench, '')).toBe(false)
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

  it('correctly handles lat-dominant and upper-back-dominant catalogue entries with cross-credit', async () => {
    const { primaryMuscleOf, secondaryMusclesOf, matchesMuscleFilter, isSecondaryMuscleMatch, musclesOf, loadOf } = await import('./muscles.js')
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

    const rowEx = EXIDX['0027']
    expect(primaryMuscleOf(rowEx)).toBe('upper-back')
    const rowSm = secondaryMusclesOf(rowEx)
    expect(rowSm).not.toContain('upper-back')
    expect(musclesOf(rowEx)).toMatchObject({ 'upper-back': 1 })
    expect(matchesMuscleFilter(rowEx, 'upper-back')).toBe(true)
    expect(isSecondaryMuscleMatch(rowEx, 'lats')).toBe(true)

    const latWithRhomboids = { id: 'c-lat', n: 'Custom Pulldown', tg: 'lats', sm: ['rhomboids'], bp: 'back' }
    expect(primaryMuscleOf(latWithRhomboids)).toBe('lats')
    expect(secondaryMusclesOf(latWithRhomboids)).toEqual(['upper-back'])
    expect(musclesOf(latWithRhomboids)).toEqual({ lats: 1, 'upper-back': 0.4 })
    const dup = { id: 'c-dup', n: 'Dup', tg: 'lats', sm: ['lats', 'latissimus dorsi'], bp: 'back' }
    expect(secondaryMusclesOf(dup)).toEqual([])
    expect(musclesOf(dup)).toEqual({ lats: 1 })

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
    const staleSnapshot = { n: 'Old Back Lift', bp: 'back', muscleWeights: { 'upper-back': 0.75, 'lower-back': 0.25 } }
    expect(musclesOf(staleSnapshot)).toEqual({ lats: 0.5, 'upper-back': 0.35, 'lower-back': 0.15 })
    const freshSnapshot = { n: 'New Back Lift', bp: 'back', muscleWeights: { lats: 0.5, 'upper-back': 0.35, 'lower-back': 0.15 } }
    expect(musclesOf(freshSnapshot)).toEqual({ lats: 0.5, 'upper-back': 0.35, 'lower-back': 0.15 })
    const explicitSnapshot = { n: 'Row', bp: 'back', muscleWeights: { 'upper-back': 1, biceps: 0.4 }, muscleGroups: ['upper-back', 'biceps'] }
    expect(musclesOf(explicitSnapshot)).toEqual({ 'upper-back': 1, biceps: 0.4 })
    const { canonicalMuscle } = await import('./muscles.js')
    expect(canonicalMuscle('latissimus')).toBe('lats')

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
    expect(primaryMuscleOf(legacyShoulders)).toBe('front-delts')
    expect(secondaryMusclesOf(legacyShoulders)).toEqual(['side-delts', 'rear-delts'])
    expect(matchesMuscleFilter(legacyShoulders, 'shoulders')).toBe(true)
    expect(musclesOf(legacyShoulders)).toEqual({ 'front-delts': 1, 'side-delts': 0.4, 'rear-delts': 0.4 })

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
    expect(secondaryMusclesOf(explicitBicepIsolation)).toEqual([])
  })
})

describe('muscleWeightsOf and lastTrainedByMuscle', () => {
  afterEach(() => registerCustom([]))
  const at = d => Date.parse(d + 'T12:00:00Z')
  const wk = (d, entries) => ({ d, start: at(d), entries })

  it('reads own metadata first, then the live catalogue, then a deleted custom snapshot', () => {
    registerCustom([{ id: 'c-live', n: 'Curl', tg: 'biceps' }])
    expect(muscleWeightsOf({ id: 'c-live', muscleSnapshot: { muscleWeights: { chest: 1 } } })).toEqual({ biceps: 1 })
    expect(muscleWeightsOf({ id: 'c-live', muscleWeights: { triceps: 1 } })).toEqual({ triceps: 1 })
    expect(muscleWeightsOf({
      id: 'c-gone',
      muscleWeights: { triceps: 1 },
      muscleSnapshot: { muscleWeights: { chest: 1 } },
    })).toEqual({ triceps: 1 })
    expect(muscleWeightsOf({ id: 'c-gone', muscleSnapshot: { muscleWeights: { chest: 1 } } })).toEqual({ chest: 1 })
    expect(muscleWeightsOf({ id: 'c-gone' })).toEqual({})
    expect(muscleWeightsOf(null)).toEqual({})
  })

  it('records the latest performed-work-set timestamp per muscle', () => {
    registerCustom([{ id: 'c-map', n: 'Map Lift', tg: 'biceps' }])
    const map = lastTrainedByMuscle([
      wk('2026-02-01', [{ id: 'c-map', sets: [{ done: true, w: 20, r: 10 }] }]),
      wk('2026-02-08', [{ id: 'c-map', sets: [{ done: true, phase: 'warmup', w: 5, r: 10 }] }]),
      wk('2026-02-15', [{ id: 'c-map', sets: [{ done: false, w: 20, r: 10 }] }]),
    ])
    expect(map).toEqual({ biceps: at('2026-02-01') })
    expect(lastTrainedByMuscle([])).toEqual({})
    expect(lastTrainedByMuscle(undefined)).toEqual({})
  })

  it('counts performed bodyweight and timed rows with no load as trained', () => {
    registerCustom([
      { id: 'c-bw', n: 'Push-up', tg: 'chest' },
      { id: 'c-timed', n: 'Plank', tg: 'abs' },
    ])
    const map = lastTrainedByMuscle([
      wk('2026-03-01', [{ id: 'c-bw', sets: [{ done: true, r: 12 }] }]),
      wk('2026-03-02', [{ id: 'c-timed', sets: [{ done: true, sec: 60 }] }]),
    ])
    expect(map).toEqual({ chest: at('2026-03-01'), abs: at('2026-03-02') })
  })

  it('counts a deleted custom through its snapshot instead of dropping the entry', () => {
    const trained = { id: 'c-gone', sets: [{ done: true, w: 20, r: 10 }], muscleSnapshot: { muscleWeights: { chest: 1 } } }
    expect(lastTrainedByMuscle([wk('2026-02-01', [trained])])).toEqual({ chest: at('2026-02-01') })
    const untouched = { ...trained, sets: [{ done: false, w: 20, r: 10 }] }
    expect(lastTrainedByMuscle([wk('2026-02-01', [untouched])])).toEqual({})
  })
})

describe('sessionMuscleDistribution', () => {
  it('quantifies compound exercise distribution with 1.0 primary and 0.4 secondary effective sets', () => {
    const workout = {
      entries: [
        {
          id: '0025',
          sets: [
            { w: 80, r: 8, done: true },
            { w: 80, r: 8, done: true },
            { w: 80, r: 8, done: true },
          ],
        },
      ],
    }

    const dist = sessionMuscleDistribution(workout)
    expect(dist).toHaveLength(3)

    const chest = dist.find(m => m.slug === 'chest')
    expect(chest).toEqual({
      slug: 'chest',
      name: 'Chest',
      effectiveSets: 3,
      primarySets: 3,
      secondarySets: 0,
      assistSets: 0,
      compoundSets: 0,
      exercises: ['barbell bench press'],
    })

    const triceps = dist.find(m => m.slug === 'triceps')
    expect(triceps).toEqual({
      slug: 'triceps',
      name: 'Triceps',
      effectiveSets: 1.2,
      primarySets: 0,
      secondarySets: 3,
      assistSets: 1.2,
      compoundSets: 3,
      exercises: ['barbell bench press'],
    })

    const frontDelts = dist.find(m => m.slug === 'front-delts')
    expect(frontDelts).toEqual({
      slug: 'front-delts',
      name: 'Front delts',
      effectiveSets: 1.2,
      primarySets: 0,
      secondarySets: 3,
      assistSets: 1.2,
      compoundSets: 3,
      exercises: ['barbell bench press'],
    })
  })

  it('excludes warm-up sets from effective sets and set counts', () => {
    const workout = {
      entries: [
        {
          id: '0025',
          sets: [
            { w: 40, r: 10, done: true, phase: 'warmup' },
            { w: 60, r: 5, done: true, phase: 'warmup' },
            { w: 80, r: 8, done: true },
            { w: 80, r: 8, done: false },
          ],
        },
      ],
    }

    const dist = sessionMuscleDistribution(workout)
    const chest = dist.find(m => m.slug === 'chest')
    expect(chest.primarySets).toBe(1)
    expect(chest.effectiveSets).toBe(1)

    const triceps = dist.find(m => m.slug === 'triceps')
    expect(triceps.secondarySets).toBe(1)
    expect(triceps.assistSets).toBe(0.4)
    expect(triceps.compoundSets).toBe(1)
    expect(triceps.effectiveSets).toBe(0.4)
  })

  it('returns empty array when workout has zero completed work sets or only warm-ups', () => {
    expect(sessionMuscleDistribution(null)).toEqual([])
    expect(sessionMuscleDistribution({})).toEqual([])
    expect(sessionMuscleDistribution({ entries: [] })).toEqual([])

    const warmOnly = {
      entries: [
        {
          id: '0025',
          sets: [
            { w: 40, r: 10, done: true, phase: 'warmup' },
            { w: 80, r: 8, done: false },
          ],
        },
      ],
    }
    expect(sessionMuscleDistribution(warmOnly)).toEqual([])
  })

  it('accumulates multi-exercise work and assistance across overlapping muscles', () => {
    const workout = {
      entries: [
        {
          id: '0025',
          sets: [
            { w: 100, r: 5, done: true },
            { w: 100, r: 5, done: true },
            { w: 100, r: 5, done: true },
          ],
        },
        {
          id: '0018',
          sets: [
            { w: 20, r: 10, done: true },
            { w: 20, r: 10, done: true },
          ],
        },
      ],
    }

    const dist = sessionMuscleDistribution(workout)

    const triceps = dist.find(m => m.slug === 'triceps')
    expect(triceps.primarySets).toBe(2)
    expect(triceps.secondarySets).toBe(3)
    expect(triceps.assistSets).toBe(1.2)
    expect(triceps.compoundSets).toBe(3)
    expect(triceps.effectiveSets).toBe(3.2)
    expect(triceps.exercises).toEqual([
      'barbell bench press',
      'assisted standing triceps extension (with towel)',
    ])

    const chest = dist.find(m => m.slug === 'chest')
    expect(chest.primarySets).toBe(3)
    expect(chest.effectiveSets).toBe(3)

    expect(dist[0].slug).toBe('triceps')
    expect(dist[1].slug).toBe('chest')
  })

  it('sorts by effectiveSets descending, then primarySets descending, then alphabetical', () => {
    const workout = {
      entries: [
        {
          id: '0025',
          sets: [
            { w: 100, r: 5, done: true },
            { w: 100, r: 5, done: true },
            { w: 100, r: 5, done: true },
          ],
        },
      ],
    }

    const dist = sessionMuscleDistribution(workout)
    expect(dist.map(m => m.slug)).toEqual(['chest', 'front-delts', 'triceps'])
    expect(dist[1].name).toBe('Front delts')
    expect(dist[2].name).toBe('Triceps')
  })

  it('supports custom exercises with muscleWeights snapshot fallback', () => {
    const workout = {
      entries: [
        {
          id: 'custom-arms',
          n: 'Arm Blast',
          muscleWeights: { biceps: 0.5, triceps: 0.5 },
          sets: [
            { w: 20, r: 10, done: true },
            { w: 20, r: 10, done: true },
            { w: 20, r: 10, done: true },
          ],
        },
      ],
    }

    const dist = sessionMuscleDistribution(workout)
    expect(dist).toHaveLength(2)
    const biceps = dist.find(m => m.slug === 'biceps')
    expect(biceps.primarySets).toBe(1.5)
    expect(biceps.effectiveSets).toBe(1.5)
    expect(biceps.exercises).toEqual(['Arm Blast'])
  })
})


describe('primaryMuscleName', () => {
  it('names a bench press "Chest", not the dataset\'s "pectorals"', () => {
    expect(EXIDX['0025'].tg).toBe('pectorals')
    expect(primaryMuscleName(EXIDX['0025'])).toBe('Chest')
  })

  it('falls back to the dataset spelling for an exercise that maps to no drawable muscle', () => {
    expect(primaryMuscleName({ id: 'c-odd', n: 'Jaw clench', tg: 'jaw' })).toBe('jaw')
  })
})
