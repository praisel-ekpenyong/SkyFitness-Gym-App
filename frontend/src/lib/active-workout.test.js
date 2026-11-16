import { describe, it, expect } from 'vitest'
import { tonnage } from './training-log.js'
import { isWarmupRow } from './warmup.js'
import {
  createActiveSession, completeActiveSession,
  buildCompletedWorkout, addActiveExercise, removeActiveExercise,
  replaceActiveExercise, moveActiveExercise, buildActiveEntry,
  updateActiveSetField, addActiveSet, removeActiveSet, addActiveWarmup,
  pairActiveSuperset, unpairActiveSuperset, toggleActiveSet,
  setActiveIndex, discardActiveSession, updateActiveExerciseNote,
  sessionView, act
} from './active-workout.js'

const clone = o => JSON.parse(JSON.stringify(o))

const blankProfile = () => ({
  unit: 'kg', sound: 'off', restSec: 90,
  routines: [], workouts: [], exWeights: {}, bodyweight: [], week: {}, dayPlan: {},
})

describe('active-workout lifecycle seam', () => {
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
    const completed = buildCompletedWorkout(active, { end: 2000 })
    expect(completed).toEqual({
      id: 'active-1', d: '2026-08-08', start: 1000, end: 2000, routineId: 'routine-1', name: 'Push', bw: 80,
      unit: 'kg',
      entries: [{ id: '0025', sets: [{ done: true, w: 60, r: 8 }], topW: 60, target: { sets: 1, reps: 8 } }],
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

  it('completeActiveSession builds workout, detects Records (a first session is none), writes no Records list or heaviest-weight cache and clears active', () => {
    const S = {
      unit: 'kg',
      workouts: [{ d: '2026-08-10', start: 1, entries: [{ id: 'ex1', sets: [{ w: 80, r: 5, done: true }] }] }],
      exWeights: { old: { w: 5, d: '2026-01-01' } },
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
    expect(S.exWeights).toEqual({ old: { w: 5, d: '2026-01-01' } })
    expect('prs' in result.workout).toBe(false)
    expect(result.workout.vol).toBeUndefined()
    expect(tonnage({ unit: 'kg' }, result.workout)).toBe(90 * 5 + 40 * 10)
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



describe('sessionView', () => {
  const work = (done = false) => ({ w: 50, r: 8, done })
  const warm = (done = false) => ({ w: 20, r: 8, done, phase: 'warmup' })
  const entry = (id, sets, extra = {}) => ({ id, target: { reps: 8, weight: 50 }, sets, ...extra })

  it('reads a Superset as one Step', () => {
    const view = sessionView({
      cur: 1,
      entries: [entry('a', [work()]), entry('b', [work()], { sg: 's1' }), entry('c', [work()], { sg: 's1' }), entry('d', [work()])],
    })
    expect(view.steps.map(s => s.entries)).toEqual([[0], [1, 2], [3]])
    expect(view.stepIdx).toBe(1)
    expect(view.step.entries).toEqual([1, 2])
  })

  it('offers the next Step only once every Work set of the current Step is performed', () => {
    const active = {
      cur: 0,
      entries: [entry('a', [work(true), work()]), entry('b', [work()], { sg: 's1' }), entry('c', [work()], { sg: 's1' })],
    }
    expect(sessionView(active).nextStep).toBe(null)
    active.entries[0].sets[1].done = true
    expect(sessionView(active).nextStep.entries).toEqual([1, 2])
  })

  it('offers no next Step after the last Step or for a Step with no Work sets', () => {
    expect(sessionView({ cur: 1, entries: [entry('a', [work(true)]), entry('b', [work(true)])] }).nextStep).toBe(null)
    expect(sessionView({ cur: 0, entries: [entry('a', [warm(true)]), entry('b', [work()])] }).nextStep).toBe(null)
  })

  it('counts Work sets only, per Step and for the Session', () => {
    const view = sessionView({
      cur: 0,
      entries: [entry('a', [warm(true), work(true), work()]), entry('b', [warm(true), work(true)])],
    })
    expect(view.steps.map(({ done, total }) => ({ done, total }))).toEqual([{ done: 1, total: 2 }, { done: 1, total: 1 }])
    expect(view.progress).toEqual({ done: 2, total: 3, remaining: 1, exDone: 1, exTotal: 2, allDone: false })
  })

  it('disables Prev on the first Step and Next on the last, moving by Step', () => {
    const entries = [entry('a', [work()]), entry('b', [work()], { sg: 's1' }), entry('c', [work()], { sg: 's1' })]
    const first = sessionView({ cur: 0, entries })
    expect(first.canPrev).toBe(false)
    expect(first.canNext).toBe(true)
    const last = sessionView({ cur: 1, entries })
    expect(last.canPrev).toBe(true)
    expect(last.canNext).toBe(false)
    expect(sessionView({ cur: 2, entries }).stepIdx).toBe(1)
  })

  it('marks each Entry that has any performed set, warm-ups included', () => {
    const view = sessionView({ cur: 0, entries: [entry('a', [work()]), entry('b', [warm(true), work()]), entry('c', [work(true)])] })
    expect(view.hasPerformed).toEqual([false, true, true])
  })

  it('gates Finish: empty, warm-ups only, early, complete', () => {
    const gate = entries => sessionView({ cur: 0, entries }).finishGate
    expect(gate([entry('a', [warm(), work()])])).toBe('empty')
    expect(gate([entry('a', [warm(true), work()])])).toBe('warmups-only')
    expect(gate([entry('a', [work(true), work()]), entry('b', [work()])])).toBe('early')
    expect(gate([entry('a', [warm(), work(true)])])).toBe('complete')
  })

  it('reads a Freestyle workout with no Entries as an empty view', () => {
    const view = sessionView({ cur: 0, entries: [] })
    expect(view.steps).toEqual([])
    expect(view.step).toBe(null)
    expect(view.nextStep).toBe(null)
    expect(view.canPrev).toBe(false)
    expect(view.canNext).toBe(false)
    expect(view.progress).toEqual({ done: 0, total: 0, remaining: 0, exDone: 0, exTotal: 0, allDone: false })
    expect(view.finishGate).toBe('empty')
  })

  it('counts done/total Work sets per Entry for the reorder list', () => {
    const view = sessionView({ cur: 0, entries: [entry('a', [warm(true), work(true), work()]), entry('b', [])] })
    expect(view.entryProgress).toEqual([{ done: 1, total: 2 }, { done: 0, total: 0 }])
  })
})

describe('act', () => {
  const work = (done = false) => ({ w: 50, r: 8, done })
  const entry = (id, sets, extra = {}) => ({ id, target: { reps: 8, weight: 50 }, sets, ...extra })
  const profile = (entries, cur = 0) => ({ unit: 'kg', routines: [], workouts: [], active: { id: 'a1', d: '2026-11-16', start: 1, name: 'Push', cur, entries } })
  const types = res => res.effects.map(e => e.type)

  it('rests after a lone set while Work sets are left, and plays the set sound', () => {
    const S = profile([entry('a', [work(), work()])])
    const res = act(S, { type: 'toggle', entry: 0, set: 0 })
    expect(res.ok).toBe(true)
    expect(types(res)).toEqual(['sound:set', 'rest:start'])
    expect(S.active.entries[0].sets[0].done).toBe(true)
  })

  it('rests after a Superset round, moving to the first Entry again', () => {
    const S = profile([entry('a', [work(), work()], { sg: 's1' }), entry('b', [work(), work()], { sg: 's1' }), entry('c', [work()])])
    expect(types(act(S, { type: 'toggle', entry: 0, set: 0 }))).toEqual(['sound:set'])
    expect(S.active.cur).toBe(1)
    expect(types(act(S, { type: 'toggle', entry: 1, set: 0 }))).toEqual(['sound:set', 'rest:start'])
  })

  it('does not rest after the last set, and asks to open the finish sheet', () => {
    const S = profile([entry('a', [work(true), work()])])
    expect(types(act(S, { type: 'toggle', entry: 0, set: 1 }))).toEqual(['sound:set', 'open-finish', 'rest:stop'])
  })

  it('unchecking a set plays nothing and starts no rest', () => {
    const S = profile([entry('a', [work(true), work()])])
    expect(act(S, { type: 'toggle', entry: 0, set: 0 }).effects).toEqual([])
  })

  it('notices a logged cardio or timed exercise when another follows', () => {
    const cardio = profile([{ id: 'x', target: { mode: 'cardio', min: 20 }, sets: [{ min: 20, done: false }] }, entry('a', [work()])])
    expect(act(cardio, { type: 'toggle', entry: 0, set: 0 }).effects).toContainEqual({ type: 'notice', notice: 'cardio' })
    const timed = profile([{ id: 'y', target: { mode: 'time', sec: 45 }, sets: [{ sec: 45, done: false }] }, entry('a', [work()])])
    expect(act(timed, { type: 'toggle', entry: 0, set: 0 }).effects).toContainEqual({ type: 'notice', notice: 'timed' })
  })

  it('begins a workout and stops any rest or hold left running', () => {
    const S = { unit: 'kg', routines: [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 2, reps: 8, weight: 50 }] }], workouts: [], active: null }
    const res = act(S, { type: 'begin', routineId: 'r1', bw: 80 })
    expect(res.ok).toBe(true)
    expect(types(res)).toEqual(['rest:stop', 'hold:stop'])
    expect(S.active.name).toBe('Push')
    expect(S.active.bw).toBe(80)
    expect(S.active.entries).toHaveLength(1)
  })

  it('refuses to begin over an Active workout with performed sets, and leaves it alone', () => {
    const S = profile([entry('a', [work(true)])])
    const before = JSON.parse(JSON.stringify(S.active))
    const res = act(S, { type: 'begin', routineId: null })
    expect(res).toEqual({ ok: false, effects: [] })
    expect(S.active).toEqual(before)
  })

  it('begins over an Active workout with nothing performed', () => {
    const S = profile([entry('a', [work()])])
    expect(act(S, { type: 'begin', routineId: null }).ok).toBe(true)
    expect(S.active.entries).toEqual([])
  })

  it('discards the Active workout and stops the timers', () => {
    const S = profile([entry('a', [work(true)])])
    const res = act(S, { type: 'discard' })
    expect(res.ok).toBe(true)
    expect(types(res)).toEqual(['rest:stop', 'hold:stop'])
    expect(S.active).toBe(null)
  })

  it('finishes into a logged Workout, stops the timers and plays the finish sound', () => {
    const S = profile([entry('a', [work(true), work()]), entry('b', [work()])])
    const res = act(S, { type: 'finish' })
    expect(res.ok).toBe(true)
    expect(types(res)).toEqual(['rest:stop', 'hold:stop', 'sound:finish'])
    expect(S.active).toBe(null)
    expect(S.workouts).toHaveLength(1)
    expect(res.result.workout.entries.map(e => e.id)).toEqual(['a'])
    expect(res.result.prs).toEqual([])
    expect(res.result.routineSync).toBe(null)
  })

  it('carries the Routine sync diff when the session changed its Routine', () => {
    const S = profile([entry('0025', [work(true), work(true), work(true)], { target: { id: '0025', sets: 2, reps: 8, weight: 50 } })])
    S.routines = [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 2, reps: 8, weight: 50 }] }]
    S.active.routineId = 'r1'
    const { result } = act(S, { type: 'finish' })
    expect(result.routineSync).toMatchObject({ routineId: 'r1', routineName: 'Push', hasDiff: true })
  })

  it('cannot finish or discard without an Active workout', () => {
    const S = { routines: [], workouts: [], active: null }
    expect(act(S, { type: 'finish' })).toEqual({ ok: false, effects: [] })
    expect(act(S, { type: 'discard' })).toEqual({ ok: false, effects: [] })
  })

  it('moves Prev and Next by Step, landing on the first Entry of a Superset', () => {
    const S = profile([entry('a', [work()]), entry('b', [work()], { sg: 's1' }), entry('c', [work()], { sg: 's1' }), entry('d', [work()])])
    expect(act(S, { type: 'next' }).ok).toBe(true)
    expect(S.active.cur).toBe(1)
    act(S, { type: 'next' })
    expect(S.active.cur).toBe(3)
    expect(act(S, { type: 'next' }).ok).toBe(false)
    expect(S.active.cur).toBe(3)
    act(S, { type: 'goTo', entry: 2 })
    act(S, { type: 'prev' })
    expect(S.active.cur).toBe(0)
    expect(act(S, { type: 'prev' }).ok).toBe(false)
  })

  it('goes to an Entry, kept within the workout, with no effects', () => {
    const S = profile([entry('a', [work()]), entry('b', [work()])])
    expect(act(S, { type: 'goTo', entry: 1 })).toEqual({ ok: true, effects: [] })
    expect(S.active.cur).toBe(1)
    act(S, { type: 'goTo', entry: 9 })
    expect(S.active.cur).toBe(1)
  })

  it('edits sets: a field, adding and removing a set, adding a warm-up', () => {
    const S = profile([entry('a', [work(), work()])])
    expect(act(S, { type: 'editSet', entry: 0, set: 0, field: 'r', value: 6 })).toEqual({ ok: true, effects: [] })
    expect(S.active.entries[0].sets[0].r).toBe(6)
    expect(act(S, { type: 'addSet', entry: 0 }).ok).toBe(true)
    expect(S.active.entries[0].sets).toHaveLength(3)
    expect(act(S, { type: 'removeSet', entry: 0, set: 0 }).ok).toBe(true)
    expect(S.active.entries[0].sets).toHaveLength(2)
    expect(act(S, { type: 'removeSet', entry: 0 }).ok).toBe(true)
    expect(act(S, { type: 'removeSet', entry: 0 }).ok).toBe(false)
    expect(act(S, { type: 'addWarmup', entry: 0 }).ok).toBe(true)
    expect(S.active.entries[0].sets[0].phase).toBe('warmup')
    expect(act(S, { type: 'editSet', entry: 5, set: 0, field: 'r', value: 1 }).ok).toBe(false)
  })

  it('adds an Exercise, returns its Entry and goes to it', () => {
    const S = profile([entry('a', [work()])])
    S.active.routineId = null
    const res = act(S, { type: 'addExercise', exId: '0025', target: { sets: 2 } })
    expect(res.ok).toBe(true)
    expect(res.result).toBe(S.active.entries[1])
    expect(res.result.id).toBe('0025')
    expect(S.active.cur).toBe(1)
  })

  it('removes an Exercise without asking, and stops a running hold', () => {
    const S = profile([entry('a', [work(true)]), entry('b', [work()])], 1)
    const res = act(S, { type: 'removeExercise', entry: 0 })
    expect(res).toEqual({ ok: true, effects: [{ type: 'hold:stop' }] })
    expect(S.active.entries.map(e => e.id)).toEqual(['b'])
    expect(S.active.cur).toBe(0)
  })

  it('replaces and moves an Exercise without asking', () => {
    const S = profile([entry('a', [work(true)]), entry('b', [work()])])
    expect(act(S, { type: 'replaceExercise', entry: 0, exId: '0025', target: { sets: 1 } }).ok).toBe(true)
    expect(S.active.entries[0].id).toBe('0025')
    expect(act(S, { type: 'moveExercise', entry: 0, dir: 1 }).ok).toBe(true)
    expect(S.active.entries.map(e => e.id)).toEqual(['b', '0025'])
    expect(act(S, { type: 'moveExercise', entry: 1, dir: 1 }).ok).toBe(false)
  })

  it('writes and clears an exercise note', () => {
    const S = profile([entry('a', [work()])])
    act(S, { type: 'note', entry: 0, text: '  grip wide ' })
    expect(S.active.entries[0].notes).toBe('grip wide')
    act(S, { type: 'note', entry: 0, text: '' })
    expect(S.active.entries[0]).not.toHaveProperty('notes')
  })

  it('pairs two Entries into one Step and unpairs them', () => {
    const S = profile([entry('a', [work()]), entry('b', [work()])])
    expect(act(S, { type: 'pair', first: 0, second: 1 }).ok).toBe(true)
    expect(sessionView(S.active).steps.map(s => s.entries)).toEqual([[0, 1]])
    expect(act(S, { type: 'unpair', entry: 0 }).ok).toBe(true)
    expect(sessionView(S.active).steps.map(s => s.entries)).toEqual([[0], [1]])
  })
  describe('timed holds', () => {
    const hold = (sec = 30) => ({ id: '0001', target: { mode: 'time', sec, sets: 2 }, sets: [{ sec, done: false }, { sec, done: false }] })
    const holdRefOf = res => res.effects.find(e => e.type === 'hold:start').ref

    it('starts a hold on a set with its seconds and the exercise name', () => {
      const S = profile([hold(30)])
      const res = act(S, { type: 'startHold', entry: 0, set: 1 })
      expect(res.ok).toBe(true)
      expect(res.effects).toEqual([{ type: 'hold:start', sec: 30, label: '3/4 sit-up', ref: expect.anything() }])
    })

    it('completes a hold by logging its time on the set and checking it, with the toggle\'s effects', () => {
      const S = profile([hold(30)])
      const ref = holdRefOf(act(S, { type: 'startHold', entry: 0, set: 0 }))
      const res = act(S, { type: 'completeHold', ref, elapsed: 28 })
      expect(res.ok).toBe(true)
      expect(S.active.entries[0].sets.map(s => [s.sec, !!s.done])).toEqual([[28, true], [30, false]])
      expect(types(res)).toEqual(['sound:set', 'rest:start'])
    })

    it('logs the time on a set already performed without unchecking it', () => {
      const S = profile([hold(30)])
      S.active.entries[0].sets[0].done = true
      const ref = holdRefOf(act(S, { type: 'startHold', entry: 0, set: 0 }))
      const res = act(S, { type: 'completeHold', ref, elapsed: 40 })
      expect(res).toEqual({ ok: true, effects: [] })
      expect(S.active.entries[0].sets[0]).toMatchObject({ sec: 40, done: true })
    })

    it('lands on the held set when a warm-up is added mid-hold', () => {
      const S = profile([hold(30)])
      const ref = holdRefOf(act(S, { type: 'startHold', entry: 0, set: 0 }))
      act(S, { type: 'addWarmup', entry: 0 })
      act(S, { type: 'completeHold', ref, elapsed: 30 })
      expect(S.active.entries[0].sets.map(s => [isWarmupRow(s), !!s.done])).toEqual([
        [true, false],
        [false, true],
        [false, false],
      ])
    })

    it('never writes a hold left over from a discarded workout into the next one', () => {
      const S = profile([hold(30)])
      const ref = holdRefOf(act(S, { type: 'startHold', entry: 0, set: 0 }))
      act(S, { type: 'discard' })
      S.routines = [{ id: 'core', name: 'Core', ex: [{ id: '0001', mode: 'time', sec: 60, sets: 2, prog: 'off' }] }]
      act(S, { type: 'begin', routineId: 'core' })
      expect(act(S, { type: 'completeHold', ref, elapsed: 30 })).toEqual({ ok: false, effects: [] })
      expect(S.active.entries[0].sets.map(s => [s.sec, !!s.done])).toEqual([[60, false], [60, false]])
    })

    it('logs nothing when the held set is removed mid-hold', () => {
      const S = profile([hold(30)])
      const ref = holdRefOf(act(S, { type: 'startHold', entry: 0, set: 1 }))
      act(S, { type: 'removeSet', entry: 0, set: 1 })
      expect(act(S, { type: 'completeHold', ref, elapsed: 30 })).toEqual({ ok: false, effects: [] })
      expect(S.active.entries[0].sets.map(s => [s.sec, !!s.done])).toEqual([[30, false]])
    })

    it('logs nothing when the held Entry is gone', () => {
      const S = profile([hold(30), { ...hold(20), id: '0002' }])
      const ref = holdRefOf(act(S, { type: 'startHold', entry: 0, set: 0 }))
      act(S, { type: 'removeExercise', entry: 0 })
      expect(act(S, { type: 'completeHold', ref, elapsed: 30 })).toEqual({ ok: false, effects: [] })
      expect(S.active.entries[0].sets.every(s => !s.done)).toBe(true)
    })

    it('stops the hold when the workout is discarded', () => {
      const S = profile([hold(30)])
      act(S, { type: 'startHold', entry: 0, set: 0 })
      expect(types(act(S, { type: 'discard' }))).toContain('hold:stop')
    })

    it('holds 45 seconds when the set has none', () => {
      const S = profile([{ id: '0001', target: { mode: 'time' }, sets: [{ done: false }] }])
      expect(act(S, { type: 'startHold', entry: 0, set: 0 }).effects[0].sec).toBe(45)
    })
  })
})
