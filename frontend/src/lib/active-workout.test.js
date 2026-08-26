// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  bestKnownWeight, heaviestSetWeight, heaviestForEntry, mergeExWeight,
  createActiveSession, applyWorkingWeight, completeActiveSession,
  buildCompletedWorkout, addActiveExercise, removeActiveExercise,
  updateActiveSetField, addActiveSet, removeActiveSet, addActiveWarmup,
  pairActiveSuperset, unpairActiveSuperset, toggleActiveSet,
  setActiveIndex, discardActiveSession
} from './active-workout.js'
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
    expect(active.entries[0].target).not.toBe(S.routines[0].ex[0])
  })

  it('addActiveExercise handles routine progression and freestyle seeding', () => {
    const S = clone(DEF)
    S.routines = [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 }] }]
    S.workouts = [
      { d: '2026-08-10', entries: [{ id: '0025', sets: [{ w: 50, r: 8, done: true }, { w: 50, r: 8, done: true }, { w: 50, r: 8, done: true }], target: { sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 } }] }
    ]
    S.active = { id: 'a1', routineId: 'r1', entries: [], cur: 0 }

    const entry = addActiveExercise(S, '0025', { sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 })
    expect(entry).toBeDefined()
    expect(S.active.entries).toHaveLength(1)
    expect(S.active.cur).toBe(0)
    // Routine progression should have stepped weight by 2.5
    expect(entry.sets[0].w).toBe(52.5)

    // In freestyle mode, seeds from last history
    const S_free = clone(DEF)
    S_free.workouts = [
      { d: '2026-08-10', entries: [{ id: '0025', sets: [{ w: 60, r: 10, done: true }] }] }
    ]
    S_free.active = { id: 'a2', routineId: null, entries: [], cur: 0 }
    const freeEntry = addActiveExercise(S_free, '0025', { sets: 2 })
    expect(freeEntry.sets[0].w).toBe(60)
    expect(freeEntry.sets[0].r).toBe(10)
  })

  it('removeActiveExercise splices entry, bounds cur, and cleans up superset groups', () => {
    const S = {
      active: {
        cur: 2,
        entries: [
          { id: 'ex1', sg: 'sg-1' },
          { id: 'ex2', sg: 'sg-1' },
          { id: 'ex3', sg: null },
        ]
      }
    }
    expect(removeActiveExercise(S, 0)).toBe(true)
    expect(S.active.entries).toHaveLength(2)
    // Superset partner ex2 should have its sg cleaned up since it's now singleton
    expect(S.active.entries[0].sg).toBeUndefined()
    expect(S.active.cur).toBe(1)
  })

  it('updateActiveSetField mutates field and cascades weight changes forward', () => {
    const S = {
      active: {
        entries: [{
          id: 'ex1',
          sets: [
            { w: 50, r: 8, done: true },
            { w: 50, r: 8, done: false },
            { w: 50, r: 8, done: false },
          ]
        }]
      }
    }
    expect(updateActiveSetField(S, 0, 1, 'w', 55)).toBe(true)
    // Set 0 done is unchanged
    expect(S.active.entries[0].sets[0].w).toBe(50)
    // Set 1 updated
    expect(S.active.entries[0].sets[1].w).toBe(55)
    // Set 2 cascaded forward
    expect(S.active.entries[0].sets[2].w).toBe(55)
  })

  it('addActiveSet, removeActiveSet, addActiveWarmup manipulate rows correctly', () => {
    const S = {
      active: {
        entries: [{
          id: 'ex1',
          target: { reps: 8, weight: 60 },
          sets: [
            { w: 60, r: 8, done: false }
          ]
        }]
      }
    }
    expect(addActiveSet(S, 0)).toBe(true)
    expect(S.active.entries[0].sets).toHaveLength(2)
    expect(S.active.entries[0].sets[1].w).toBe(60)

    expect(addActiveWarmup(S, 0)).toBe(true)
    expect(S.active.entries[0].sets).toHaveLength(3)
    expect(S.active.entries[0].sets[0].warmup).toBe(true)
    expect(S.active.entries[0].sets[0].phase).toBe('warmup')

    expect(removeActiveSet(S, 0)).toBe(true)
    expect(S.active.entries[0].sets).toHaveLength(2)

    // Cannot remove below 1 set
    expect(removeActiveSet(S, 0)).toBe(true)
    expect(removeActiveSet(S, 0)).toBe(false)
    expect(S.active.entries[0].sets).toHaveLength(1)
  })

  it('pairActiveSuperset and unpairActiveSuperset link and unlink entries', () => {
    const S = {
      active: {
        entries: [
          { id: 'ex1', sets: [{ done: false }] },
          { id: 'ex2', sets: [{ done: false }] },
        ]
      }
    }
    expect(pairActiveSuperset(S, 0, 1)).toBe(true)
    expect(S.active.entries[0].sg).toBeDefined()
    expect(S.active.entries[0].sg).toBe(S.active.entries[1].sg)

    expect(unpairActiveSuperset(S, 0)).toBe(true)
    expect(S.active.entries[0].sg).toBeUndefined()
    expect(S.active.entries[1].sg).toBeUndefined()
  })

  it('toggleActiveSet evaluates done, askTop, workoutDone, and superset navigation', () => {
    const S = {
      active: {
        cur: 0,
        entries: [
          {
            id: 'ex1',
            target: { reps: 5, weight: 80 },
            sets: [
              { w: 80, r: 5, done: false },
              { w: 80, r: 5, done: false }
            ]
          }
        ]
      }
    }

    // Toggle set 0
    const r1 = toggleActiveSet(S, 0, 0, { highWater: 0 })
    expect(r1.checked).toBe(true)
    expect(r1.askTop).toBe(false)
    expect(r1.workoutDone).toBe(false)
    expect(r1.exJustDone).toBe(false)
    expect(r1.newHighWater).toBe(1)
    expect(r1.shouldRest).toBe(true)

    // Toggle set 1 -> exercise and workout complete
    const r2 = toggleActiveSet(S, 0, 1, { highWater: 1 })
    expect(r2.checked).toBe(true)
    expect(r2.askTop).toBe(true)
    expect(r2.workoutDone).toBe(true)
    expect(r2.exJustDone).toBe(true)
    expect(r2.newHighWater).toBe(2)

    // Unchecking does not re-trigger completion or askTop
    const r3 = toggleActiveSet(S, 0, 1, { highWater: 2 })
    expect(r3.checked).toBe(false)
    expect(r3.askTop).toBe(false)
    expect(r3.workoutDone).toBe(false)
  })

  it('applyWorkingWeight sets topW and merges exWeights', () => {
    const S = { active: { entries: [{ id: 'ex1', sets: [{ w: 60, r: 5, done: true }] }] }, exWeights: {} }
    expect(applyWorkingWeight(S, 0, 70, { todayISO: () => '2026-08-24' })).toBe(true)
    expect(S.active.entries[0].topW).toBe(70)
    expect(S.exWeights.ex1).toEqual({ w: 70, d: '2026-08-24' })
    expect(applyWorkingWeight(S, 0, 65, { todayISO: () => '2026-08-25' })).toBe(true)
    expect(S.active.entries[0].topW).toBe(65)
    expect(S.exWeights.ex1.w).toBe(70)
  })

  it('buildCompletedWorkout constructs record and excludes empty entries', () => {
    const active = {
      id: 'active-1', d: '2026-08-08', start: 1000, routineId: 'routine-1', name: 'Push', bw: 80,
      entries: [
        { id: '0025', sets: [{ done: true, w: 60, r: 8 }], topW: 60, target: { sets: 1, reps: 8 } },
        { id: 'empty', sets: [{ done: false, w: 0, r: 0 }] }
      ],
    }
    const completed = buildCompletedWorkout(active, { end: 2000, prs: ['0025'] })
    expect(completed).toEqual({
      id: 'active-1', d: '2026-08-08', start: 1000, end: 2000, routineId: 'routine-1', name: 'Push', bw: 80,
      unit: 'kg',
      entries: [{ id: '0025', sets: [{ done: true, w: 60, r: 8 }], topW: 60, target: { sets: 1, reps: 8 } }],
      prs: ['0025']
    })
  })

  it('buildCompletedWorkout persists a muscle snapshot when supplied', () => {
    const active = {
      id: 'active-1', d: '2026-08-08', start: 1000,
      entries: [
        { id: 'catalogue', sets: [{ done: true }] },
        { id: 'custom', sets: [{ done: true }] },
      ],
    }
    const completed = buildCompletedWorkout(active, {
      end: 2000,
      snapshotFor: entry => entry.id === 'custom'
        ? { n: 'Custom lift', muscleWeights: { chest: 1 } }
        : null,
    })

    expect(completed.entries[0]).not.toHaveProperty('muscleSnapshot')
    expect(completed.entries[1].muscleSnapshot).toEqual({
      n: 'Custom lift', muscleWeights: { chest: 1 },
    })
  })

  it('setActiveIndex and discardActiveSession mutate active session correctly', () => {
    const S = {
      active: {
        cur: 0,
        entries: [{ id: 'ex1' }, { id: 'ex2' }, { id: 'ex3' }]
      }
    }
    expect(setActiveIndex(S, 2)).toBe(true)
    expect(S.active.cur).toBe(2)
    // Bounds check
    expect(setActiveIndex(S, 10)).toBe(true)
    expect(S.active.cur).toBe(2)
    expect(setActiveIndex(S, -5)).toBe(true)
    expect(S.active.cur).toBe(0)

    expect(discardActiveSession(S)).toBe(true)
    expect(S.active).toBeNull()
  })

  it('completeActiveSession builds workout, detects PRs, merges exWeights and clears active', () => {
    const S = {
      unit: 'kg',
      workouts: [{ d: '2026-08-10', start: 1, entries: [{ id: 'ex1', sets: [{ w: 80, r: 5, done: true }] }] }],
      exWeights: {},
      active: {
        id: 'active-1', d: '2026-08-24', start: 1000, routineId: null, name: 'Freestyle', bw: null, unit: 'kg', cur: 0,
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
    expect(result.workout.unit).toBe('kg')
    expect(S.exWeights.ex1).toEqual({ w: 90, d: '2026-08-24' })
    expect(S.exWeights.ex2).toEqual({ w: 40, d: '2026-08-24' })
    expect(result.workout.vol).toBeGreaterThan(0)
  })
})

