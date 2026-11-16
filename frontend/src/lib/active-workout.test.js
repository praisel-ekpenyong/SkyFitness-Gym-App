import { describe, it, expect } from 'vitest'
import { tonnageOf } from './workout-model.js'
import {
  heaviestSetWeight, heaviestForEntry, mergeExWeight,
  createActiveSession, completeActiveSession,
  buildCompletedWorkout, addActiveExercise, removeActiveExercise,
  replaceActiveExercise, moveActiveExercise, buildActiveEntry,
  updateActiveSetField, addActiveSet, removeActiveSet, addActiveWarmup,
  pairActiveSuperset, unpairActiveSuperset, toggleActiveSet,
  setActiveIndex, discardActiveSession, updateActiveExerciseNote
} from './active-workout.js'

const clone = o => JSON.parse(JSON.stringify(o))

const blankProfile = () => ({
  unit: 'kg', sound: 'off', restSec: 90,
  routines: [], workouts: [], exWeights: {}, bodyweight: [], week: {}, dayPlan: {},
})

describe('active-workout lifecycle seam', () => {
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
    expect(S.exWeights.ex1).toEqual({ w: 85, d: '2026-08-10', unit: 'kg' })
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
    expect(entry.sets[0].w).toBe(52.5)

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
    expect(S.active.entries[0].sets[0].w).toBe(50)
    expect(S.active.entries[0].sets[1].w).toBe(55)
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

    const r2 = toggleActiveSet(S, 0, 1)
    expect(r2.checked).toBe(true)
    expect(r2.next).toEqual({ kind: 'open-finish', targetIdx: null })
    expect(r2.rest).toEqual({ start: false, stop: true })
    expect(r2.notice).toBe(null)
    expect(S.active.entries[0].hw).toBe(2)

    const r3 = toggleActiveSet(S, 0, 1)
    expect(r3.checked).toBe(false)
    expect(r3.next).toEqual({ kind: 'stay', targetIdx: null })
    expect(r3.rest).toEqual({ start: false, stop: false })
    expect(r3.notice).toBe(null)

    const r4 = toggleActiveSet(S, 0, 1)
    expect(r4.checked).toBe(true)
    expect(S.active.entries[0].hw).toBe(2)
    expect(r4.rest).toEqual({ start: false, stop: false })
  })

  it('treats an unticked warm-up as prep, so it cannot keep the exercise reading as unfinished', () => {
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
    expect(last.next).toEqual({ kind: 'open-finish', targetIdx: null })
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
    expect(r.notice).toBe(null)
    expect(r.next).toEqual({ kind: 'open-finish', targetIdx: null })
  })

  it('buildCompletedWorkout writes no topW for a new Entry, and keeps one a resumed Entry carries', () => {
    const active = {
      id: 'a', d: '2026-08-08', start: 1000,
      entries: [
        { id: 'new', sets: [{ done: true, w: 60, r: 8 }] },
        { id: 'legacy', sets: [{ done: true, w: 60, r: 8 }], topW: 65 },
      ],
    }
    const completed = buildCompletedWorkout(active, { end: 2000 })
    expect('topW' in completed.entries[0]).toBe(false)
    expect(completed.entries[1].topW).toBe(65)
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
    expect(setActiveIndex(S, 10)).toBe(true)
    expect(S.active.cur).toBe(2)
    expect(setActiveIndex(S, -5)).toBe(true)
    expect(S.active.cur).toBe(0)

    expect(discardActiveSession(S)).toBe(true)
    expect(S.active).toBeNull()
  })

  it('completeActiveSession builds workout, detects Records (a first session is none), merges exWeights and clears active', () => {
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
    expect(result.prs).toEqual(['ex1'])
    expect(S.workouts).toHaveLength(2)
    expect(S.active).toBeNull()
    expect(result.workout.unit).toBe('kg')
    expect(S.exWeights.ex1).toEqual({ w: 90, d: '2026-08-24', unit: 'kg' })
    expect(S.exWeights.ex2).toEqual({ w: 40, d: '2026-08-24', unit: 'kg' })
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
    const replaced0 = replaceActiveExercise(S, 0, '0025', { sets: 2 })
    expect(replaced0.sg).toBe('sg-pair-1')
    expect(S.active.entries[0].sg).toBe('sg-pair-1')

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
    expect(replaceActiveExercise(S, -1, '0025')).toBeNull()
    expect(replaceActiveExercise(S, 5, '0025')).toBeNull()
    expect(replaceActiveExercise(S, 0, '')).toBeNull()
    expect(replaceActiveExercise(S, 0, null)).toBeNull()
    expect(replaceActiveExercise(null, 0, '0025')).toBeNull()
    expect(replaceActiveExercise({ active: null }, 0, '0025')).toBeNull()
    expect(replaceActiveExercise({ active: { entries: 'not-array' } }, 0, '0025')).toBeNull()
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
    expect(entry.plan).toBeNull()
    expect(entry.sets).toHaveLength(3)
    expect(entry.sets[0].w).toBe(60)
    expect(entry.sets[0].r).toBe(10)
  })

  it('moveActiveExercise shifts entries up and down and respects boundaries', () => {
    const S = {
      active: {
        cur: 1,
        entries: [
          { id: 'ex0', sets: [{ w: 50, r: 8, done: true }] },
          { id: 'ex1', sets: [{ w: 60, r: 8, done: false }] },
          { id: 'ex2', sets: [{ w: 70, r: 8, done: false }] },
        ]
      }
    }

    expect(moveActiveExercise(S, 0, -1)).toBe(false)
    expect(moveActiveExercise(S, 2, 1)).toBe(false)

    expect(moveActiveExercise(S, 1, -1)).toBe(true)
    expect(S.active.entries.map(e => e.id)).toEqual(['ex1', 'ex0', 'ex2'])
    expect(S.active.cur).toBe(0)

    expect(moveActiveExercise(S, 0, 1)).toBe(true)
    expect(S.active.entries.map(e => e.id)).toEqual(['ex0', 'ex1', 'ex2'])
    expect(S.active.cur).toBe(1)
  })

  it('moveActiveExercise tracks active.cur to the moved entry', () => {
    const S = {
      active: {
        cur: 2,
        entries: [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
      }
    }
    expect(moveActiveExercise(S, 0, 1)).toBe(true)
    expect(S.active.entries.map(e => e.id)).toEqual(['b', 'a', 'c'])
    expect(S.active.cur).toBe(1)

    expect(moveActiveExercise(S, 2, -1)).toBe(true)
    expect(S.active.entries.map(e => e.id)).toEqual(['b', 'c', 'a'])
    expect(S.active.cur).toBe(1)
  })

  it('moveActiveExercise returns false on invalid input', () => {
    const S = {
      active: {
        cur: 0,
        entries: [{ id: 'a' }]
      }
    }
    expect(moveActiveExercise(null, 0, 1)).toBe(false)
    expect(moveActiveExercise({}, 0, 1)).toBe(false)
    expect(moveActiveExercise({ active: null }, 0, 1)).toBe(false)
    expect(moveActiveExercise(S, -1, 1)).toBe(false)
    expect(moveActiveExercise(S, 5, 1)).toBe(false)
    expect(moveActiveExercise(S, 0, 0)).toBe(false)
    expect(moveActiveExercise(S, 0, 2)).toBe(false)
    expect(moveActiveExercise(S, '0', 1)).toBe(false)
    expect(moveActiveExercise(S, 0, '1')).toBe(false)
  })

  it('moveActiveExercise preserves superset on internal swap, dissolves when breaking adjacency', () => {
    const S = {
      active: {
        cur: 0,
        entries: [
          { id: 'bench', sg: 'sg-pair' },
          { id: 'row', sg: 'sg-pair' },
          { id: 'squat' },
        ]
      }
    }

    expect(moveActiveExercise(S, 0, 1)).toBe(true)
    expect(S.active.entries[0].id).toBe('row')
    expect(S.active.entries[0].sg).toBe('sg-pair')
    expect(S.active.entries[1].id).toBe('bench')
    expect(S.active.entries[1].sg).toBe('sg-pair')

    expect(moveActiveExercise(S, 1, 1)).toBe(true)
    expect(S.active.entries[0].id).toBe('row')
    expect(S.active.entries[0].sg).toBeUndefined()
    expect(S.active.entries[1].id).toBe('squat')
    expect(S.active.entries[1].sg).toBeUndefined()
    expect(S.active.entries[2].id).toBe('bench')
    expect(S.active.entries[2].sg).toBeUndefined()
  })

  it('moveActiveExercise leaves S.routines completely untouched', () => {
    const S = blankProfile()
    S.routines = [
      {
        id: 'r1',
        name: 'Upper',
        ex: [{ id: '0025' }, { id: '0043' }]
      }
    ]
    S.active = createActiveSession(S, 'r1', 75)
    expect(S.active.entries.map(e => e.id)).toEqual(['0025', '0043'])

    const routineSnapshot = clone(S.routines)

    expect(moveActiveExercise(S, 0, 1)).toBe(true)
    expect(S.active.entries.map(e => e.id)).toEqual(['0043', '0025'])

    expect(S.routines).toEqual(routineSnapshot)
  })

  it('moveActiveExercise preserves performed sets and all entry metadata non-destructively', () => {
    const entry0 = {
      id: '0025',
      asked: true,
      hw: 2,
      topW: 80,
      target: { sets: 3, reps: 8, weight: 80 },
      sets: [
        { w: 80, r: 8, done: true, phase: 'work', rir: 2 },
        { w: 80, r: 8, done: true, phase: 'work', rir: 1 },
        { w: 80, r: 6, done: false, phase: 'work' },
      ]
    }
    const entry1 = {
      id: '0043',
      target: { sets: 2, reps: 10, weight: 100 },
      sets: [
        { w: 100, r: 10, done: false, phase: 'work' },
        { w: 100, r: 10, done: false, phase: 'work' },
      ]
    }
    const S = {
      active: {
        cur: 0,
        entries: [clone(entry0), clone(entry1)]
      }
    }

    expect(moveActiveExercise(S, 0, 1)).toBe(true)
    expect(S.active.entries[1]).toEqual(entry0)
    expect(S.active.entries[0]).toEqual(entry1)
  })

  describe('exercise notes domain model & lifecycle', () => {
    it('createActiveSession seeds entry.notes and entry.target.notes from routine cfg.notes', () => {
      const S = blankProfile()
      S.routines = [
        {
          id: 'r1',
          name: 'Push',
          ex: [
            { id: '0025', sets: 3, reps: 8, weight: 50, notes: 'Seat height 5, pin 8' },
            { id: '0026', sets: 3, reps: 10, weight: 40, notes: '   ' },
            { id: '0027', sets: 3, reps: 12, weight: 15 },
          ]
        }
      ]
      const active = createActiveSession(S, 'r1', 80)
      expect(active.entries[0].notes).toBe('Seat height 5, pin 8')
      expect(active.entries[0].target.notes).toBe('Seat height 5, pin 8')

      expect(active.entries[1].notes).toBeUndefined()
      expect(active.entries[1].target.notes).toBeUndefined()

      expect(active.entries[2].notes).toBeUndefined()
      expect(active.entries[2].target.notes).toBeUndefined()
    })

    it('createActiveSession trims note and caps length to 500 characters', () => {
      const S = blankProfile()
      const longNote = 'B'.repeat(600)
      S.routines = [
        {
          id: 'r1',
          name: 'Push',
          ex: [{ id: '0025', sets: 3, reps: 8, weight: 50, notes: `  ${longNote}  ` }]
        }
      ]
      const active = createActiveSession(S, 'r1', 80)
      expect(active.entries[0].notes).toHaveLength(500)
      expect(active.entries[0].notes).toBe('B'.repeat(500))
      expect(active.entries[0].target.notes).toBe('B'.repeat(500))
    })

    it('buildActiveEntry accepts targetCfg.notes and cleans empty whitespace', () => {
      const S = { active: { routineId: null, entries: [] }, workouts: [] }

      const entry1 = buildActiveEntry(S, '0025', { sets: 3, notes: 'Pause 1s at bottom' })
      expect(entry1.notes).toBe('Pause 1s at bottom')
      expect(entry1.target.notes).toBe('Pause 1s at bottom')

      const entry2 = buildActiveEntry(S, '0025', { sets: 3, notes: '   ' })
      expect(entry2.notes).toBeUndefined()
      expect(entry2.target.notes).toBeUndefined()

      const entry3 = buildActiveEntry(S, '0025', { sets: 3 })
      expect(entry3.notes).toBeUndefined()
      expect(entry3.target.notes).toBeUndefined()
    })

    it('addActiveExercise and freestyle sessions always start with notes: undefined', () => {
      const S = blankProfile()
      const freestyle = createActiveSession(S, null, 80)
      expect(freestyle.entries).toHaveLength(0)

      S.active = freestyle
      const adHoc1 = addActiveExercise(S, '0025')
      expect(adHoc1.notes).toBeUndefined()
      expect(adHoc1.target.notes).toBeUndefined()

      const adHoc2 = addActiveExercise(S, '0026', { notes: 'old cue from somewhere' })
      expect(adHoc2.notes).toBeUndefined()
      expect(adHoc2.target.notes).toBeUndefined()
    })

    it('replaceActiveExercise explicitly clears outgoing notes on replacement', () => {
      const S = {
        active: {
          cur: 0,
          entries: [
            {
              id: '0025',
              notes: 'Seat height 5, bar on mid-chest',
              target: { sets: 3, reps: 8, weight: 80, notes: 'Seat height 5, bar on mid-chest' },
              sets: [{ w: 80, r: 8, done: true }]
            }
          ]
        }
      }

      const replaced = replaceActiveExercise(S, 0, '0027', { sets: 3, reps: 12, weight: 20 })
      expect(replaced).toBeDefined()
      expect(replaced.id).toBe('0027')
      expect(replaced.notes).toBeUndefined()
      expect(replaced.target.notes).toBeUndefined()
      expect(S.active.entries[0].notes).toBeUndefined()
      expect(S.active.entries[0].target.notes).toBeUndefined()
    })

    it('replaceActiveExercise preserves targetCfg.notes when explicitly supplied', () => {
      const S = {
        active: {
          cur: 0,
          entries: [
            {
              id: '0025',
              notes: 'Old note',
              target: { sets: 3, reps: 8, weight: 80, notes: 'Old note' },
              sets: [{ w: 80, r: 8, done: true }]
            }
          ]
        }
      }

      const replaced = replaceActiveExercise(S, 0, '0027', {
        sets: 3, reps: 12, weight: 20, notes: 'Newly typed cue in exConfigSheet'
      })
      expect(replaced).toBeDefined()
      expect(replaced.id).toBe('0027')
      expect(replaced.notes).toBe('Newly typed cue in exConfigSheet')
      expect(replaced.target.notes).toBe('Newly typed cue in exConfigSheet')
      expect(S.active.entries[0].notes).toBe('Newly typed cue in exConfigSheet')
    })

    it('updateActiveExerciseNote mutates entry.notes without mutating entry.target.notes', () => {
      const S = {
        active: {
          cur: 0,
          entries: [
            {
              id: '0025',
              notes: 'Initial note',
              target: { sets: 3, reps: 8, weight: 80, notes: 'Baseline routine note' },
              sets: [{ w: 80, r: 8, done: false }]
            }
          ]
        }
      }

      const res = updateActiveExerciseNote(S, 0, '  Adjusted seat to pin 6  ')
      expect(res).toBe(true)
      expect(S.active.entries[0].notes).toBe('Adjusted seat to pin 6')
      expect(S.active.entries[0].target.notes).toBe('Baseline routine note')

      expect(updateActiveExerciseNote(S, 0, '   ')).toBe(true)
      expect(S.active.entries[0].notes).toBeUndefined()
      expect('notes' in S.active.entries[0]).toBe(false)
      expect(S.active.entries[0].target.notes).toBe('Baseline routine note')

      expect(updateActiveExerciseNote(S, 99, 'note')).toBe(false)
      expect(updateActiveExerciseNote(null, 0, 'note')).toBe(false)
      expect(updateActiveExerciseNote({ active: null }, 0, 'note')).toBe(false)
    })

    it('buildCompletedWorkout persists entry.notes onto completed historical entries', () => {
      const active = {
        id: 'active-notes',
        d: '2026-08-08',
        start: 1000,
        entries: [
          {
            id: '0025',
            notes: '  Right shoulder felt tight on set 2  ',
            sets: [{ done: true, w: 80, r: 8 }],
          },
          {
            id: '0026',
            notes: '   ',
            sets: [{ done: true, w: 50, r: 10 }],
          },
          {
            id: '0027',
            sets: [{ done: true, w: 20, r: 12 }],
          },
        ]
      }

      const completed = buildCompletedWorkout(active)
      expect(completed.entries[0].notes).toBe('Right shoulder felt tight on set 2')
      expect(completed.entries[1]).not.toHaveProperty('notes')
      expect(completed.entries[2]).not.toHaveProperty('notes')
    })
  })
})


