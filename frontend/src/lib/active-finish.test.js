import { describe, it, expect } from 'vitest'
import { completeActiveSession } from './active-finish.js'

describe('completeActiveSession routineSync integration', () => {
  it('returns routineSync with diff details when session differs from originating routine', () => {
    const S = {
      unit: 'kg',
      workouts: [],
      exWeights: {},
      routines: [
        {
          id: 'routine-push',
          name: 'Push Day',
          ex: [
            { id: '0025', sets: 3 },
          ],
        },
      ],
      active: {
        id: 'active-1',
        d: '2026-10-29',
        start: 1000,
        routineId: 'routine-push',
        name: 'Push Day',
        bw: null,
        unit: 'kg',
        cur: 0,
        entries: [
          // Performed 4 sets instead of 3
          {
            id: '0025',
            sets: [
              { w: 80, r: 5, done: true },
              { w: 80, r: 5, done: true },
              { w: 80, r: 5, done: true },
              { w: 80, r: 5, done: true },
            ],
            target: { sets: 3, reps: 5 },
          },
          // Spontaneously added exercise
          {
            id: '0026',
            sets: [
              { w: 30, r: 10, done: true },
            ],
            target: { sets: 1, reps: 10 },
          },
        ],
      },
    }

    const result = completeActiveSession(S, { now: () => 2000 })
    expect(result).not.toBeNull()
    expect(result.routineSync).not.toBeNull()
    expect(result.routineSync.hasDiff).toBe(true)
    expect(result.routineSync.routineId).toBe('routine-push')
    expect(result.routineSync.routineName).toBe('Push Day')
    expect(result.routineSync.changes.length).toBeGreaterThan(0)
    expect(result.routineSync.syncedEx).toEqual([
      { id: '0025', sets: 4, reps: 5 },
      { id: '0026', sets: 1, reps: 10 },
    ])
    expect(S.active).toBeNull()
  })

  it('returns routineSync: null when session matches originating routine exactly (no diff)', () => {
    const S = {
      unit: 'kg',
      workouts: [],
      exWeights: {},
      routines: [
        {
          id: 'routine-push',
          name: 'Push Day',
          ex: [
            { id: '0025', sets: 3, reps: 5 },
          ],
        },
      ],
      active: {
        id: 'active-1',
        d: '2026-10-29',
        start: 1000,
        routineId: 'routine-push',
        name: 'Push Day',
        bw: null,
        unit: 'kg',
        cur: 0,
        entries: [
          {
            id: '0025',
            sets: [
              { w: 80, r: 5, done: true },
              { w: 80, r: 5, done: true },
              { w: 80, r: 5, done: true },
            ],
            target: { sets: 3, reps: 5 },
          },
        ],
      },
    }

    const result = completeActiveSession(S, { now: () => 2000 })
    expect(result).not.toBeNull()
    expect(result.routineSync).toBeNull()
    expect(S.active).toBeNull()
  })

  it('returns routineSync: null for freestyle workouts (routineId == null)', () => {
    const S = {
      unit: 'kg',
      workouts: [],
      exWeights: {},
      routines: [
        {
          id: 'routine-push',
          name: 'Push Day',
          ex: [{ id: '0025', sets: 3 }],
        },
      ],
      active: {
        id: 'active-1',
        d: '2026-10-29',
        start: 1000,
        routineId: null,
        name: 'Freestyle',
        bw: null,
        unit: 'kg',
        cur: 0,
        entries: [
          {
            id: '0025',
            sets: [{ w: 80, r: 5, done: true }],
            target: { sets: 1, reps: 5 },
          },
        ],
      },
    }

    const result = completeActiveSession(S, { now: () => 2000 })
    expect(result).not.toBeNull()
    expect(result.routineSync).toBeNull()
    expect(S.active).toBeNull()
  })

  it('returns routineSync: null when originating routine is missing from S.routines', () => {
    const S = {
      unit: 'kg',
      workouts: [],
      exWeights: {},
      routines: [],
      active: {
        id: 'active-1',
        d: '2026-10-29',
        start: 1000,
        routineId: 'deleted-routine',
        name: 'Old Routine',
        bw: null,
        unit: 'kg',
        cur: 0,
        entries: [
          {
            id: '0025',
            sets: [{ w: 80, r: 5, done: true }],
            target: { sets: 1, reps: 5 },
          },
        ],
      },
    }

    const result = completeActiveSession(S, { now: () => 2000 })
    expect(result).not.toBeNull()
    expect(result.routineSync).toBeNull()
  })
})
