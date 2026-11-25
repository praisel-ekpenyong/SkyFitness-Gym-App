import { describe, it, expect } from 'vitest'
import { matchExercise } from './import-csv.js'
import { EXIDX } from './exercises.js'

const MAPS = {
  Treadmill: '3666',
  'Goblet Squat': '1760',
  Cycling: '2331',
  'Cable Core Pallof Press': '0979',
  Elliptical: '2141',
  'Stationary Bike': '2138',
}

describe('foreign exercise names resolve to the catalogue', () => {
  for (const [name, id] of Object.entries(MAPS)) {
    it(`maps "${name}" to ${id}`, () => {
      expect(matchExercise(name)).toBe(id)
      expect(EXIDX[id]).toBeTruthy()
    })
  }

  it('keeps the qualified variants distinct', () => {
    expect(matchExercise('Kettlebell Goblet Squat')).toBe('0534')
    expect(matchExercise('Dumbbell Goblet Squat')).toBe('1760')
  })

  it('ignores word order and case', () => {
    expect(matchExercise('Squat (Barbell)')).toBe(matchExercise('Barbell Squat'))
  })

  it('leaves the established aliases alone', () => {
    expect(matchExercise('Bench Press')).toBe('0025')
    expect(matchExercise('Squat')).toBe('0043')
    expect(matchExercise('Barbell Row')).toBe('0027')
    expect(matchExercise('Deadlift')).toBe('0032')
  })

  it('still refuses to guess', () => {
    expect(matchExercise('Some Movement I Invented')).toBe(null)
    expect(matchExercise('')).toBe(null)
  })
})
