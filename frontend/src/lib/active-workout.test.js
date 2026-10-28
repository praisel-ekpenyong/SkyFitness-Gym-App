import { describe, it, expect } from 'vitest'
import { tonnageOf } from './workout-model.js'
import {
  bestKnownWeight, heaviestSetWeight, heaviestForEntry, mergeExWeight,
  createActiveSession, applyWorkingWeight, completeActiveSession,
  buildCompletedWorkout, addActiveExercise, removeActiveExercise,
  replaceActiveExercise, buildActiveEntry,
  updateActiveSetField, addActiveSet, removeActiveSet, addActiveWarmup,
  pairActiveSuperset, unpairActiveSuperset, toggleActiveSet,
  setActiveIndex, discardActiveSession
} from './active-workout.js'

const clone = o => JSON.parse(JSON.stringify(o))

// Minimal Profile shape for tests that start from a blank slate. Deliberately not imported
// from ../store/useStore.js — pulling in the store registers document listeners and would
// force this DOM-free suite into a DOM environment.
const blankProfile = () => ({
  unit: 'kg', sound: 'off', restSec: 90,
  routines: [], workouts: [], exWeights: {}, bodyweight: [], week: {}, dayPlan: {},
})

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

  it('bestKnownWeight never promotes a warm-up or an unperformed set (GLOSSARY.md: work sets only)', () => {
    expect(bestKnownWeight({ workouts: [{ entries: [{ id: 'lift', topW: 120, sets: [
      { phase: 'warmup', done: true, w: 120 },
      { phase: 'work', done: true, w: 80 },
      { phase: 'work', done: false, w: 100 },
    ] }] }] }, 'lift')).toBe(80)
    expect(bestKnownWeight({ workouts: [{ entries: [{ id: 'lift', sets: [
      { phase: 'warmup', done: true, w: 120 },
    ] }] }] }, 'lift')).toBe(0)
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
    const S = blankProfile()
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
    const S = blankProfile()
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
    const S_free = blankProfile()
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

  it('toggleActiveSet evaluates done, next, rest, and superset navigation', () => {
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

    const r1 = toggleActiveSet(S, 0, 0)
    expect(r1.checked).toBe(true)
    expect(r1.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r1.rest).toEqual({ start: true, stop: false })
    expect(r1.notice).toBe(null)
    expect(S.active.entries[0].hw).toBe(1)

    // Toggle set 1 -> exercise and workout complete
    const r2 = toggleActiveSet(S, 0, 1)
    expect(r2.checked).toBe(true)
    expect(r2.next).toEqual({ kind: 'open-topweight', targetIdx: null })
    expect(r2.rest).toEqual({ start: false, stop: true })
    expect(r2.notice).toBe(null)
    expect(S.active.entries[0].hw).toBe(2)

    // Unchecking does not re-trigger completion prompts
    const r3 = toggleActiveSet(S, 0, 1)
    expect(r3.checked).toBe(false)
    expect(r3.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r3.rest).toEqual({ start: false, stop: false })
    expect(r3.notice).toBe(null)

    // Re-checking finished work is not new progress: no rest side effects either way,
    // so fixing a mistaken untick can't cut a running rest timer short.
    const r4 = toggleActiveSet(S, 0, 1)
    expect(r4.checked).toBe(true)
    expect(S.active.entries[0].hw).toBe(2)
    expect(r4.rest).toEqual({ start: false, stop: false })
  })

  it('treats an unticked warm-up as prep, so it cannot keep the exercise reading as unfinished', () => {
    // A warm-up row is not work. Leaving it unticked must not swallow the
    // working-weight prompt or the finish prompt, the way an unticked work row
    // does — the rest timer and superset navigation already read work sets only.
    const S = {
      active: {
        cur: 0,
        entries: [{
          id: 'ex1',
          target: { reps: 5, weight: 80 },
          sets: [
            { w: 40, r: 5, done: false, phase: 'warmup', warmup: true },
            { w: 80, r: 5, done: false },
            { w: 80, r: 5, done: false },
          ],
        }],
      },
    }
    const first = toggleActiveSet(S, 0, 1)
    expect(first.checked).toBe(true)
    expect(first.rest).toEqual({ start: true, stop: false })

    const last = toggleActiveSet(S, 0, 2)
    expect(last.next).toEqual({ kind: 'open-topweight', targetIdx: null })
    expect(last.notice).toBe(null)
    expect(last.rest).toEqual({ start: false, stop: true })
  })

  it('still holds the prompts back while real work is left', () => {
    const S = {
      active: {
        cur: 0,
        entries: [{
          id: 'ex1',
          target: { reps: 5, weight: 80 },
          sets: [
            { w: 80, r: 5, done: true },
            { w: 80, r: 5, done: false },
          ],
        }],
      },
    }
    const r = toggleActiveSet(S, 0, 0)
    expect(r.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r.notice).toBe(null)
  })

  it('never reports an all-warm-up entry as finished', () => {
    // Reachable in two taps: insert a warm-up, then remove the only work row.
    const S = {
      active: {
        cur: 0,
        entries: [{
          id: 'ex1',
          target: { reps: 5, weight: 80 },
          sets: [
            { w: 40, r: 5, done: false, phase: 'warmup', warmup: true },
          ],
        }],
      },
    }
    const r = toggleActiveSet(S, 0, 0)
    // Warm-up-only Entries never count as exercise progress, so no toast —
    // but the pre-existing finish routing is preserved here (out of scope).
    expect(r.notice).toBe(null)
    expect(r.next).toEqual({ kind: 'open-finish', targetIdx: null })
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
    expect(result.workout.vol).toBeUndefined()
    expect(tonnageOf(result.workout)).toBe(90 * 5 + 40 * 10)
  })

  it('replaceActiveExercise replaces entry in-place, clamps cur, preserves surrounding entries, and returns new entry', () => {
    const S = {
      active: {
        cur: 0,
        entries: [
          { id: 'ex0', sets: [{ w: 40, r: 10, done: true }] },
          { id: 'ex1', sets: [{ w: 50, r: 8, done: true }] },
          { id: 'ex2', sets: [{ w: 60, r: 6, done: false }] },
        ]
      }
    }
    const newEntry = replaceActiveExercise(S, 1, '0025', { sets: 3, reps: 8, weight: 70 })
    expect(newEntry).toBeDefined()
    expect(newEntry.id).toBe('0025')
    expect(S.active.entries).toHaveLength(3)
    expect(S.active.entries[0].id).toBe('ex0')
    expect(S.active.entries[1]).toBe(newEntry)
    expect(S.active.entries[2].id).toBe('ex2')
    expect(S.active.cur).toBe(1)
  })

  it('replaceActiveExercise inherits outgoing superset group (sg) or leaves it undefined', () => {
    const S = {
      active: {
        cur: 0,
        entries: [
          { id: 'ex0', sg: 'sg-pair-1', sets: [] },
          { id: 'ex1', sets: [] },
        ]
      }
    }
    // With sg
    const replaced0 = replaceActiveExercise(S, 0, '0025', { sets: 2 })
    expect(replaced0.sg).toBe('sg-pair-1')
    expect(S.active.entries[0].sg).toBe('sg-pair-1')

    // Without sg
    const replaced1 = replaceActiveExercise(S, 1, '0026', { sets: 2 })
    expect(replaced1.sg).toBeUndefined()
    expect(S.active.entries[1].sg).toBeUndefined()
  })

  it('replaceActiveExercise clears asked, hw, and topW flags from the outgoing entry', () => {
    const S = {
      active: {
        cur: 0,
        entries: [
          {
            id: 'ex0',
            asked: true,
            hw: 3,
            topW: 85,
            sets: [{ w: 85, r: 5, done: true }]
          }
        ]
      }
    }
    const replaced = replaceActiveExercise(S, 0, '0025', { sets: 3, reps: 10, weight: 60 })
    expect(replaced.asked).toBeUndefined()
    expect(replaced.hw).toBeUndefined()
    expect(replaced.topW).toBeUndefined()
    expect(S.active.entries[0].asked).toBeUndefined()
    expect(S.active.entries[0].hw).toBeUndefined()
    expect(S.active.entries[0].topW).toBeUndefined()
  })

  it('replaceActiveExercise seeds sets via progression stream for routine-backed session and leaves S.routines untouched', () => {
    const S = blankProfile()
    const originalRoutine = {
      id: 'r1',
      name: 'Push',
      ex: [
        { id: 'old-lift', sets: 3, reps: 8, weight: 40 },
        { id: '0025', sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 }
      ]
    }
    S.routines = [clone(originalRoutine)]
    S.workouts = [
      {
        d: '2026-08-10',
        routineId: 'r1',
        entries: [{
          id: '0025',
          sets: [{ w: 50, r: 8, done: true }, { w: 50, r: 8, done: true }, { w: 50, r: 8, done: true }],
          target: { sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 }
        }]
      }
    ]
    S.active = {
      id: 'a1',
      routineId: 'r1',
      cur: 0,
      entries: [
        { id: 'old-lift', sets: [{ w: 40, r: 8, done: true }] }
      ]
    }

    const routineSnapshot = clone(S.routines)

    const replaced = replaceActiveExercise(S, 0, '0025', { sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 })
    expect(replaced).toBeDefined()
    expect(replaced.id).toBe('0025')
    expect(replaced.plan).toBeDefined()
    expect(replaced.plan.kind).toBe('up')
    expect(replaced.sets[0].w).toBe(52.5)

    // The underlying routine in S.routines must be completely untouched
    expect(S.routines).toEqual(routineSnapshot)
  })

  it('replaceActiveExercise seeds sets from freestyle history when active session is freestyle', () => {
    const S = blankProfile()
    S.workouts = [
      {
        d: '2026-08-10',
        entries: [{ id: '0025', sets: [{ w: 65, r: 10, done: true }, { w: 65, r: 10, done: true }] }]
      }
    ]
    S.active = {
      id: 'a2',
      routineId: null,
      cur: 0,
      entries: [
        { id: 'other', sets: [{ w: 20, r: 12, done: false }] }
      ]
    }

    const replaced = replaceActiveExercise(S, 0, '0025', { sets: 2 })
    expect(replaced.plan).toBeNull()
    expect(replaced.sets[0].w).toBe(65)
    expect(replaced.sets[0].r).toBe(10)
  })

  it('replaceActiveExercise bounds checking returns null on invalid index, missing active session, or missing exId', () => {
    const S = {
      active: {
        cur: 0,
        entries: [{ id: 'ex0', sets: [] }]
      }
    }
    // Invalid index
    expect(replaceActiveExercise(S, -1, '0025')).toBeNull()
    expect(replaceActiveExercise(S, 5, '0025')).toBeNull()
    // Missing exId
    expect(replaceActiveExercise(S, 0, '')).toBeNull()
    expect(replaceActiveExercise(S, 0, null)).toBeNull()
    // No active session
    expect(replaceActiveExercise(null, 0, '0025')).toBeNull()
    expect(replaceActiveExercise({ active: null }, 0, '0025')).toBeNull()
    expect(replaceActiveExercise({ active: { entries: 'not-array' } }, 0, '0025')).toBeNull()
    // Entry was not modified
    expect(S.active.entries[0].id).toBe('ex0')
  })

  it('buildActiveEntry constructs entry with id, target, plan, and sets', () => {
    const S = {
      active: { routineId: null, entries: [] },
      workouts: [],
    }
    const entry = buildActiveEntry(S, '0025', { sets: 3, reps: 10, weight: 60 })
    expect(entry.id).toBe('0025')
    expect(entry.target).toEqual({ sets: 3, reps: 10, weight: 60 })
    expect(entry.plan).toBeNull() // freestyle
    expect(entry.sets).toHaveLength(3)
    expect(entry.sets[0].w).toBe(60)
    expect(entry.sets[0].r).toBe(10)
  })
})


