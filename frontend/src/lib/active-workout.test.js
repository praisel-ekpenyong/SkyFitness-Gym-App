// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { bestKnownWeight, heaviestSetWeight, heaviestForEntry, mergeExWeight, createActiveSession, applyWorkingWeight, completeActiveSession } from './active-workout.js'
import { DEF } from '../store/useStore.js'

const clone = o => JSON.parse(JSON.stringify(o))

describe('active-workout lifecycle seam', () => {
  it('bestKnownWeight merges history best and exWeights mirror', () => {
    const S = {
      workouts: [
        { entries: [{ id: 'lift', sets: [{ w: 80, r: 5, done: true }] }] },
        { entries: [{ id: 'lift', sets: [{ w: 90, r: 5, done: true }] }] },
      ],
      exWeights: { lift: { w: 95, d: '2026-08-10' } }
    }
    expect(bestKnownWeight(S, 'lift')).toBe(95)
    // without mirror, falls back to history
    expect(bestKnownWeight({ workouts: S.workouts, exWeights: {} }, 'lift')).toBe(90)
  })

  it('heaviestSetWeight excludes warm-ups and unticked', () => {
    const entry = {
      sets: [
        { w: 100, r: 5, done: true, phase: 'warmup' },
        { w: 60, r: 5, done: false },
        { w: 80, r: 5, done: true },
      ]
    }
    expect(heaviestSetWeight(entry)).toBe(80)
    expect(heaviestForEntry({ ...entry, topW: 85 })).toBe(85)
    expect(heaviestForEntry({ ...entry, topW: 75 })).toBe(80)
  })

  it('mergeExWeight monotonic max only, date is weight date', () => {
    const S = { exWeights: { ex1: { w: 80, d: '2026-08-01' } } }
    expect(mergeExWeight(S, 'ex1', 75, '2026-08-10')).toBe(false)
    expect(S.exWeights.ex1.w).toBe(80)
    expect(mergeExWeight(S, 'ex1', 85, '2026-08-10')).toBe(true)
    expect(S.exWeights.ex1).toEqual({ w: 85, d: '2026-08-10' })
    // Import path: newer date but lighter does not overwrite
    const S2 = { exWeights: { ex1: { w: 100, d: '2026-08-10' } } }
    expect(mergeExWeight(S2, 'ex1', 90, '2026-08-12')).toBe(false)
    expect(S2.exWeights.ex1.w).toBe(100)
  })

  it('createActiveSession freezes target and builds prescription sets', () => {
    const S = clone(DEF)
    S.unit = 'kg'
    S.routines = [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 8, weight: 50 }] }]
    S.workouts = []
    S.exWeights = {}
    const active = createActiveSession(S, 'r1', 80, { todayISO: () => '2026-08-24', uid: () => 'test-id', now: () => 12345 })
    expect(active.routineId).toBe('r1')
    expect(active.name).toBe('Push')
    expect(active.bw).toBe(80)
    expect(active.entries).toHaveLength(1)
    expect(active.entries[0].target).toEqual({ id: '0025', sets: 3, reps: 8, weight: 50 })
    // target is a clone, not same object
    expect(active.entries[0].target).not.toBe(S.routines[0].ex[0])
  })

  it('applyWorkingWeight sets topW and merges exWeights', () => {
    const S = { active: { entries: [{ id: 'ex1', sets: [{ w: 60, r: 5, done: true }] }] }, exWeights: {} }
    expect(applyWorkingWeight(S, 0, 70, { todayISO: () => '2026-08-24' })).toBe(true)
    expect(S.active.entries[0].topW).toBe(70)
    expect(S.exWeights.ex1).toEqual({ w: 70, d: '2026-08-24' })
    // monotonic: lighter does not overwrite
    expect(applyWorkingWeight(S, 0, 65, { todayISO: () => '2026-08-25' })).toBe(true)
    expect(S.active.entries[0].topW).toBe(65) // topW still updates per-entry?
    // But exWeights stays 70 because 65 < 70 — check if topW update still merges but monotonic prevents lowering
    // Our applyWorkingWeight always sets topW, then tries merge (which will fail for 65)
    expect(S.exWeights.ex1.w).toBe(70)
  })

  it('completeActiveSession builds workout, detects PRs, merges exWeights and clears active', () => {
    const S = {
      workouts: [{ d: '2026-08-10', start: 1, entries: [{ id: 'ex1', sets: [{ w: 80, r: 5, done: true }] }] }],
      exWeights: {},
      active: {
        id: 'active-1', d: '2026-08-24', start: 1000, routineId: null, name: 'Freestyle', bw: null, cur: 0,
        entries: [
          { id: 'ex1', sets: [{ w: 90, r: 5, done: true }], target: { sets: 1, reps: 5 }, topW: 90 },
          { id: 'ex2', sets: [{ w: 40, r: 10, done: true }], target: { sets: 1, reps: 10 } },
        ]
      }
    }
    const result = completeActiveSession(S, { now: () => 2000 })
    expect(result.prs).toContain('ex1')
    expect(S.workouts).toHaveLength(2)
    expect(S.active).toBeNull()
    expect(S.exWeights.ex1).toEqual({ w: 90, d: '2026-08-24' })
    expect(S.exWeights.ex2).toEqual({ w: 40, d: '2026-08-24' })
    expect(result.workout.vol).toBeGreaterThan(0)
  })
})
