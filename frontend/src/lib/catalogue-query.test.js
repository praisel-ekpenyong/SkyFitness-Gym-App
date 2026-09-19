import { describe, expect, it } from 'vitest'
import { queryCatalogue } from './catalogue-query.js'

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
})
