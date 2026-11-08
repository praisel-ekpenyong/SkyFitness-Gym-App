import { describe, it, expect } from 'vitest'
import { completeActiveSession, bestKnownWeight, mergeExWeight } from './active-finish.js'

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

describe('read-time unit normalization in active-finish (ADR 0019)', () => {
  it('stamps unit on mergeExWeight and respects monotonic max across units', () => {
    const S = { unit: 'kg', exWeights: {} }
    // Record 100 kg
    expect(mergeExWeight(S, 'ex1', 100, '2026-11-08')).toBe(true)
    expect(S.exWeights.ex1).toEqual({ w: 100, d: '2026-11-08', unit: 'kg' })

    // Switch profile to lb
    S.unit = 'lb'
    // 210 lb is ~95.3 kg < 100 kg (220.5 lb) -> rejected
    expect(mergeExWeight(S, 'ex1', 210, '2026-11-09')).toBe(false)
    expect(S.exWeights.ex1.w).toBe(100)

    // 230 lb is ~104.3 kg > 100 kg (220.5 lb) -> accepted
    expect(mergeExWeight(S, 'ex1', 230, '2026-11-09')).toBe(true)
    expect(S.exWeights.ex1).toEqual({ w: 230, d: '2026-11-09', unit: 'lb' })
  })

  it('normalizes bestKnownWeight from both history and cached exWeights to active unit', () => {
    const S = {
      unit: 'kg',
      workouts: [
        {
          d: '2026-11-01',
          unit: 'lb',
          entries: [{ id: 'bench', sets: [{ w: 200, r: 5, done: true }] }],
        },
      ],
      exWeights: {
        squat: { w: 300, d: '2026-11-01', unit: 'lb' },
      },
    }

    // In kg:
    // bench: 200 lb -> 90.7 kg
    expect(bestKnownWeight(S, 'bench')).toBe(90.7)
    // squat: 300 lb -> 136.1 kg
    expect(bestKnownWeight(S, 'squat')).toBe(136.1)

    // Switch to lb:
    S.unit = 'lb'
    expect(bestKnownWeight(S, 'bench')).toBe(200)
    expect(bestKnownWeight(S, 'squat')).toBe(300)
  })
})
