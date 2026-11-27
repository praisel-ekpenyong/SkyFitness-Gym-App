import { describe, expect, it } from 'vitest'
import { freezePrescriptionRecord } from './prescription-record.js'
import { act } from './active-workout.js'

describe('freezePrescriptionRecord', () => {
  it('freezes a Prescription into only the Prescription-record fields', () => {
    const prescription = {
      kind: 'up',
      policy: 'double',
      weight: 40,
      reps: 11,
      sec: 0,
      sets: 3,
      why: ['hit'],
      by: 5,
    }

    expect(freezePrescriptionRecord(prescription)).toEqual({
      kind: 'up',
      weight: 40,
      reps: 11,
      sec: 0,
      sets: 3,
    })
  })

  it('returns null when there is no Prescription to freeze', () => {
    expect(freezePrescriptionRecord(null)).toBeNull()
    expect(freezePrescriptionRecord(undefined)).toBeNull()
    expect(freezePrescriptionRecord(0)).toBeNull()
    expect(freezePrescriptionRecord('up')).toBeNull()
  })

  it('omits resolution fields that are absent', () => {
    expect(freezePrescriptionRecord({
      kind: 'hold', weight: null, reps: undefined, sec: null, sets: undefined,
    })).toEqual({ kind: 'hold' })
  })

  it('freezes an already-frozen Prescription record to the same shape', () => {
    const record = { kind: 'deload', weight: 35, reps: 10, sec: null, sets: 3 }
    expect(freezePrescriptionRecord(record)).toEqual({ kind: 'deload', weight: 35, reps: 10, sets: 3 })
  })
})

describe('the Session boundary shares the freeze', () => {
  const target = { sets: 3, reps: 10, weight: 40 }
  const sets = [
    { done: true, w: 40, r: 11 },
    { done: true, w: 40, r: 11 },
    { done: true, w: 40, r: 11 },
  ]
  /** @param {object | null} plan */
  const finishWith = plan => {
    const S = {
      unit: 'kg',
      workouts: [],
      active: {
        id: 'w1', d: '2026-01-02', start: 1, unit: 'kg',
        entries: [{ id: 'lift', target, sets, ...(plan ? { plan } : {}) }],
      },
    }
    return act(S, { type: 'finish' }).result.workout
  }

  it('writes the Prospective Prescription record through the shared primitive', () => {
    const workout = finishWith({
      kind: 'up', policy: 'double', weight: 40, reps: 11, sets: 3, why: ['hit'], by: 5,
    })
    // A fully hit session advances; the boundary records the reading's next Prescription.
    expect(workout.entries[0].plan).toEqual({ kind: 'up', weight: 42.5 })
  })

  it('derives the record from the Target for an entry written before plans existed', () => {
    const workout = finishWith(null)
    expect(workout.entries[0].plan).toEqual({ kind: 'up', weight: 42.5 })
    expect(workout.entries[0].target).toEqual(target)
  })
})
