import { describe, it, expect } from 'vitest'
import { starterRoutines } from './starter.js'
import { EXIDX } from './exercises.js'

describe('starter routines factory', () => {
  it('generates the standard 3-day Push/Pull/Legs starter routines with fresh IDs', () => {
    const routines1 = starterRoutines()
    const routines2 = starterRoutines()

    expect(routines1.length).toBe(3)
    expect(routines2.length).toBe(3)

    expect(routines1.map(r => r.name)).toEqual(['Push Day', 'Pull Day', 'Leg Day'])
    expect(routines1.map(r => r.emoji)).toEqual(['barbell', 'pullup', 'legs'])

    // IDs must be unique per call
    const ids1 = routines1.map(r => r.id)
    const ids2 = routines2.map(r => r.id)
    expect(new Set([...ids1, ...ids2]).size).toBe(6)
  })

  it('configures valid default sets, reps, and initial weight for all starter exercises', () => {
    const routines = starterRoutines()
    routines.forEach(routine => {
      expect(Array.isArray(routine.ex)).toBe(true)
      expect(routine.ex.length).toBeGreaterThanOrEqual(5)
      routine.ex.forEach(e => {
        expect(typeof e.id).toBe('string')
        expect(e.sets).toBeGreaterThanOrEqual(1)
        expect(e.reps).toBeGreaterThanOrEqual(1)
        expect(e.weight).toBe(0)
      })
    })
  })

  it('guarantees referential integrity against the shipped exercise catalogue', () => {
    const routines = starterRoutines()
    routines.forEach(routine => {
      routine.ex.forEach(e => {
        const item = EXIDX[e.id]
        expect(item, `Starter exercise ID ${e.id} in "${routine.name}" must exist in EXIDX`).toBeDefined()
        expect(typeof item.n).toBe('string')
        expect(item.n.length).toBeGreaterThan(0)
      })
    })
  })
})
