import { describe, expect, it } from 'vitest'
import { EXIDX } from './exercises.js'

describe('exercise search', () => {
  it('matches keyword search across name, target, canonical muscles, secondary muscles, and equipment', async () => {
    const { matchesExerciseSearch } = await import('./exercise-search.js')
    const bench = EXIDX['0025']

    expect(matchesExerciseSearch(bench, '')).toBe(true)
    expect(matchesExerciseSearch(bench, 'bench')).toBe(true)
    expect(matchesExerciseSearch(bench, 'barbell')).toBe(true)
    expect(matchesExerciseSearch(bench, 'chest')).toBe(true)
    expect(matchesExerciseSearch(bench, 'triceps')).toBe(true)
    expect(matchesExerciseSearch('0025', 'deltoids')).toBe(true)
    expect(matchesExerciseSearch(bench, 'squat')).toBe(false)
  })

  it('extracts matching secondary muscle slug for search queries', async () => {
    const { secondaryMatchForQuery } = await import('./exercise-search.js')
    const bench = EXIDX['0025']

    expect(secondaryMatchForQuery(bench, 'triceps')).toBe('triceps')
    expect(secondaryMatchForQuery('0025', 'triceps')).toBe('triceps')
    expect(secondaryMatchForQuery(bench, 'delts')).toBe('front-delts')
    expect(secondaryMatchForQuery(bench, 'bench')).toBeNull()
    expect(secondaryMatchForQuery(bench, 'chest')).toBeNull()
    expect(secondaryMatchForQuery(bench, 'biceps')).toBeNull()
  })
})

describe('tokenized catalogue search & normalization', () => {
  it('tokenizes search queries with punctuation removal, stop-word filtering, and noise removal', async () => {
    const { tokenizeSearchQuery, SEARCH_STOP_WORDS } = await import('./exercise-search.js')

    expect(SEARCH_STOP_WORDS.has('with')).toBe(true)
    expect(SEARCH_STOP_WORDS.has('on')).toBe(true)

    expect(tokenizeSearchQuery('Dumbbell Bench Press')).toEqual(['dumbbell', 'bench', 'press'])

    expect(tokenizeSearchQuery('push-up')).toEqual(['push', 'up'])
    expect(tokenizeSearchQuery('45-degree leg-press!')).toEqual(['45', 'degree', 'leg', 'press'])

    expect(tokenizeSearchQuery('curls with band')).toEqual(['curls', 'band'])
    expect(tokenizeSearchQuery('squat on the box')).toEqual(['squat', 'box'])
    expect(tokenizeSearchQuery('press for chest')).toEqual(['press', 'chest'])

    expect(tokenizeSearchQuery('bench x')).toEqual(['bench'])
    expect(tokenizeSearchQuery('bench 1')).toEqual(['bench', '1'])
    expect(tokenizeSearchQuery('plan b')).toEqual(['plan'])

    expect(tokenizeSearchQuery('on')).toEqual(['on'])
    expect(tokenizeSearchQuery('for the')).toEqual(['for', 'the'])
    expect(tokenizeSearchQuery('a')).toEqual(['a'])
    expect(tokenizeSearchQuery('x')).toEqual(['x'])

    expect(tokenizeSearchQuery('')).toEqual([])
    expect(tokenizeSearchQuery('   ')).toEqual([])
    expect(tokenizeSearchQuery('---')).toEqual([])
    expect(tokenizeSearchQuery(null)).toEqual([])
    expect(tokenizeSearchQuery(undefined)).toEqual([])
  })

  it('matches exercises out of order, across attributes, and with hyphen normalization', async () => {
    const { matchesExerciseSearch } = await import('./exercise-search.js')
    const bench = EXIDX['0025']

    expect(matchesExerciseSearch(bench, 'bench barbell')).toBe(true)
    expect(matchesExerciseSearch(bench, 'press barbell bench')).toBe(true)

    expect(matchesExerciseSearch(bench, 'barbell chest')).toBe(true)
    expect(matchesExerciseSearch(bench, 'barbell pectorals')).toBe(true)

    expect(matchesExerciseSearch(bench, 'bench triceps')).toBe(true)
    expect(matchesExerciseSearch(bench, 'bench deltoids')).toBe(true)

    const pushupEx = { id: 'c-pu', n: 'Close-Grip Push-Up', tg: 'chest', bp: 'chest', eq: 'body weight' }
    expect(matchesExerciseSearch(pushupEx, 'push up')).toBe(true)
    expect(matchesExerciseSearch(pushupEx, 'push-up')).toBe(true)
    expect(matchesExerciseSearch(pushupEx, 'close grip push up')).toBe(true)

    const spacePushup = { id: 'c-pu2', n: 'Push Up', tg: 'chest', bp: 'chest', eq: 'body weight' }
    expect(matchesExerciseSearch(spacePushup, 'push-up')).toBe(true)
    expect(matchesExerciseSearch(spacePushup, 'push up')).toBe(true)

    expect(matchesExerciseSearch(bench, 'bench squat')).toBe(true)
    expect(matchesExerciseSearch(bench, 'unrelated bench')).toBe(true)
    expect(matchesExerciseSearch(bench, 'unrelated squat')).toBe(false)

    const bandCurl = { id: 'c-bc', n: 'Band Bicep Curl', tg: 'biceps', eq: 'band' }
    expect(matchesExerciseSearch(bandCurl, 'curls with band')).toBe(true)

    const withDesc = { id: 'c-desc', n: 'Custom Lift', tg: 'chest', bp: 'chest', desc: 'Keep elbows tucked' }
    expect(matchesExerciseSearch(withDesc, 'elbows')).toBe(true)
    expect(matchesExerciseSearch(withDesc, 'tucked')).toBe(true)
  })

  it('attributes secondary muscles on tokenized queries while suppressing title and primary hits', async () => {
    const { secondaryMatchForQuery } = await import('./exercise-search.js')
    const bench = EXIDX['0025']

    expect(secondaryMatchForQuery(bench, 'bench triceps')).toBe('triceps')
    expect(secondaryMatchForQuery(bench, 'triceps bench')).toBe('triceps')
    expect(secondaryMatchForQuery(bench, 'barbell triceps')).toBe('triceps')

    expect(secondaryMatchForQuery(bench, 'bench delts')).toBe('front-delts')
    expect(secondaryMatchForQuery(bench, 'bench shoulders')).toBe('front-delts')

    expect(secondaryMatchForQuery(bench, 'chest')).toBeNull()
    expect(secondaryMatchForQuery(bench, 'bench chest')).toBeNull()
    expect(secondaryMatchForQuery(bench, 'pectorals')).toBeNull()

    expect(secondaryMatchForQuery(bench, 'bench press')).toBeNull()
    expect(secondaryMatchForQuery(bench, 'barbell')).toBeNull()

    expect(secondaryMatchForQuery(bench, 'triceps delts')).toBe('triceps')
  })
})
