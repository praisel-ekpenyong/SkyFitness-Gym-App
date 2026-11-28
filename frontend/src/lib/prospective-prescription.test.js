import { describe, expect, it } from 'vitest'
import { readProspectivePrescription } from './prospective-prescription.js'
import { act } from './active-workout.js'
import { sessionProgressionItems } from './progression.js'

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

/** Finish through the public store action (ADR 0023). @param {any} S */
const finishActive = S => act(S, { type: 'finish' }).result.workout

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

describe('the Session boundary and the summary read the one Prospective Prescription', () => {
  it('records the Prescription the reading guarantees on the finished Entry', () => {
    // The asked plan is a hold, but a fully hit session advances: the record must follow the
    // reading (the same advance the cue showed), not the stale plan carried on the Active Entry.
    const active = activeOf([bench(hits(3), { plan: { kind: 'hold', weight: 60 } })])
    const S = { ...profileOf(), active }
    const reading = readProspectivePrescription(active, S)

    const workout = finishActive(S)

    expect(reading.entries['barbell-bench-press'].plan).toEqual({ kind: 'up', weight: 62.5 })
    expect(workout.entries[0].plan).toEqual(reading.entries['barbell-bench-press'].plan)
  })

  it('records a Deload consistently with the reading', () => {
    const misses = Array.from({ length: 3 }, (_, i) => ({
      id: 'w-miss-' + i, d: '2026-06-1' + i, start: 0, end: 1, routineId: 'r-1', name: '',
      bw: null, unit: 'kg',
      entries: [bench([{ r: 2, w: 60, done: true }, { r: 2, w: 60, done: true }, { r: 2, w: 60, done: true }])],
    }))
    const active = activeOf([bench([{ r: 2, w: 60, done: true }, { r: 2, w: 60, done: true }, { r: 2, w: 60, done: true }])])
    const S = { ...profileOf({ workouts: misses }), active }
    const reading = readProspectivePrescription(active, S)

    const workout = finishActive(S)

    expect(reading.entries['barbell-bench-press'].plan.kind).toBe('deload')
    expect(workout.entries[0].plan).toEqual(reading.entries['barbell-bench-press'].plan)
  })

  it('reads the finished Workout by id and the Active unit for the summary', () => {
    const entry = bench([{ r: 5, w: 135, done: true }, { r: 5, w: 135, done: true }, { r: 5, w: 135, done: true }], {
      target: { mode: 'reps', reps: 5, weight: 135, prog: 'linear', sets: 3, inc: 5 },
    })
    const logged = {
      id: 'a-1', d: '2026-06-15', start: 1000, end: 2000, routineId: 'r-1', name: 'Push day',
      bw: null, unit: 'lb', entries: [entry],
    }
    const S = profileOf({ unit: 'kg', workouts: [logged] })
    const reading = readProspectivePrescription(logged, S)

    expect(reading.workout).toBe(logged)

    // The existing summary seams through the reading instead of building its own stand-in in
    // the Profile unit, so a mid-session unit change agrees with the cue and the record.
    const items = sessionProgressionItems(logged, S, reading)
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('135 lb → 140 lb (+5 lb)')

    const workout = finishActive({ ...S, active: { ...logged, end: undefined } })
    expect(workout.entries[0].plan).toEqual({ kind: 'up', weight: 140 })
  })

  it('lists the same next Prescription in the summary as the cue and the record', () => {
    const curl = { id: 'dumbbell-curl', target: { mode: 'reps', reps: 10, weight: 14, prog: 'linear', sets: 2 }, sets: [{ r: 10, w: 14, done: true }, { r: 10, w: 14, done: true }] }
    const active = activeOf([bench(hits(3)), curl])
    const S = { ...profileOf(), active }
    const reading = readProspectivePrescription(active, S)
    const summary = sessionProgressionItems(reading.workout, S, reading)

    expect(summary.map(i => i.id)).toEqual(['barbell-bench-press', 'dumbbell-curl'])
    // Concrete next targets, independent of the reading: a wrong summary cannot pass these.
    expect(summary.map(i => i.text)).toEqual([
      '60 kg → 62.5 kg (+2.5 kg)',
      '14 kg → 16.5 kg (+2.5 kg)',
    ])

    const workout = finishActive(S)
    expect(workout.entries.map(e => e.plan)).toEqual([
      { kind: 'up', weight: 62.5 },
      { kind: 'up', weight: 16.5 },
    ])
  })

  it('does not count the finished Workout twice in the Training log reading', () => {
    const logged = {
      id: 'a-1', d: '2026-06-15', start: 1000, end: 2000, routineId: 'r-1', name: '',
      bw: null, unit: 'kg', entries: [bench(hits(3))],
    }
    const S = profileOf({ workouts: [logged] })
    const before = readProspectivePrescription({ ...logged, end: null }, S)
    const after = readProspectivePrescription(logged, S)

    expect(after.workout).toBe(logged)
    expect(after.entries['barbell-bench-press'].prescription)
      .toEqual(before.entries['barbell-bench-press'].prescription)
    expect(before.entries['barbell-bench-press'].prescription)
      .toMatchObject({ kind: 'up', weight: 62.5 })
    expect(sessionProgressionItems(logged, S, after)[0].text)
      .toBe('60 kg → 62.5 kg (+2.5 kg)')
  })

  it('describes a Hold, a Drop and a Deload the same way across the three readers', () => {
    const drop = bench([
      { r: 6, w: 24, done: true }, { r: 6, w: 24, done: true }, { r: 5, w: 24, done: true },
    ], { target: { mode: 'reps', reps: 12, repsMin: 8, weight: 24, prog: 'double', sets: 3, inc: 2 } })
    const cases = [
      { entry: bench([{ r: 4, w: 60, done: true }, { r: 4, w: 60, done: true }, { r: 4, w: 60, done: true }]), kind: 'hold', text: 'Hold at 60 kg to solidify volume' },
      { entry: drop, kind: 'down', text: 'Drop 2 kg, back to 8 reps' },
      { entry: bench([{ r: 2, w: 60, done: true }, { r: 2, w: 60, done: true }, { r: 2, w: 60, done: true }]), kind: 'deload', stalls: 3, text: 'Deload to 55 kg' },
    ]
    for (const { entry, kind, text, stalls = 0 } of cases) {
      const history = Array.from({ length: stalls }, (_, i) => ({
        id: 'w-' + i, d: '2026-06-1' + i, start: 0, end: 1, routineId: 'r-1', name: '',
        bw: null, unit: 'kg',
        entries: [bench(Array.from({ length: 3 }, () => ({ r: 2, w: 60, done: true })))],
      }))
      const active = activeOf([entry])
      const S = { ...profileOf({ workouts: history }), active }
      const reading = readProspectivePrescription(active, S)
      const summary = sessionProgressionItems(reading.workout, S, reading)[0]

      expect(reading.entries['barbell-bench-press'].prescription.kind).toBe(kind)
      expect(summary.kind).toBe(kind)
      const workout = finishActive(S)
      expect(workout.entries[0].plan.kind).toBe(kind)
      expect(summary.text).toBe(text)
    }
  })
})
