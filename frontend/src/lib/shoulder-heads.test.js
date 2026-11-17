import { describe, expect, it } from 'vitest'
import { queryCatalogue } from './catalogue-query.js'
import { FILTER_MUSCLES, PICKABLE_MUSCLES, MUSCLE_NAME, isSecondaryMuscleMatch, matchesMuscleFilter, musclesOf, primaryMuscleOf, secondaryMusclesOf, sessionMuscleDistribution } from './muscles.js'

describe('shoulder heads at the muscle lookup', () => {
  it('credits an overhead press to front delts', () => {
    expect(musclesOf('0426')).toMatchObject({ 'front-delts': 1 })
  })

  it('credits a lateral raise to side delts', () => {
    expect(musclesOf('0334')).toEqual({ 'side-delts': 1, trapezius: 0.4 })
  })

  it('credits an upright row to side delts', () => {
    expect(musclesOf('0120')).toEqual({ 'side-delts': 1, trapezius: 0.4, biceps: 0.4 })
  })

  it('credits a rear-delt raise to rear delts', () => {
    expect(musclesOf('2292')).toEqual({ 'rear-delts': 1, trapezius: 0.4, 'upper-back': 0.4 })
  })

  // The catalogue has no face pull; a band reverse fly and a rope rear-delt row are its closest moves.
  it('credits reverse flyes and rear-delt rows to rear delts', () => {
    expect(musclesOf('0993')).toEqual({ 'rear-delts': 1, 'upper-back': 0.4, trapezius: 0.4 })
    expect(musclesOf('0203')).toMatchObject({ 'rear-delts': 1 })
  })

  it('gives bench pressing front-delt helper credit', () => {
    expect(musclesOf('0025')).toEqual({ chest: 1, triceps: 0.4, 'front-delts': 0.4 })
    expect(musclesOf('0314')).toEqual({ chest: 1, 'front-delts': 0.4, triceps: 0.4 })
  })

  it('gives rows rear-delt helper credit', () => {
    expect(musclesOf('0027')).toMatchObject({ 'upper-back': 1, 'rear-delts': 0.4 })
    expect(musclesOf('0234')).toMatchObject({ 'rear-delts': 0.4 })
  })

  it('reads a legacy custom "Shoulders" primary as front 1, side 0.4, rear 0.4', () => {
    const custom = { id: 'c-press', n: 'My press', tg: 'deltoids', sm: ['triceps'] }
    expect(musclesOf(custom)).toEqual({ 'front-delts': 1, 'side-delts': 0.4, 'rear-delts': 0.4, triceps: 0.4 })
    expect(primaryMuscleOf(custom)).toBe('front-delts')
    expect(secondaryMusclesOf(custom)).toEqual(['side-delts', 'rear-delts', 'triceps'])
  })

  it('reads a legacy custom "Shoulders" secondary as front 0.4', () => {
    const custom = { id: 'c-dip', n: 'My dip', tg: 'chest', sm: ['deltoids', 'triceps'] }
    expect(musclesOf(custom)).toEqual({ chest: 1, 'front-delts': 0.4, triceps: 0.4 })
    expect(secondaryMusclesOf(custom)).toEqual(['front-delts', 'triceps'])
  })

  it('reads an old workout snapshot of a Shoulders custom without rewriting it', () => {
    const entry = { id: 'c-gone', muscleSnapshot: { n: 'Old press', muscleWeights: { deltoids: 1, triceps: 0.4 } } }
    const before = JSON.stringify(entry)
    expect(musclesOf(entry)).toEqual({ 'front-delts': 1, 'side-delts': 0.4, 'rear-delts': 0.4, triceps: 0.4 })
    expect(musclesOf({ muscleWeights: { chest: 1, deltoids: 0.4 } })).toEqual({ chest: 1, 'front-delts': 0.4 })
    expect(JSON.stringify(entry)).toBe(before)
  })

  it('keeps the head a new custom exercise names', () => {
    const custom = { id: 'c-raise', n: 'My raise', tg: 'side-delts', sm: ['rear-delts'] }
    expect(musclesOf(custom)).toEqual({ 'side-delts': 1, 'rear-delts': 0.4 })
  })

  it('lists the heads in the session muscle distribution', () => {
    const done = { done: true, w: 10, r: 10 }
    const dist = sessionMuscleDistribution({ entries: [{ id: '0334', sets: [done, done, done] }] })
    expect(dist.map(m => [m.name, m.effectiveSets])).toEqual([['Side delts', 3], ['Traps', 1.2]])
  })
})

describe('shoulder heads in the muscle filter', () => {
  it('shows a Shoulders chip before the three heads, and the custom picker offers only the heads', () => {
    expect(FILTER_MUSCLES.slice(0, 5).map(m => MUSCLE_NAME[m])).toEqual(['Traps', 'Shoulders', 'Front delts', 'Side delts', 'Rear delts'])
    expect(FILTER_MUSCLES).toHaveLength(23)
    expect(PICKABLE_MUSCLES).not.toContain('shoulders')
    expect(PICKABLE_MUSCLES).toHaveLength(22)
  })

  it('matches each head on its own chip', () => {
    expect(matchesMuscleFilter('0334', 'side-delts')).toBe(true)
    expect(matchesMuscleFilter('0334', 'front-delts')).toBe(false)
    expect(matchesMuscleFilter('0025', 'front-delts')).toBe(true)
    expect(isSecondaryMuscleMatch('0025', 'front-delts')).toBe(true)
  })

  it('matches all three heads on the Shoulders chip', () => {
    expect(matchesMuscleFilter('0426', 'shoulders')).toBe(true)
    expect(matchesMuscleFilter('0334', 'shoulders')).toBe(true)
    expect(matchesMuscleFilter('2292', 'shoulders')).toBe(true)
    expect(matchesMuscleFilter('0025', 'shoulders')).toBe(true)
    expect(matchesMuscleFilter('0043', 'shoulders')).toBe(false)
    expect(isSecondaryMuscleMatch('0334', 'shoulders')).toBe(false)
    expect(isSecondaryMuscleMatch('0025', 'shoulders')).toBe(true)
  })

  it('lists every head on the Library Shoulders chip', () => {
    const { rows } = queryCatalogue({ scope: { kind: 'muscle', muscle: 'shoulders' } })
    const ids = rows.map(r => r.exercise.id)
    expect(ids).toEqual(expect.arrayContaining(['0426', '0334', '2292', '0025']))
    expect(ids).not.toContain('0043')
    expect(rows.find(r => r.exercise.id === '0025').secondaryMatch).toBe('shoulders')
    expect(rows.find(r => r.exercise.id === '0334').secondaryMatch).toBe(null)
  })
})
