import { describe, expect, it } from 'vitest'
import { readProspectivePrescription } from './prospective-prescription.js'

/** @param {Array<any>} entries @param {Record<string, any>} [overrides] */
const activeOf = (entries, overrides = {}) => ({
  id: 'a-1',
  d: '2026-06-15',
  start: 1000,
  routineId: 'r-1',
  name: 'Push day',
  bw: null,
  unit: 'kg',
  cur: 0,
  entries,
  ...overrides,
})

/** @param {Record<string, any>} [overrides] */
const profileOf = (overrides = {}) => ({
  unit: 'kg',
  workouts: [],
  routines: [{ id: 'r-1', name: 'Push', prog: 'linear', ex: [] }],
  ...overrides,
})

const bench = (sets, overrides = {}) => ({
  id: 'barbell-bench-press',
  target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear', sets: 3 },
  sets,
  ...overrides,
})

const hits = (n, w = 60) => Array.from({ length: n }, () => ({ r: 5, w, done: true }))

describe('readProspectivePrescription', () => {
  it('returns one immutable reading whose canonical Workout comes from the Active workout', () => {
    const entry = bench(hits(2), { plan: { kind: 'first', policy: 'linear' } })
    const curl = { id: 'dumbbell-curl', target: { mode: 'reps', reps: 10, weight: 14, prog: 'linear', sets: 2 }, sets: [{ r: 10, w: 14, done: true }] }
    const active = activeOf([entry, curl], { unit: 'lb', d: '2026-06-15' })
    const result = readProspectivePrescription(active, profileOf())

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.entries)).toBe(true)
    expect(Object.isFrozen(result.items)).toBe(true)

    expect(result.workout.id).toBe('a-1')
    expect(result.workout.d).toBe('2026-06-15')
    expect(result.workout.routineId).toBe('r-1')
    expect(result.workout.unit).toBe('lb')
    expect(result.workout.entries).toHaveLength(2)
    // Mid-session duration is unknown: no placeholder clock or fixed future date.
    expect(result.workout.end).toBeNull()
    // The frozen Prescription-record shape drops fields the boundary never writes.
    expect(result.workout.entries[0].plan).toEqual({ kind: 'first' })
  })

  it('uses one Progression judgement for both cue lookup and the summary grouping', () => {
    const result = readProspectivePrescription(activeOf([bench(hits(3))]), profileOf())
    const reading = result.entries['barbell-bench-press']

    expect(reading.prescription.kind).toBe('up')
    expect(reading.prescription.weight).toBe(62.5)
    expect(reading.plan).toEqual({ kind: 'up', weight: 62.5 })
    expect(reading.step).toBe(2.5)
    expect(result.items[0]).toBe(reading)
  })

  it('reads the logged Workout instead of appending a stand-in when the Active id is in the Training log', () => {
    const loggedEntry = bench(hits(3))
    const logged = {
      id: 'a-1', d: '2026-06-15', start: 0, end: 1, routineId: 'r-1', name: '', bw: null,
      unit: 'kg', entries: [loggedEntry]
    }
    const activeEntry = bench([{ r: 3, w: 100, done: true }])
    const result = readProspectivePrescription(activeOf([activeEntry]), profileOf({ workouts: [logged] }))

    expect(result.workout).toBe(logged)
    expect(result.entries['barbell-bench-press'].entry).toBe(loggedEntry)
    expect(result.entries['barbell-bench-press'].prescription.kind).toBe('up')
    expect(result.entries['barbell-bench-press'].prescription.weight).toBe(62.5)
  })

  it('judges every Entry against the same canonical Workout', () => {
    const curl = { id: 'dumbbell-curl', target: { mode: 'reps', reps: 10, weight: 14, prog: 'linear', sets: 2 }, sets: [{ r: 10, w: 14, done: true }] }
    const result = readProspectivePrescription(activeOf([bench(hits(2)), curl]), profileOf())

    expect(Object.keys(result.entries)).toEqual(['barbell-bench-press', 'dumbbell-curl'])
    expect(result.items).toHaveLength(2)
    expect(result.entries['barbell-bench-press'].entry).toBe(result.workout.entries[0])
    expect(result.entries['dumbbell-curl'].entry).toBe(result.workout.entries[1])
  })

  it('reads the Active unit consistently when it differs from the Profile unit', () => {
    const entry = bench([{ r: 5, w: 135, done: true }], {
      target: { mode: 'reps', reps: 5, weight: 135, prog: 'linear', sets: 1, inc: 5 }
    })
    const result = readProspectivePrescription(activeOf([entry], { unit: 'lb' }), profileOf({ unit: 'kg' }))
    const reading = result.entries['barbell-bench-press']

    expect(result.workout.unit).toBe('lb')
    expect(reading.unit).toBe('lb')
    expect(reading.prescription.weight).toBe(140)
  })

  it('does not mutate the Active workout or the Profile', () => {
    const active = activeOf([bench(hits(2))])
    const profile = profileOf()
    const activeSnapshot = JSON.stringify(active)
    const profileSnapshot = JSON.stringify(profile)

    readProspectivePrescription(active, profile)

    expect(JSON.stringify(active)).toBe(activeSnapshot)
    expect(JSON.stringify(profile)).toBe(profileSnapshot)
  })
})
