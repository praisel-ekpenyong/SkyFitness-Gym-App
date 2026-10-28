import { describe, expect, it } from 'vitest'
import { queryCatalogue, scoreExerciseMatch } from './catalogue-query.js'

const exercise = (id, name, muscle, equipment, secondary = []) => ({
  id,
  n: name,
  tg: muscle,
  sm: secondary,
  bp: muscle === 'cardio' ? 'cardio' : 'chest',
  eq: equipment,
  custom: true,
})

describe('Catalogue query', () => {
  it('returns matching Catalogue rows and equipment choices', () => {
    const profile = {
      customEx: [
        exercise('custom-a', 'Architecture specimen press', 'pectorals', 'barbell'),
        exercise('custom-b', 'Architecture specimen fly', 'pectorals', 'cable'),
        exercise('custom-c', 'Unrelated row', 'lats', 'body weight'),
      ],
      favorites: [],
      routines: [],
      workouts: [],
    }

    const result = queryCatalogue({
      profile,
      scope: { kind: 'all' },
      search: 'architecture specimen',
      equipment: '',
    })

    expect({
      ids: result.rows.map(row => row.exercise.id),
      equipmentOptions: result.equipmentOptions,
      effectiveEquipment: result.effectiveEquipment,
    }).toEqual({
      ids: ['custom-a', 'custom-b'],
      equipmentOptions: ['barbell', 'cable'],
      effectiveEquipment: '',
    })
  })

  it('filters by Muscle filter and attributes Secondary muscle matches', () => {
    const profile = {
      customEx: [
        exercise('secondary-hit', 'Architecture compound press', 'chest', 'barbell', ['biceps']),
        exercise('primary-hit', 'Architecture curl', 'biceps', 'dumbbell'),
        exercise('miss', 'Architecture squat', 'quadriceps', 'barbell'),
      ],
      favorites: [],
      routines: [],
      workouts: [],
    }

    const result = queryCatalogue({
      profile,
      scope: { kind: 'muscle', muscle: 'biceps' },
      search: 'architecture',
      equipment: '',
    })

    expect(result.rows.map(row => ({
      id: row.exercise.id,
      primaryMuscle: row.primaryMuscle,
      secondaryMatch: row.secondaryMatch,
    }))).toEqual([
      { id: 'secondary-hit', primaryMuscle: 'chest', secondaryMatch: 'biceps' },
      { id: 'primary-hit', primaryMuscle: 'biceps', secondaryMatch: null },
    ])
  })

  it('filters Favorite exercises and reports Profile usage counts', () => {
    const profile = {
      customEx: [
        exercise('favorite-hit', 'Architecture favorite', 'biceps', 'dumbbell'),
        exercise('other', 'Architecture other', 'chest', 'barbell'),
      ],
      favorites: ['favorite-hit', 'stale-favorite'],
      routines: [{ ex: [{ id: 'other' }] }],
      workouts: [{ entries: [{ id: 'other' }] }],
    }

    const result = queryCatalogue({
      profile,
      scope: { kind: 'favorites' },
      search: 'architecture',
      equipment: '',
    })

    expect({
      ids: result.rows.map(row => row.exercise.id),
      favorite: result.rows[0].favorite,
      usageCount: result.rows[0].usageCount,
      favoriteCount: result.favoriteCount,
      chosenCount: result.chosenCount,
    }).toEqual({
      ids: ['favorite-hit'],
      favorite: true,
      usageCount: 0,
      favoriteCount: 2,
      chosenCount: 1,
    })
  })

  it('sorts Chosen exercises by usage and tolerates invalid equipment selection', () => {
    const profile = {
      customEx: [
        exercise('chosen-low', 'Architecture low use', 'chest', 'barbell'),
        exercise('chosen-high', 'Architecture high use', 'chest', 'cable'),
      ],
      favorites: [],
      routines: [{ ex: [{ id: 'chosen-low' }, { id: 'chosen-high' }, { id: 'chosen-high' }] }],
      workouts: [],
    }

    const result = queryCatalogue({
      profile,
      scope: { kind: 'chosen' },
      search: 'architecture',
      equipment: 'not-present',
    })

    expect({
      ids: result.rows.map(row => row.exercise.id),
      usage: result.rows.map(row => row.usageCount),
      equipmentOptions: result.equipmentOptions,
      effectiveEquipment: result.effectiveEquipment,
    }).toEqual({
      ids: ['chosen-high', 'chosen-low'],
      usage: [2, 1],
      equipmentOptions: ['barbell', 'cable'],
      effectiveEquipment: '',
    })
  })

  it('attributes a secondary muscle when the search matches its canonical name', () => {
    const profile = {
      customEx: [exercise('secondary-search', 'Architecture press', 'chest', 'barbell', ['biceps'])],
      favorites: [],
      routines: [],
      workouts: [],
    }

    const result = queryCatalogue({
      profile,
      scope: { kind: 'all' },
      search: 'biceps',
      equipment: '',
    })

    // The search also matches built-in catalogue exercises with biceps as a secondary;
    // this test only asserts on the custom fixture's row.
    const row = result.rows.find(r => r.exercise.id === 'secondary-search')
    expect(row?.secondaryMatch).toBe('biceps')
  })

  it('reports the full catalogue size independently of scope, search, and equipment', () => {
    const profile = {
      customEx: [exercise('custom-a', 'Architecture press', 'chest', 'barbell')],
      favorites: [],
      routines: [],
      workouts: [],
    }

    const filtered = queryCatalogue({
      profile,
      scope: { kind: 'favorites' },
      search: 'nothing matches this string',
      equipment: 'barbell',
    })
    expect(filtered.rows).toEqual([])

    const unfiltered = queryCatalogue({ profile, scope: { kind: 'all' }, search: '', equipment: '' })
    expect(unfiltered.rows.length).toBeGreaterThan(0)
    expect(filtered.catalogueCount).toBe(unfiltered.catalogueCount)
    expect(filtered.catalogueCount).toBeGreaterThan(filtered.rows.length)
    expect(unfiltered.catalogueCount).toBe(unfiltered.rows.length)
  })

  it('can suppress search-based secondary attribution while keeping muscle-filter attribution', () => {
    const profile = {
      customEx: [
        exercise('secondary-search', 'Architecture press', 'chest', 'barbell', ['biceps']),
        exercise('secondary-filter', 'Architecture curl', 'chest', 'cable', ['biceps']),
      ],
      favorites: [],
      routines: [],
      workouts: [],
    }

    const searched = queryCatalogue({
      profile,
      scope: { kind: 'all' },
      search: 'biceps',
      equipment: '',
      searchAttribution: false,
    })
    expect(searched.rows.find(row => row.exercise.id === 'secondary-search')?.secondaryMatch).toBeNull()

    const filtered = queryCatalogue({
      profile,
      scope: { kind: 'muscle', muscle: 'biceps' },
      search: '',
      equipment: '',
      searchAttribution: false,
    })
    const ids = filtered.rows.map(row => row.exercise.id)
    expect(ids).toContain('secondary-search')
    expect(ids).toContain('secondary-filter')
    expect(filtered.rows.find(r => r.exercise.id === 'secondary-filter')?.secondaryMatch).toBe('biceps')
    expect(filtered.rows.find(r => r.exercise.id === 'secondary-search')?.secondaryMatch).toBe('biceps')
  })

  it('treats missing legacy Profile collections as empty', () => {
    const result = queryCatalogue({
      profile: { customEx: null, favorites: null, routines: null, workouts: null },
      scope: { kind: 'favorites' },
      search: 'anything',
      equipment: '',
    })

    expect({
      rows: result.rows,
      equipmentOptions: result.equipmentOptions,
      favoriteCount: result.favoriteCount,
      chosenCount: result.chosenCount,
    }).toEqual({ rows: [], equipmentOptions: [], favoriteCount: 0, chosenCount: 0 })
  })

  it('scores exercises with matched tokens, exact phrase bonus, and title matches', () => {
    const ex = exercise('specimen', 'Dumbbell Bench Press', 'chest', 'dumbbell', ['triceps'])

    // Exact contiguous phrase in title: 2 tokens (200) + exact bonus (50) + 2 title matches (20) = 270
    expect(scoreExerciseMatch(ex, ['dumbbell', 'bench'], 'dumbbell bench')).toBe(270)

    // Out-of-order words: 2 tokens (200) + no exact bonus (0) + 2 title matches (20) = 220
    expect(scoreExerciseMatch(ex, ['bench', 'dumbbell'], 'bench dumbbell')).toBe(220)

    // Single word in title: 1 token (100) + exact phrase bonus (50) + 1 title match (10) = 160
    expect(scoreExerciseMatch(ex, ['bench'], 'bench')).toBe(160)

    // Cross-attribute match: 1 in title, 1 in primary muscle: 2 tokens (200) + 0 exact phrase bonus (0) + 1 title match (10) = 210
    expect(scoreExerciseMatch(ex, ['dumbbell', 'chest'], 'dumbbell chest')).toBe(210)

    // Disjunctive partial match (1 hit, 1 miss): 1 token (100) + 0 exact + 1 title match (10) = 110
    expect(scoreExerciseMatch(ex, ['bench', 'squat'], 'bench squat')).toBe(110)



    // Hyphen-normalized exact phrase match: "push up" matching "Push-Up"
    const pushup = exercise('pu', 'Dumbbell Push-Up', 'chest', 'dumbbell')
    expect(scoreExerciseMatch(pushup, ['dumbbell', 'push', 'up'], 'dumbbell push up')).toBe(380) // 300 + 50 + 30
  })

  it('ranks exercises by relevance score in all scope across disjunctive, out-of-order, and cross-attribute queries', () => {
    const profile = {
      customEx: [
        exercise('ex-1', 'Barbell Bench Press', 'chest', 'barbell', ['triceps', 'deltoids']),
        exercise('ex-2', 'Dumbbell Bench Press', 'chest', 'dumbbell', ['triceps']),
        exercise('ex-3', 'Incline Dumbbell Bench Press', 'chest', 'dumbbell', ['triceps', 'deltoids']),
        exercise('ex-4', 'Barbell Back Squat', 'quadriceps', 'barbell', ['gluteal', 'hamstring']),
      ],
      favorites: [],
      routines: [],
      workouts: [],
    }

    // Disjunctive OR query: 3 terms matching differently across exercises
    // ex-3 matches 4 tokens: 'incline', 'dumbbell', 'bench', 'press' -> highest
    // ex-2 matches 3 tokens: 'dumbbell', 'bench', 'press'
    // ex-1 matches 2 tokens: 'bench', 'press'
    // ex-4 matches 0 tokens -> omitted
    const disjunctiveResult = queryCatalogue({
      profile,
      scope: { kind: 'all' },
      search: 'incline dumbbell bench press',
      equipment: '',
    })
    const disjunctiveIds = disjunctiveResult.rows.map(r => r.exercise.id).filter(id => id.startsWith('ex-'))
    expect(disjunctiveIds).toEqual(['ex-3', 'ex-2', 'ex-1'])

    // Out-of-order query: "bench dumbbell"
    // ex-2 and ex-3 match both 'bench' and 'dumbbell' (score 220)
    // ex-1 matches only 'bench' (score 110)
    // ex-4 matches neither -> omitted
    const outOfOrderResult = queryCatalogue({
      profile,
      scope: { kind: 'all' },
      search: 'bench dumbbell',
      equipment: '',
    })
    const outOfOrderIds = outOfOrderResult.rows.map(r => r.exercise.id).filter(id => id.startsWith('ex-'))
    expect(outOfOrderIds).toEqual(['ex-2', 'ex-3', 'ex-1'])

    // ex-1 matches 'barbell' (title/eq) and 'chest' (primary muscle) -> 2 tokens (210)
    // ex-4 matches 'barbell' in title (110); ex-2, ex-3 match 'chest' in primary muscle (100)
    const crossAttributeResult = queryCatalogue({
      profile,
      scope: { kind: 'all' },
      search: 'barbell chest',
      equipment: '',
    })
    const crossAttributeIds = crossAttributeResult.rows.map(r => r.exercise.id).filter(id => id.startsWith('ex-'))
    expect(crossAttributeIds).toEqual(['ex-1', 'ex-4', 'ex-2', 'ex-3'])



  })

  it('ranks chosen scope by search relevance when query is present, tie-breaking by usage count', () => {
    const profile = {
      customEx: [
        exercise('ex-popular-low-rel', 'Barbell Squat', 'quadriceps', 'barbell'),
        exercise('ex-rare-high-rel-1', 'Dumbbell Bench Press', 'chest', 'dumbbell'),
        exercise('ex-rare-high-rel-2', 'Incline Dumbbell Bench Press', 'chest', 'dumbbell'),
      ],
      favorites: [],
      // Usage counts: ex-popular-low-rel = 10, ex-rare-high-rel-1 = 1, ex-rare-high-rel-2 = 5
      routines: [
        {
          ex: [
            ...Array(10).fill({ id: 'ex-popular-low-rel' }),
            { id: 'ex-rare-high-rel-1' },
            ...Array(5).fill({ id: 'ex-rare-high-rel-2' }),
          ],
        },
      ],
      workouts: [],
    }

    // 1. With search "dumbbell bench":
    // ex-rare-high-rel-1 and ex-rare-high-rel-2 match 2 tokens (score 220)
    // ex-popular-low-rel matches 0 tokens -> excluded
    const searchedResult = queryCatalogue({
      profile,
      scope: { kind: 'chosen' },
      search: 'dumbbell bench',
      equipment: '',
    })
    // Between high-rel-1 (usage 1) and high-rel-2 (usage 5), high-rel-2 wins tie-breaker!
    expect(searchedResult.rows.map(r => ({ id: r.exercise.id, usage: r.usageCount }))).toEqual([
      { id: 'ex-rare-high-rel-2', usage: 5 },
      { id: 'ex-rare-high-rel-1', usage: 1 },
    ])

    // 2. With broader search "barbell bench" where popular lift has 1 match (110) and high-rel lifts have 1 match (110):
    // ex-popular-low-rel matches 'barbell' (score 110, usage 10)
    // ex-rare-high-rel-1 matches 'bench' (score 110, usage 1)
    // ex-rare-high-rel-2 matches 'bench' (score 110, usage 5)
    // Tied on score: usage count decides: 10 > 5 > 1!
    const tiedResult = queryCatalogue({
      profile,
      scope: { kind: 'chosen' },
      search: 'barbell bench',
      equipment: '',
    })
    expect(tiedResult.rows.map(r => r.exercise.id)).toEqual([
      'ex-popular-low-rel',
      'ex-rare-high-rel-2',
      'ex-rare-high-rel-1',
    ])

    // 3. When search is empty, pure usage count descending order is strictly preserved
    const emptySearchResult = queryCatalogue({
      profile,
      scope: { kind: 'chosen' },
      search: '',
      equipment: '',
    })
    expect(emptySearchResult.rows.map(r => r.exercise.id)).toEqual([
      'ex-popular-low-rel',
      'ex-rare-high-rel-2',
      'ex-rare-high-rel-1',
    ])
  })

  it('attributes secondary muscle on tokenized queries in queryCatalogue rows', () => {
    const profile = {
      customEx: [
        exercise('compound-bench', 'Barbell Compound Press', 'chest', 'barbell', ['triceps', 'deltoids']),
      ],
      favorites: [],
      routines: [],
      workouts: [],
    }

    // Tokenized query matching title + secondary muscle
    const result = queryCatalogue({
      profile,
      scope: { kind: 'all' },
      search: 'compound triceps',
      equipment: '',
    })
    const row = result.rows.find(r => r.exercise.id === 'compound-bench')
    expect(row?.secondaryMatch).toBe('triceps')

    // Query matching only title does not attribute secondary badge
    const titleOnlyResult = queryCatalogue({
      profile,
      scope: { kind: 'all' },
      search: 'compound press',
      equipment: '',
    })
    const titleRow = titleOnlyResult.rows.find(r => r.exercise.id === 'compound-bench')
    expect(titleRow?.secondaryMatch).toBeNull()

    // searchAttribution: false suppresses the badge even with tokenized search
    const suppressedResult = queryCatalogue({
      profile,
      scope: { kind: 'all' },
      search: 'compound triceps',
      equipment: '',
      searchAttribution: false,
    })
    const suppressedRow = suppressedResult.rows.find(r => r.exercise.id === 'compound-bench')
    expect(suppressedRow?.secondaryMatch).toBeNull()
  })
})

