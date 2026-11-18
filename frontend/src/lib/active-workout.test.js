import { describe, it, expect, afterEach } from 'vitest'
import { tonnage } from './training-log.js'
import { isWarmupRow } from './warmup.js'
import { registerCustom } from './exercises.js'
import { sessionView, act } from './active-workout.js'

const clone = o => JSON.parse(JSON.stringify(o))

const blankProfile = () => ({
  unit: 'kg', sound: 'off', restSec: 90,
  routines: [], workouts: [], exWeights: {}, bodyweight: [], week: {}, dayPlan: {},
})

/** A Profile holding an Active workout of the given Entries. */
const withActive = (entries, extra = {}) => ({
  ...blankProfile(),
  active: { id: 'a1', d: '2026-08-24', start: 1000, routineId: null, name: 'Freestyle', bw: null, unit: 'kg', cur: 0, entries, ...extra },
})
const types = res => res.effects.map(e => e.type)
const ids = S => S.active.entries.map(e => e.id)
const finished = (S) => act(S, { type: 'finish' }).result.workout

describe('beginning a workout', () => {
  it('freezes a copy of each Routine exercise as the Entry target', () => {
    const S = blankProfile()
    S.routines = [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 8, weight: 50 }] }]
    act(S, { type: 'begin', routineId: 'r1', bw: 80 })
    expect(S.active.routineId).toBe('r1')
    expect(S.active.name).toBe('Push')
    expect(S.active.bw).toBe(80)
    expect(S.active.entries).toHaveLength(1)
    expect(S.active.entries[0].target).toEqual({ id: '0025', sets: 3, reps: 8, weight: 50 })
    expect(S.active.entries[0].target).not.toBe(S.routines[0].ex[0])
  })

  it('seeds an Entry note from the Routine note, and none from a blank one', () => {
    const S = blankProfile()
    S.routines = [{
      id: 'r1', name: 'Push', ex: [
        { id: '0025', sets: 3, reps: 8, weight: 50, notes: 'Seat height 5, pin 8' },
        { id: '0026', sets: 3, reps: 10, weight: 40, notes: '   ' },
        { id: '0027', sets: 3, reps: 12, weight: 15 },
      ],
    }]
    act(S, { type: 'begin', routineId: 'r1', bw: 80 })
    const [noted, blank, none] = S.active.entries
    expect(noted.notes).toBe('Seat height 5, pin 8')
    expect(noted.target.notes).toBe('Seat height 5, pin 8')
    for (const e of [blank, none]) {
      expect(e.notes).toBeUndefined()
      expect(e.target.notes).toBeUndefined()
    }
  })

  it('trims a Routine note and caps it at 500 characters', () => {
    const S = blankProfile()
    S.routines = [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 8, weight: 50, notes: `  ${'B'.repeat(600)}  ` }] }]
    act(S, { type: 'begin', routineId: 'r1', bw: 80 })
    expect(S.active.entries[0].notes).toBe('B'.repeat(500))
    expect(S.active.entries[0].target.notes).toBe('B'.repeat(500))
  })

  it('leaves the Routine untouched when the session reorders it', () => {
    const S = blankProfile()
    S.routines = [{ id: 'r1', name: 'Upper', ex: [{ id: '0025' }, { id: '0043' }] }]
    act(S, { type: 'begin', routineId: 'r1', bw: 75 })
    const routineSnapshot = clone(S.routines)
    expect(act(S, { type: 'moveExercise', entry: 0, dir: 1 }).ok).toBe(true)
    expect(ids(S)).toEqual(['0043', '0025'])
    expect(S.routines).toEqual(routineSnapshot)
  })
})

describe('adding an Exercise', () => {
  it('seeds a Routine workout from its progression stream and a Freestyle one from history', () => {
    const S = blankProfile()
    S.routines = [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 }] }]
    S.workouts = [
      { d: '2026-08-10', entries: [{ id: '0025', sets: [{ w: 50, r: 8, done: true }, { w: 50, r: 8, done: true }, { w: 50, r: 8, done: true }], target: { sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 } }] },
    ]
    S.active = { id: 'a1', routineId: 'r1', entries: [], cur: 0 }
    const { result: entry } = act(S, { type: 'addExercise', exId: '0025', target: { sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 } })
    expect(S.active.entries).toEqual([entry])
    expect(S.active.cur).toBe(0)
    expect(entry.sets[0].w).toBe(52.5)

    const free = blankProfile()
    free.workouts = [{ d: '2026-08-10', entries: [{ id: '0025', sets: [{ w: 60, r: 10, done: true }] }] }]
    free.active = { id: 'a2', routineId: null, entries: [], cur: 0 }
    const { result: freeEntry } = act(free, { type: 'addExercise', exId: '0025', target: { sets: 2 } })
    expect(freeEntry.sets[0].w).toBe(60)
    expect(freeEntry.sets[0].r).toBe(10)
  })

  it('builds a Freestyle Entry from the target with no Prescription', () => {
    const S = withActive([])
    const { result: entry } = act(S, { type: 'addExercise', exId: '0025', target: { sets: 3, reps: 10, weight: 60 } })
    expect(entry.id).toBe('0025')
    expect(entry.target).toEqual({ sets: 3, reps: 10, weight: 60 })
    expect(entry.plan).toBeNull()
    expect(entry.sets).toHaveLength(3)
    expect(entry.sets[0]).toMatchObject({ w: 60, r: 10 })
  })

  it('always starts an added Exercise with no note', () => {
    const S = blankProfile()
    act(S, { type: 'begin', routineId: null, bw: 80 })
    expect(S.active.entries).toHaveLength(0)
    for (const target of [undefined, { notes: 'old cue from somewhere' }]) {
      const { result: entry } = act(S, { type: 'addExercise', exId: '0025', target })
      expect(entry.notes).toBeUndefined()
      expect(entry.target.notes).toBeUndefined()
    }
  })
})

describe('editing sets', () => {
  it('cascades a weight change forward, never back', () => {
    const S = withActive([{ id: 'ex1', sets: [{ w: 50, r: 8, done: true }, { w: 50, r: 8, done: false }, { w: 50, r: 8, done: false }] }])
    expect(act(S, { type: 'editSet', entry: 0, set: 1, field: 'w', value: 55 }).ok).toBe(true)
    expect(S.active.entries[0].sets.map(s => s.w)).toEqual([50, 55, 55])
  })

  it('adds a set like the last, puts a warm-up first, and keeps one set at least', () => {
    const S = withActive([{ id: 'ex1', target: { reps: 8, weight: 60 }, sets: [{ w: 60, r: 8, done: false }] }])
    act(S, { type: 'addSet', entry: 0 })
    expect(S.active.entries[0].sets[1].w).toBe(60)
    act(S, { type: 'addWarmup', entry: 0 })
    expect(S.active.entries[0].sets).toHaveLength(3)
    expect(S.active.entries[0].sets[0]).toMatchObject({ warmup: true, phase: 'warmup' })
    expect(act(S, { type: 'removeSet', entry: 0 }).ok).toBe(true)
    expect(act(S, { type: 'removeSet', entry: 0 }).ok).toBe(true)
    expect(act(S, { type: 'removeSet', entry: 0 }).ok).toBe(false)
    expect(S.active.entries[0].sets).toHaveLength(1)
  })
})

describe('toggling a set', () => {
  const work = (done = false, w = 80) => ({ w, r: 5, done })
  const warm = () => ({ w: 40, r: 5, done: false, phase: 'warmup', warmup: true })
  const loaded = (id, sets, extra = {}) => ({ id, target: { reps: 5, weight: 80 }, sets, ...extra })
  const cardio = id => ({ id, target: { mode: 'cardio', min: 20, speed: 8 }, sets: [{ min: 20, speed: 8, done: false }] })
  const timed = id => ({ id, target: { mode: 'time', sec: 45 }, sets: [{ sec: 45, done: false }] })
  const bodyweight = id => ({ id, target: { mode: 'reps', reps: 10, bodyweight: true }, sets: [{ w: 0, r: 10, done: false }] })
  const toggle = (S, entry, set) => types(act(S, { type: 'toggle', entry, set }))

  it('rests after every set but the last, and on the last asks for the finish sheet and stops the rest', () => {
    const S = withActive([loaded('ex1', [work(), work(), work()])])
    expect(toggle(S, 0, 0)).toEqual(['sound:set', 'rest:start'])
    expect(toggle(S, 0, 1)).toEqual(['sound:set', 'rest:start'])
    expect(toggle(S, 0, 2)).toEqual(['sound:set', 'open-finish', 'rest:stop'])
  })

  it('rests after a set added in place of a removed done set', () => {
    for (const remove of [{ set: 2 }, {}]) {
      const S = withActive([loaded('ex1', [work(), work(), work()]), loaded('ex2', [work()])])
      for (const i of [0, 1, 2]) toggle(S, 0, i)
      act(S, { type: 'removeSet', entry: 0, ...remove })
      act(S, { type: 'addSet', entry: 0 })
      expect(toggle(S, 0, 2)).toEqual(['sound:set', 'rest:stop', 'rest:start'])
    }
  })

  it('starts no second rest for a re-ticked set after an unticked set is removed', () => {
    const S = withActive([loaded('ex1', [work(), work(), work()]), loaded('ex2', [work()])])
    toggle(S, 0, 0)
    toggle(S, 0, 1)
    toggle(S, 0, 1)
    act(S, { type: 'removeSet', entry: 0, set: 2 })
    expect(toggle(S, 0, 1)).toEqual(['sound:set'])
  })

  it('does not ask for the finish sheet when a warm-up is ticked on a last Step with no Work sets', () => {
    const S = withActive([loaded('ex1', [work(true)]), loaded('ex2', [warm()])], { cur: 1 })
    expect(sessionView(S.active).step.total).toBe(0)
    expect(toggle(S, 1, 0)).toEqual(['sound:set'])
  })

  it('asks for the finish sheet, with no rest, when a lone cardio exercise is logged', () => {
    const S = withActive([cardio('ex-cardio')])
    expect(toggle(S, 0, 0)).toEqual(['sound:set', 'open-finish', 'rest:stop'])
  })

  it('asks for the finish sheet when the workout ends on a cardio exercise', () => {
    const S = withActive([loaded('ex1', [work(true), work(true)]), cardio('ex-cardio')], { cur: 1 })
    expect(toggle(S, 1, 0)).toEqual(['sound:set', 'open-finish', 'rest:stop'])
  })

  it('rests between exercises and stays on the finished one, for every kind of exercise', () => {
    for (const [first, notice] of [
      [loaded('ex1', [work()]), null],
      [bodyweight('ex-bw'), null],
      [timed('ex-timed'), 'timed'],
      [cardio('ex-cardio'), 'cardio'],
    ]) {
      const S = withActive([first, loaded('ex2', [work(false, 60)])])
      const res = act(S, { type: 'toggle', entry: 0, set: 0 })
      expect(res.effects.filter(e => e.type !== 'notice').map(e => e.type), first.id).toEqual(['sound:set', 'rest:stop', 'rest:start'])
      expect(res.effects.find(e => e.type === 'notice')?.notice ?? null, first.id).toBe(notice)
      expect(S.active.cur, first.id).toBe(0)
    }
  })

  it('rests after the last set of an exercise when another follows, and not again on a re-check', () => {
    const S = withActive([loaded('ex1', [work(true), work()]), loaded('ex2', [work(false, 60)])])
    expect(toggle(S, 0, 1)).toEqual(['sound:set', 'rest:stop', 'rest:start'])
    expect(S.active.cur).toBe(0)
    expect(toggle(S, 0, 1)).toEqual([])
    expect(toggle(S, 0, 1)).toEqual(['sound:set'])
  })

  it('never rests again for work already counted, even on an Entry resumed without a high-water mark', () => {
    const S = withActive([loaded('ex1', [work(true), work(true)])])
    expect(toggle(S, 0, 0)).toEqual([])
    expect(toggle(S, 0, 0)).toEqual(['sound:set', 'open-finish'])
  })

  it('treats an unticked warm-up as prep, so it never holds back rest or the finish sheet', () => {
    const S = withActive([loaded('ex1', [warm(), work(), work()])])
    expect(toggle(S, 0, 1)).toEqual(['sound:set', 'rest:start'])
    expect(toggle(S, 0, 2)).toEqual(['sound:set', 'open-finish', 'rest:stop'])
  })

  it('does not ask for the finish sheet when an all-warm-up Entry is logged, since warm-ups never finish a Step', () => {
    const S = withActive([loaded('ex1', [warm()])])
    expect(toggle(S, 0, 0)).toEqual(['sound:set'])
  })

  it('moves to the Superset partner mid-round, without resting', () => {
    const S = withActive([loaded('ex1', [work(), work()], { sg: 's1' }), loaded('ex2', [work()], { sg: 's1' })])
    expect(toggle(S, 0, 0)).toEqual(['sound:set'])
    expect(S.active.cur).toBe(1)
  })

  it('ends a Superset round on the last member with work left, skipping a spent short one', () => {
    const S = withActive([loaded('a', [work(true), work(), work()], { sg: 's1' }), loaded('b', [work(true)], { sg: 's1' })])
    expect(toggle(S, 0, 1)).toEqual(['sound:set', 'rest:start'])
    expect(S.active.cur).toBe(0)
  })

  it('wraps a Superset round back to the first member with work left', () => {
    const S = withActive([loaded('a', [work(true), work(), work()], { sg: 's1' }), loaded('b', [work()], { sg: 's1' })], { cur: 1 })
    expect(toggle(S, 1, 0)).toEqual(['sound:set', 'rest:start'])
    expect(S.active.cur).toBe(0)
  })

  it('rests after a finished Superset and stays on it when another exercise follows', () => {
    const S = withActive([
      loaded('a', [work(true), work(true), work(true)], { sg: 's1' }),
      loaded('b', [work(true), work(true), work()], { sg: 's1' }),
      loaded('c', [work(), work(), work()]),
    ], { cur: 1 })
    expect(toggle(S, 1, 2)).toEqual(['sound:set', 'rest:stop', 'rest:start'])
    expect(S.active.cur).toBe(1)
    expect(sessionView(S.active).nextStep.entries).toEqual([2])
  })

  it('asks for the finish sheet, with no rest, when the last Step is a Superset', () => {
    const S = withActive([loaded('a', [work(true)], { sg: 's1' }), loaded('b', [work()], { sg: 's1' })], { cur: 1 })
    expect(toggle(S, 1, 0)).toEqual(['sound:set', 'open-finish', 'rest:stop'])
    expect(S.active.cur).toBe(1)
  })

  it('keeps the Superset flow right after an exercise before it is removed', () => {
    const S = withActive([
      loaded('warm', [work(true), work(true)]),
      loaded('bench', [work(), work()], { sg: 'g1' }),
      loaded('row', [work(), work()], { sg: 'g1' }),
    ], { cur: 1 })
    act(S, { type: 'removeExercise', entry: 0 })
    expect(S.active.cur).toBe(0)
    expect(toggle(S, 0, 0)).toEqual(['sound:set'])
    expect(S.active.cur).toBe(1)
    expect(toggle(S, 1, 0)).toEqual(['sound:set', 'rest:start'])
  })

  it('logs no weight cache and no top weight on the way', () => {
    const S = withActive([loaded('ex1', [work()]), loaded('ex2', [work()])])
    act(S, { type: 'toggle', entry: 0, set: 0 })
    act(S, { type: 'toggle', entry: 1, set: 0 })
    expect(S.exWeights).toEqual({})
    expect(S.active.entries.every(e => e.topW === undefined)).toBe(true)
  })
})

describe('the next Step (the Next key)', () => {
  const work = (done = false) => ({ w: 80, r: 5, done })
  const loaded = (id, sets, extra = {}) => ({ id, target: { reps: 5, weight: 80 }, sets, ...extra })
  const nextOf = S => sessionView(S.active).nextStep?.entries[0] ?? null

  it('appears once every Work set of the Step is performed, and goes on an uncheck', () => {
    const S = withActive([loaded('ex1', [work(), work()]), loaded('ex2', [work()])])
    act(S, { type: 'toggle', entry: 0, set: 0 })
    expect(nextOf(S)).toBe(null)
    act(S, { type: 'toggle', entry: 0, set: 1 })
    expect(nextOf(S)).toBe(1)
    act(S, { type: 'toggle', entry: 0, set: 1 })
    expect(nextOf(S)).toBe(null)
  })

  it('is absent on the last Step, where the finish sheet opens instead', () => {
    const S = withActive([loaded('ex1', [work(true)]), loaded('ex2', [work()])], { cur: 1 })
    act(S, { type: 'toggle', entry: 1, set: 0 })
    expect(nextOf(S)).toBe(null)
  })

  it('reads the same after a bodyweight, timed or cardio Entry', () => {
    for (const first of [
      { id: 'ex-bw', target: { mode: 'reps', reps: 10, bodyweight: true }, sets: [{ w: 0, r: 10, done: false }] },
      { id: 'ex-timed', target: { mode: 'time', sec: 45 }, sets: [{ sec: 45, done: false }] },
      { id: 'ex-cardio', target: { mode: 'cardio', min: 20, speed: 8 }, sets: [{ min: 20, speed: 8, done: false }] },
    ]) {
      const S = withActive([first, loaded('ex2', [work()])])
      act(S, { type: 'toggle', entry: 0, set: 0 })
      expect(nextOf(S), first.id).toBe(1)
    }
  })

  it('is not held back by an unticked warm-up', () => {
    const S = withActive([loaded('ex1', [{ w: 40, r: 5, done: false, phase: 'warmup', warmup: true }, work(), work()]), loaded('ex2', [work()])])
    act(S, { type: 'toggle', entry: 0, set: 1 })
    act(S, { type: 'toggle', entry: 0, set: 2 })
    expect(nextOf(S)).toBe(1)
  })

  it('shows once for a Superset, after its last Work set, naming the next Step\'s first Entry', () => {
    const S = withActive([
      loaded('ex1', [work()], { sg: 'sg-0-1' }), loaded('ex2', [work()], { sg: 'sg-0-1' }),
      loaded('ex3', [work()], { sg: 'sg-2-3' }), loaded('ex4', [work()], { sg: 'sg-2-3' }),
    ])
    act(S, { type: 'toggle', entry: 0, set: 0 })
    expect(S.active.cur).toBe(1)
    expect(nextOf(S)).toBe(null)
    act(S, { type: 'toggle', entry: 1, set: 0 })
    expect(nextOf(S)).toBe(2)
    act(S, { type: 'goTo', entry: 0 })
    expect(nextOf(S)).toBe(2)
  })

  it('is absent for an Entry with no Work sets', () => {
    const S = withActive([loaded('ex1', []), loaded('ex2', [work()])])
    expect(nextOf(S)).toBe(null)
  })
})

describe('moving around', () => {
  it('goes to an Entry, clamped to the workout at both ends', () => {
    const S = withActive([{ id: 'ex1' }, { id: 'ex2' }, { id: 'ex3' }])
    act(S, { type: 'goTo', entry: 2 })
    expect(S.active.cur).toBe(2)
    act(S, { type: 'goTo', entry: 10 })
    expect(S.active.cur).toBe(2)
    act(S, { type: 'goTo', entry: -5 })
    expect(S.active.cur).toBe(0)
  })
})

describe('removing an Exercise', () => {
  const plain = id => ({ id, sets: [{ w: 0, r: 1, done: false }] })

  it('dissolves a Superset left with one member and keeps the cursor in range', () => {
    const S = withActive([{ ...plain('ex1'), sg: 'sg-1' }, { ...plain('ex2'), sg: 'sg-1' }, plain('ex3')], { cur: 2 })
    expect(act(S, { type: 'removeExercise', entry: 0 }).ok).toBe(true)
    expect(ids(S)).toEqual(['ex2', 'ex3'])
    expect(S.active.entries[0].sg).toBeUndefined()
    expect(S.active.cur).toBe(1)
  })

  it('keeps the cursor on the current exercise when an earlier one goes', () => {
    const S = withActive([{ ...plain('a'), sg: 'g1' }, { ...plain('b'), sg: 'g1' }, plain('c')], { cur: 1 })
    act(S, { type: 'removeExercise', entry: 0 })
    expect(ids(S)).toEqual(['b', 'c'])
    expect(S.active.cur).toBe(0)
    expect(S.active.entries[0].sg).toBeUndefined()

    const T = withActive([plain('a'), plain('b'), plain('c')], { cur: 2 })
    act(T, { type: 'removeExercise', entry: 0 })
    expect(T.active.entries[T.active.cur].id).toBe('c')
  })

  it('dissolves the Superset when its later member goes', () => {
    const S = withActive([{ ...plain('a'), sg: 'g1' }, { ...plain('b'), sg: 'g1' }, plain('c')])
    act(S, { type: 'removeExercise', entry: 1 })
    expect(ids(S)).toEqual(['a', 'c'])
    expect(S.active.entries[0].sg).toBeUndefined()
  })

  it('leaves an empty, coherent workout when the last exercise goes', () => {
    const S = withActive([plain('a')])
    act(S, { type: 'removeExercise', entry: 0 })
    expect(S.active.entries).toHaveLength(0)
    expect(S.active.cur).toBe(0)
  })
})

describe('replacing an Exercise', () => {
  const replace = (S, entry, exId, target) => act(S, { type: 'replaceExercise', entry, exId, target })

  it('replaces in place and moves the cursor to it', () => {
    const S = withActive([
      { id: 'ex0', sets: [{ w: 40, r: 10, done: true }] },
      { id: 'ex1', sets: [{ w: 50, r: 8, done: true }] },
      { id: 'ex2', sets: [{ w: 60, r: 6, done: false }] },
    ])
    expect(replace(S, 1, '0025', { sets: 3, reps: 8, weight: 70 }).ok).toBe(true)
    expect(ids(S)).toEqual(['ex0', '0025', 'ex2'])
    expect(S.active.cur).toBe(1)
  })

  it('takes over the outgoing Superset group, and has none when the outgoing had none', () => {
    const S = withActive([{ id: 'ex0', sg: 'sg-pair-1', sets: [] }, { id: 'ex1', sets: [] }])
    replace(S, 0, '0025', { sets: 2 })
    expect(S.active.entries[0].sg).toBe('sg-pair-1')
    replace(S, 1, '0026', { sets: 2 })
    expect(S.active.entries[1].sg).toBeUndefined()
  })

  it('carries none of the outgoing Entry\'s progress flags', () => {
    const S = withActive([{ id: 'ex0', asked: true, hw: 3, topW: 85, sets: [{ w: 85, r: 5, done: true }] }])
    replace(S, 0, '0025', { sets: 3, reps: 10, weight: 60 })
    expect(S.active.entries[0].asked).toBeUndefined()
    expect(S.active.entries[0].hw).toBeUndefined()
    expect(S.active.entries[0].topW).toBeUndefined()
  })

  it('seeds a Routine workout\'s replacement from its progression stream and leaves the Routine alone', () => {
    const S = blankProfile()
    S.routines = [{ id: 'r1', name: 'Push', ex: [{ id: 'old-lift', sets: 3, reps: 8, weight: 40 }, { id: '0025', sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 }] }]
    S.workouts = [{
      d: '2026-08-10', routineId: 'r1',
      entries: [{ id: '0025', sets: [{ w: 50, r: 8, done: true }, { w: 50, r: 8, done: true }, { w: 50, r: 8, done: true }], target: { sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 } }],
    }]
    S.active = { id: 'a1', routineId: 'r1', cur: 0, entries: [{ id: 'old-lift', sets: [{ w: 40, r: 8, done: true }] }] }
    const routineSnapshot = clone(S.routines)
    replace(S, 0, '0025', { sets: 3, reps: 8, weight: 50, prog: 'linear', inc: 2.5 })
    const replaced = S.active.entries[0]
    expect(replaced.id).toBe('0025')
    expect(replaced.plan.kind).toBe('up')
    expect(replaced.sets[0].w).toBe(52.5)
    expect(S.routines).toEqual(routineSnapshot)
  })

  it('seeds a Freestyle workout\'s replacement from history, with no Prescription', () => {
    const S = blankProfile()
    S.workouts = [{ d: '2026-08-10', entries: [{ id: '0025', sets: [{ w: 65, r: 10, done: true }, { w: 65, r: 10, done: true }] }] }]
    S.active = { id: 'a2', routineId: null, cur: 0, entries: [{ id: 'other', sets: [{ w: 20, r: 12, done: false }] }] }
    replace(S, 0, '0025', { sets: 2 })
    expect(S.active.entries[0].plan).toBeNull()
    expect(S.active.entries[0].sets[0]).toMatchObject({ w: 65, r: 10 })
  })

  it('refuses a missing Entry, a missing exercise or a missing Active workout', () => {
    const S = withActive([{ id: 'ex0', sets: [] }])
    for (const [entry, exId] of [[-1, '0025'], [5, '0025'], [0, ''], [0, null]]) {
      expect(replace(S, entry, exId).ok).toBe(false)
    }
    expect(replace({ active: null }, 0, '0025').ok).toBe(false)
    expect(replace({ active: { entries: 'not-array' } }, 0, '0025').ok).toBe(false)
    expect(ids(S)).toEqual(['ex0'])
  })

  it('drops the outgoing note, and keeps a note typed for the replacement', () => {
    const noted = () => withActive([{ id: '0025', notes: 'Old note', target: { sets: 3, reps: 8, weight: 80, notes: 'Old note' }, sets: [{ w: 80, r: 8, done: true }] }])
    const S = noted()
    replace(S, 0, '0027', { sets: 3, reps: 12, weight: 20 })
    expect(S.active.entries[0].notes).toBeUndefined()
    expect(S.active.entries[0].target.notes).toBeUndefined()

    const T = noted()
    replace(T, 0, '0027', { sets: 3, reps: 12, weight: 20, notes: 'Newly typed cue in exConfigSheet' })
    expect(T.active.entries[0].notes).toBe('Newly typed cue in exConfigSheet')
    expect(T.active.entries[0].target.notes).toBe('Newly typed cue in exConfigSheet')

    const U = noted()
    replace(U, 0, '0027', { sets: 3, notes: '   ' })
    expect(U.active.entries[0].notes).toBeUndefined()
    expect(U.active.entries[0].target.notes).toBeUndefined()
  })
})

describe('reordering Exercises', () => {
  const move = (S, entry, dir) => act(S, { type: 'moveExercise', entry, dir }).ok

  it('moves up and down within bounds, and the cursor follows the moved Entry', () => {
    const S = withActive([{ id: 'ex0' }, { id: 'ex1' }, { id: 'ex2' }], { cur: 1 })
    expect(move(S, 0, -1)).toBe(false)
    expect(move(S, 2, 1)).toBe(false)
    expect(move(S, 1, -1)).toBe(true)
    expect(ids(S)).toEqual(['ex1', 'ex0', 'ex2'])
    expect(S.active.cur).toBe(0)
    expect(move(S, 0, 1)).toBe(true)
    expect(ids(S)).toEqual(['ex0', 'ex1', 'ex2'])
    expect(S.active.cur).toBe(1)
  })

  it('puts the cursor on the moved Entry wherever it was before', () => {
    const S = withActive([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { cur: 2 })
    move(S, 0, 1)
    expect(ids(S)).toEqual(['b', 'a', 'c'])
    expect(S.active.cur).toBe(1)
    move(S, 2, -1)
    expect(ids(S)).toEqual(['b', 'c', 'a'])
    expect(S.active.cur).toBe(1)
  })

  it('refuses a bad index or direction, or no Active workout', () => {
    const S = withActive([{ id: 'a' }])
    expect(move({}, 0, 1)).toBe(false)
    expect(move({ active: null }, 0, 1)).toBe(false)
    for (const [entry, dir] of [[-1, 1], [5, 1], [0, 0], [0, 2], ['0', 1], [0, '1']]) {
      expect(move(S, entry, dir), `${entry},${dir}`).toBe(false)
    }
  })

  it('keeps a Superset through a swap inside it, and dissolves it when a move splits it', () => {
    const S = withActive([{ id: 'bench', sg: 'sg-pair' }, { id: 'row', sg: 'sg-pair' }, { id: 'squat' }])
    move(S, 0, 1)
    expect(S.active.entries.map(e => [e.id, e.sg])).toEqual([['row', 'sg-pair'], ['bench', 'sg-pair'], ['squat', undefined]])
    move(S, 1, 1)
    expect(S.active.entries.map(e => [e.id, e.sg])).toEqual([['row', undefined], ['squat', undefined], ['bench', undefined]])
  })

  it('carries performed sets and every Entry field along unchanged', () => {
    const entry0 = {
      id: '0025', asked: true, hw: 2, topW: 80, target: { sets: 3, reps: 8, weight: 80 },
      sets: [{ w: 80, r: 8, done: true, phase: 'work', rir: 2 }, { w: 80, r: 8, done: true, phase: 'work', rir: 1 }, { w: 80, r: 6, done: false, phase: 'work' }],
    }
    const entry1 = { id: '0043', target: { sets: 2, reps: 10, weight: 100 }, sets: [{ w: 100, r: 10, done: false, phase: 'work' }, { w: 100, r: 10, done: false, phase: 'work' }] }
    const S = withActive([clone(entry0), clone(entry1)])
    move(S, 0, 1)
    expect(S.active.entries).toEqual([entry1, entry0])
  })
})

describe('exercise notes', () => {
  it('edits the session note without touching the Routine note it started from', () => {
    const S = withActive([{ id: '0025', notes: 'Initial note', target: { sets: 3, reps: 8, weight: 80, notes: 'Baseline routine note' }, sets: [{ w: 80, r: 8, done: false }] }])
    expect(act(S, { type: 'note', entry: 0, text: '  Adjusted seat to pin 6  ' }).ok).toBe(true)
    expect(S.active.entries[0].notes).toBe('Adjusted seat to pin 6')
    expect(S.active.entries[0].target.notes).toBe('Baseline routine note')
    act(S, { type: 'note', entry: 0, text: '   ' })
    expect('notes' in S.active.entries[0]).toBe(false)
    expect(S.active.entries[0].target.notes).toBe('Baseline routine note')
    expect(act(S, { type: 'note', entry: 99, text: 'note' }).ok).toBe(false)
    expect(act({ active: null }, { type: 'note', entry: 0, text: 'note' }).ok).toBe(false)
  })
})

describe('finishing a workout', () => {
  afterEach(() => registerCustom([]))

  it('logs the Workout, finds Records (a first session is none), writes no Records list or weight cache, and ends the Active workout', () => {
    const S = withActive([
      { id: 'ex1', sets: [{ w: 90, r: 5, done: true }], target: { sets: 1, reps: 5 }, topW: 90 },
      { id: 'ex2', sets: [{ w: 40, r: 10, done: true }], target: { sets: 1, reps: 10 } },
    ])
    S.workouts = [{ d: '2026-08-10', start: 1, entries: [{ id: 'ex1', sets: [{ w: 80, r: 5, done: true }] }] }]
    S.exWeights = { old: { w: 5, d: '2026-01-01' } }
    const { result } = act(S, { type: 'finish' })
    expect(result.prs).toEqual(['ex1'])
    expect(S.workouts).toHaveLength(2)
    expect(S.active).toBeNull()
    expect(result.workout.unit).toBe('kg')
    expect(S.exWeights).toEqual({ old: { w: 5, d: '2026-01-01' } })
    expect('prs' in result.workout).toBe(false)
    expect(result.workout.vol).toBeUndefined()
    expect(tonnage({ unit: 'kg' }, result.workout)).toBe(90 * 5 + 40 * 10)
  })

  it('logs the Workout record and leaves out Entries with nothing performed', () => {
    const S = withActive([
      { id: '0025', sets: [{ done: true, w: 60, r: 8 }], topW: 60, target: { sets: 1, reps: 8 } },
      { id: 'empty', sets: [{ done: false, w: 0, r: 0 }] },
    ], { id: 'active-1', d: '2026-08-08', routineId: 'routine-1', name: 'Push', bw: 80 })
    const w = finished(S)
    expect(w).toEqual({
      id: 'active-1', d: '2026-08-08', start: 1000, end: w.end, routineId: 'routine-1', name: 'Push', bw: 80,
      unit: 'kg',
      entries: [{ id: '0025', sets: [{ done: true, w: 60, r: 8 }], topW: 60, target: { sets: 1, reps: 8 } }],
    })
    expect(typeof w.end).toBe('number')
  })

  it('writes no topW for a new Entry, and keeps one a resumed Entry carries', () => {
    const w = finished(withActive([
      { id: 'new', sets: [{ done: true, w: 60, r: 8 }] },
      { id: 'legacy', sets: [{ done: true, w: 60, r: 8 }], topW: 65 },
    ]))
    expect('topW' in w.entries[0]).toBe(false)
    expect(w.entries[1].topW).toBe(65)
  })

  it('keeps a muscle snapshot of a custom exercise, and none of a catalogue one', () => {
    registerCustom([{ id: 'c-custom', n: 'Custom lift', custom: true }])
    const w = finished(withActive([
      { id: '0025', sets: [{ done: true, w: 60, r: 8 }] },
      { id: 'c-custom', sets: [{ done: true, w: 20, r: 8 }] },
    ]))
    expect(w.entries[0]).not.toHaveProperty('muscleSnapshot')
    expect(w.entries[1].muscleSnapshot).toMatchObject({ n: 'Custom lift' })
  })

  it('keeps each Entry note, trimmed, and none for a blank one', () => {
    const w = finished(withActive([
      { id: '0025', notes: '  Right shoulder felt tight on set 2  ', sets: [{ done: true, w: 80, r: 8 }] },
      { id: '0026', notes: '   ', sets: [{ done: true, w: 50, r: 10 }] },
      { id: '0027', sets: [{ done: true, w: 20, r: 12 }] },
    ]))
    expect(w.entries[0].notes).toBe('Right shoulder felt tight on set 2')
    expect(w.entries[1]).not.toHaveProperty('notes')
    expect(w.entries[2]).not.toHaveProperty('notes')
  })

  describe('Routine sync', () => {
    const pushDay = ex => [{ id: 'routine-push', name: 'Push Day', ex }]
    const fromRoutine = (routineId, entries) => withActive(entries, { id: 'active-1', d: '2026-10-29', routineId, name: 'Push Day' })
    const fiveSets = n => Array.from({ length: n }, () => ({ w: 80, r: 5, done: true }))

    it('carries the diff when the session changed its Routine', () => {
      const S = fromRoutine('routine-push', [
        { id: '0025', sets: fiveSets(4), target: { sets: 3, reps: 5 } },
        { id: '0026', sets: [{ w: 30, r: 10, done: true }], target: { sets: 1, reps: 10 } },
      ])
      S.routines = pushDay([{ id: '0025', sets: 3 }])
      const { routineSync } = act(S, { type: 'finish' }).result
      expect(routineSync).toMatchObject({ hasDiff: true, routineId: 'routine-push', routineName: 'Push Day' })
      expect(routineSync.changes.length).toBeGreaterThan(0)
      expect(routineSync.syncedEx).toEqual([{ id: '0025', sets: 4, reps: 5 }, { id: '0026', sets: 1, reps: 10 }])
      expect(S.active).toBeNull()
    })

    it('carries none when the session matched its Routine exactly', () => {
      const S = fromRoutine('routine-push', [{ id: '0025', sets: fiveSets(3), target: { sets: 3, reps: 5 } }])
      S.routines = pushDay([{ id: '0025', sets: 3, reps: 5 }])
      expect(act(S, { type: 'finish' }).result.routineSync).toBeNull()
    })

    it('carries none for a Freestyle workout', () => {
      const S = fromRoutine(null, [{ id: '0025', sets: fiveSets(1), target: { sets: 1, reps: 5 } }])
      S.routines = pushDay([{ id: '0025', sets: 3 }])
      expect(act(S, { type: 'finish' }).result.routineSync).toBeNull()
    })

    it('carries none when the Routine has since been deleted', () => {
      const S = fromRoutine('deleted-routine', [{ id: '0025', sets: fiveSets(1), target: { sets: 1, reps: 5 } }])
      expect(act(S, { type: 'finish' }).result.routineSync).toBeNull()
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

    describe('when Entries shift mid-hold', () => {
      const lift = id => ({ id, target: { sets: 1, reps: 5 }, sets: [{ w: 50, r: 5, done: false }] })
      const untouched = S => S.active.entries.every(e => e.sets.every(s => !s.done))

      it('logs nothing when the held Entry is moved', () => {
        const S = profile([lift('0025'), hold(30)])
        const ref = holdRefOf(act(S, { type: 'startHold', entry: 1, set: 0 }))
        expect(act(S, { type: 'moveExercise', entry: 1, dir: -1 }).effects).toEqual([{ type: 'hold:stop' }])
        expect(act(S, { type: 'completeHold', ref, elapsed: 22 })).toEqual({ ok: false, effects: [] })
        expect(S.active.entries[0].sets.map(s => s.sec)).toEqual([30, 30])
        expect(untouched(S)).toBe(true)
      })

      it('never lands on another Entry of the same exercise swapped into its place', () => {
        const S = profile([hold(30), hold(60)])
        const ref = holdRefOf(act(S, { type: 'startHold', entry: 0, set: 0 }))
        act(S, { type: 'moveExercise', entry: 0, dir: 1 })
        expect(act(S, { type: 'completeHold', ref, elapsed: 22 })).toEqual({ ok: false, effects: [] })
        expect(S.active.entries.map(e => e.sets[0].sec)).toEqual([60, 30])
        expect(untouched(S)).toBe(true)
      })

      it('never lands on another Entry of the same exercise when an earlier one is removed', () => {
        const S = profile([lift('0025'), hold(30), hold(60)])
        const ref = holdRefOf(act(S, { type: 'startHold', entry: 1, set: 0 }))
        act(S, { type: 'removeExercise', entry: 0 })
        expect(act(S, { type: 'completeHold', ref, elapsed: 22 })).toEqual({ ok: false, effects: [] })
        expect(S.active.entries.map(e => e.sets[0].sec)).toEqual([30, 60])
        expect(untouched(S)).toBe(true)
      })

      it('logs nothing and stops the hold when an Entry is replaced', () => {
        const S = profile([lift('0025'), hold(30)])
        const ref = holdRefOf(act(S, { type: 'startHold', entry: 1, set: 0 }))
        expect(act(S, { type: 'replaceExercise', entry: 0, exId: '0043' }).effects).toEqual([{ type: 'hold:stop' }])
        expect(act(S, { type: 'completeHold', ref, elapsed: 22 })).toEqual({ ok: false, effects: [] })
        expect(untouched(S)).toBe(true)
      })

      it('still lands the time when an exercise is added mid-hold', () => {
        const S = profile([hold(30)])
        const ref = holdRefOf(act(S, { type: 'startHold', entry: 0, set: 0 }))
        act(S, { type: 'addExercise', exId: '0025' })
        expect(act(S, { type: 'completeHold', ref, elapsed: 22 }).ok).toBe(true)
        expect(S.active.entries[0].sets.map(s => [s.sec, !!s.done])).toEqual([[22, true], [30, false]])
      })

      it('completes a hold on an Active workout saved before layouts were counted', () => {
        const S = profile([hold(30)])
        delete S.active.layout
        const ref = holdRefOf(act(S, { type: 'startHold', entry: 0, set: 0 }))
        expect(act(S, { type: 'completeHold', ref, elapsed: 22 }).ok).toBe(true)
      })
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
