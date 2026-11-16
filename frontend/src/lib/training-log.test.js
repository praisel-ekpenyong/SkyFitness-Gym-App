import { describe, it, expect } from 'vitest'
import { best, records, tonnage, lastSession, lastSessionInRoutine, latestWorkSetAt, lastWorkoutInRoutine } from './training-log.js'

const lift = (sets, extra = {}) => ({ id: 'bench', sets, ...extra })
const day = (d, entries, unit) => ({ d, entries, ...(unit ? { unit } : {}) })
const work = (w, r = 5) => ({ w, r, done: true })

describe('Training log: Best', () => {
  it('reads a kg/lb mixed history in the Profile unit, whichever unit it is', () => {
    const workouts = [
      day('2026-11-01', [lift([work(100)])], 'kg'),
      day('2026-11-08', [lift([work(200)])], 'lb'),
    ]
    expect(best({ unit: 'kg', workouts }, 'bench')).toBe(100)
    expect(best({ unit: 'lb', workouts }, 'bench')).toBe(220.5)
  })

  it('honours a unit stamped on the Set or Entry over the Workout', () => {
    const workouts = [day('2026-11-01', [lift([{ ...work(200), unit: 'lb' }])], 'kg')]
    expect(best({ unit: 'kg', workouts }, 'bench')).toBe(90.7)
  })

  it('falls back to 0 for an exercise with no performed Work set', () => {
    expect(best({ unit: 'kg', workouts: [] }, 'bench')).toBe(0)
    expect(best({ unit: 'kg', workouts: [day('2026-11-01', [lift([work(50)])])] }, 'squat')).toBe(0)
  })

  it('drops the typo Workout from Best when it is deleted', () => {
    const typo = day('2026-11-08', [lift([work(250)])])
    const real = day('2026-11-01', [lift([work(100)])])
    expect(best({ unit: 'kg', workouts: [real, typo] }, 'bench')).toBe(250)
    expect(best({ unit: 'kg', workouts: [real] }, 'bench')).toBe(100)
  })

  it('ignores warm-up and unperformed Sets, and a legacy top weight beside a warm-up', () => {
    const S = { unit: 'kg', workouts: [day('2026-11-01', [lift([
      { phase: 'warmup', done: true, w: 120 },
      { warmup: true, done: true, w: 130 },
      { phase: 'work', done: true, w: 80 },
      { phase: 'work', done: false, w: 100 },
    ], { topW: 120 })])] }
    expect(best(S, 'bench')).toBe(80)
    expect(best({ unit: 'kg', workouts: [day('2026-11-01', [lift([{ phase: 'warmup', done: true, w: 120 }])])] }, 'bench')).toBe(0)
  })

  it('counts the legacy top weight of a Workout saved before ADR 0020, in its own unit', () => {
    const workouts = [day('2026-10-01', [lift([work(80)], { topW: 220, unit: 'lb', target: { mode: 'reps' } })])]
    expect(best({ unit: 'kg', workouts }, 'bench')).toBe(99.8)
    expect(best({ unit: 'kg', workouts: [day('2026-10-01', [lift([work(80)], { topW: 70 })])] }, 'bench')).toBe(80)
  })

  it('keeps the Best of a deleted custom exercise from the Workouts that used it', () => {
    const S = { unit: 'kg', customEx: [], workouts: [day('2026-11-01', [{ id: 'c_gone', sets: [work(60)] }])] }
    expect(best(S, 'c_gone')).toBe(60)
  })

  it('never reads the remembered heaviest-weight cache', () => {
    const S = { unit: 'kg', exWeights: { bench: { w: 250, unit: 'kg' } }, workouts: [day('2026-11-01', [lift([work(100)])])] }
    expect(best(S, 'bench')).toBe(100)
  })

  it('sees a new Workouts array, not a stale answer', () => {
    const S = { unit: 'kg', workouts: [day('2026-11-01', [lift([work(100)])])] }
    expect(best(S, 'bench')).toBe(100)
    S.workouts = [...S.workouts, day('2026-11-08', [lift([work(110)])])]
    expect(best(S, 'bench')).toBe(110)
  })
})

describe('Training log: Records', () => {
  const S = (workouts, unit = 'kg') => ({ unit, workouts })
  const ids = (S_, w, kind) => records(S_, w).filter(r => !kind || r.kind === kind).map(r => r.id)

  it('does not read a first performed session as a Record', () => {
    const first = day('2026-11-01', [lift([work(100)])])
    expect(records(S([first]), first)).toEqual([])
  })

  it('reads a Set that beats every earlier Set as a load Record, in the Profile unit', () => {
    const a = day('2026-11-01', [lift([work(100)])])
    const b = day('2026-11-08', [lift([work(105, 3)])])
    const [r] = records(S([a, b]), b)
    expect(r).toMatchObject({ id: 'bench', kind: 'load', w: 105, r: 3, prev: 100 })
    expect(r.set).toBe(b.entries[0].sets[0])
  })

  it('does not read a Set equal to the earlier Best as a load Record', () => {
    const a = day('2026-11-01', [lift([work(100, 5)])])
    const b = day('2026-11-08', [lift([work(100, 5)])])
    expect(records(S([a, b]), b)).toEqual([])
  })

  it('judges an exercise once per Workout, against everything before it', () => {
    const a = day('2026-11-01', [lift([work(100)])])
    const b = day('2026-11-08', [lift([work(105)]), lift([work(110)])])
    const out = records(S([a, b]), b)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'load', w: 110, prev: 100 })
  })

  it('orders two Workouts on one day by start time', () => {
    const early = { ...day('2026-11-08', [lift([work(100)])]), start: 1000 }
    const late = { ...day('2026-11-08', [lift([work(105)])]), start: 2000 }
    const log = S([late, early])
    expect(ids(log, early)).toEqual([])
    expect(ids(log, late)).toEqual(['bench'])
  })

  it('reads a Workout making both kinds as the load Record only', () => {
    const a = day('2026-11-01', [lift([work(100, 5)])])
    const b = day('2026-11-08', [lift([work(110, 5)])])
    expect(records(S([a, b]), b).map(r => r.kind)).toEqual(['load'])
  })

  it('reads an Estimated 1RM Record when only the estimate improves', () => {
    const a = day('2026-11-01', [lift([work(100, 3)])])
    const b = day('2026-11-08', [lift([work(90, 10)])])
    const [r] = records(S([a, b]), b)
    expect(r).toMatchObject({ id: 'bench', kind: 'e1rm', est: 120, w: 90, r: 10, prev: 110 })
  })

  it('makes no Estimated 1RM Record from a Set above 12 reps', () => {
    const a = day('2026-11-01', [lift([work(100, 3)])])
    const b = day('2026-11-08', [lift([work(90, 15)])])
    expect(records(S([a, b]), b)).toEqual([])
  })

  it('never makes a Record from a warm-up or an unperformed Set', () => {
    const a = day('2026-11-01', [lift([work(100)])])
    const b = day('2026-11-08', [lift([{ phase: 'warmup', done: true, w: 200, r: 5 }, { phase: 'work', done: false, w: 150, r: 5 }, work(90)])])
    expect(records(S([a, b]), b)).toEqual([])
  })

  it('judges a kg/lb mixed history in the Profile unit', () => {
    const a = day('2026-11-01', [lift([work(200)])], 'lb')
    const b = day('2026-11-08', [lift([work(95)])], 'kg')
    expect(ids(S([a, b], 'kg'), b)).toEqual(['bench'])
    expect(records(S([a, b], 'lb'), b)[0]).toMatchObject({ w: 209.4, prev: 200 })
  })

  it('reads Records on imported history whose stamped list is empty', () => {
    const a = { ...day('2026-11-01', [lift([work(100)])]), prs: [] }
    const b = { ...day('2026-11-08', [lift([work(105)])]), prs: [] }
    expect(ids(S([a, b]), b)).toEqual(['bench'])
  })

  it('brings back later Records when the typo Workout is deleted', () => {
    const real = day('2026-11-01', [lift([work(100)])])
    const typo = day('2026-11-08', [lift([work(250)])])
    const later = day('2026-11-15', [lift([work(105)])])
    expect(records(S([real, typo, later]), later)).toEqual([])
    expect(ids(S([real, later]), later)).toEqual(['bench'])
  })

  it('judges each exercise on its own and reads a Workout not yet in the log', () => {
    const a = day('2026-11-01', [lift([work(100)]), { id: 'squat', sets: [work(150)] }])
    const unsaved = day('2026-11-08', [lift([work(100)]), { id: 'squat', sets: [work(160)] }])
    expect(ids(S([a]), unsaved)).toEqual(['squat'])
  })
})

describe('Training log: Tonnage', () => {
  it('is load x reps of performed Work sets', () => {
    const w = day('2026-11-01', [lift([work(60, 10), { w: 60, r: 10, done: false }])])
    expect(tonnage({ unit: 'kg', workouts: [w] }, w)).toBe(600)
  })

  it('leaves a performed warm-up Set out, in both warm-up shapes', () => {
    const w = day('2026-11-01', [lift([
      { warmup: true, w: 20, r: 5, done: true },
      { phase: 'warmup', w: 30, r: 5, done: true },
      { phase: 'work', w: 60, r: 5, done: true },
    ])])
    expect(tonnage({ unit: 'kg' }, w)).toBe(300)
  })

  it('answers a lb Workout in a kg Profile and the reverse', () => {
    const lb = day('2026-11-01', [lift([work(100, 5)])], 'lb')
    const kg = day('2026-11-02', [lift([work(50, 10)])], 'kg')
    expect(tonnage({ unit: 'kg' }, lb)).toBe(227)
    expect(tonnage({ unit: 'lb' }, kg)).toBe(1102)
    expect(tonnage({ unit: 'lb' }, lb)).toBe(500)
  })

  it('honours a unit stamped on the Set', () => {
    const w = day('2026-11-01', [lift([{ ...work(100, 5), unit: 'lb' }])], 'kg')
    expect(tonnage({ unit: 'kg' }, w)).toBe(227)
  })

  it('is 0 for nothing performed or no Workout', () => {
    expect(tonnage({ unit: 'kg' }, null)).toBe(0)
    expect(tonnage({ unit: 'kg' }, day('2026-11-01', []))).toBe(0)
  })
})

describe('Training log: last session', () => {
  const at = (d, entries, extra = {}) => ({ d, entries, ...extra })

  it('names the latest Workout holding the exercise, with its performed Work sets', () => {
    const S = { unit: 'kg', workouts: [
      at('2026-11-01', [lift([work(60)], { target: { reps: 5 } })]),
      at('2026-11-08', [lift([{ phase: 'warmup', done: true, w: 20 }, work(70), { ...work(80), done: false }], { target: { reps: 8 } })]),
      at('2026-11-09', [{ id: 'squat', sets: [work(100)] }]),
    ] }
    expect(lastSession(S, 'bench')).toEqual({ d: '2026-11-08', sets: [work(70)], target: { reps: 8 } })
    expect(lastSession(S, 'curl')).toBe(null)
  })

  it('skips a Workout where the exercise has no performed Work set', () => {
    const S = { unit: 'kg', workouts: [
      at('2026-11-01', [lift([work(60)])]),
      at('2026-11-08', [lift([{ ...work(90), done: false }, { phase: 'warmup', done: true, w: 40 }])]),
    ] }
    expect(lastSession(S, 'bench').d).toBe('2026-11-01')
  })

  it('prefers the same Routine, and any Routine is the latest overall', () => {
    const S = { unit: 'kg', workouts: [
      at('2026-11-01', [lift([work(60)])], { routineId: 'push' }),
      at('2026-11-08', [lift([work(70)])], { routineId: 'pull' }),
    ] }
    expect(lastSession(S, 'bench').d).toBe('2026-11-08')
    expect(lastSessionInRoutine(S, 'bench', 'push').d).toBe('2026-11-01')
    expect(lastSessionInRoutine(S, 'bench', 'legs')).toBe(null)
    expect(lastSessionInRoutine(S, 'bench', null).d).toBe('2026-11-08')
  })

  it('orders Workouts on the same day by start time, not array order', () => {
    const S = { unit: 'kg', workouts: [
      at('2026-11-08', [lift([work(80)])], { start: 2000 }),
      at('2026-11-08', [lift([work(60)])], { start: 1000 }),
    ] }
    expect(lastSession(S, 'bench').sets).toEqual([work(80)])
  })

  it('orders by date even when the array is not in date order', () => {
    const S = { unit: 'kg', workouts: [
      at('2026-11-08', [lift([work(80)])]),
      at('2026-11-01', [lift([work(60)])]),
    ] }
    expect(lastSession(S, 'bench').d).toBe('2026-11-08')
  })
})

describe('Training log: latest Work set time', () => {
  it('is the time of the Workout with the latest performed Work set', () => {
    const S = { unit: 'kg', workouts: [
      { d: '2026-11-01', start: 1000, entries: [lift([work(60)])] },
      { d: '2026-11-08', start: 5000, entries: [lift([work(60)])] },
      { d: '2026-11-09', start: 9000, entries: [lift([{ phase: 'warmup', done: true, w: 20 }, { ...work(60), done: false }])] },
    ] }
    expect(latestWorkSetAt(S, 'bench')).toBe(5000)
  })

  it('falls back to the date and answers null when never performed', () => {
    const S = { unit: 'kg', workouts: [{ d: '2026-11-01', entries: [lift([work(60)])] }] }
    expect(latestWorkSetAt(S, 'bench')).toBe(new Date('2026-11-01').getTime())
    expect(latestWorkSetAt(S, 'squat')).toBe(null)
    expect(latestWorkSetAt({ unit: 'kg', workouts: [] }, 'bench')).toBe(null)
  })

  it('breaks a same-day tie by start time', () => {
    const S = { unit: 'kg', workouts: [
      { d: '2026-11-08', start: 2000, entries: [lift([work(60)])] },
      { d: '2026-11-08', start: 1000, entries: [lift([work(60)])] },
    ] }
    expect(latestWorkSetAt(S, 'bench')).toBe(2000)
  })
})

describe('Training log: counts a duplicate entry for the latest Work set time', () => {
  it('counts a Workout when a duplicate entry carries the performed Work set', () => {
    const S = { unit: 'kg', workouts: [{ d: '2026-11-01', start: 1000, entries: [lift([{ ...work(80), done: false }]), lift([work(80)])] }] }
    expect(latestWorkSetAt(S, 'bench')).toBe(1000)
  })
})

describe('Training log: last Workout of a Routine', () => {
  it('is the latest Workout run from the Routine, by date then start time', () => {
    const S = { unit: 'kg', workouts: [
      { d: '2026-11-08', start: 2000, routineId: 'push', entries: [] },
      { d: '2026-11-08', start: 1000, routineId: 'push', entries: [] },
      { d: '2026-11-09', routineId: 'pull', entries: [] },
    ] }
    expect(lastWorkoutInRoutine(S, 'push').start).toBe(2000)
    expect(lastWorkoutInRoutine(S, 'legs')).toBe(null)
  })
})

describe('Training log: an exercise in two Entries of one Workout', () => {
  const S = { unit: 'kg', workouts: [day('2026-11-01', [lift([work(60)]), lift([work(70, 3)])], 'kg')] }

  it('lastSession and latestWorkSetAt agree, collecting performed Work sets across every Entry', () => {
    S.workouts[0].start = 5000
    expect(lastSession(S, 'bench').sets.map(s => s.w)).toEqual([60, 70])
    expect(latestWorkSetAt(S, 'bench')).toBe(5000)
  })

  it('answers from the second Entry when the first holds no performed Work set', () => {
    const T = { unit: 'kg', workouts: [day('2026-11-01', [lift([{ w: 60, r: 5, done: false }]), lift([work(70)])])] }
    expect(lastSession(T, 'bench').sets.map(s => s.w)).toEqual([70])
    expect(latestWorkSetAt(T, 'bench')).not.toBeNull()
  })
})

describe('Training log: Records of a cloned in-log Workout', () => {
  it('keeps the Records of a structurally equal clone of a Workout in the log', () => {
    const workouts = [
      { id: 'a', d: '2026-11-01', entries: [lift([work(100)])] },
      { id: 'b', d: '2026-11-01', entries: [lift([work(120)])] },
      { id: 'c', d: '2026-11-08', entries: [lift([work(90)])] },
    ]
    const S = { unit: 'kg', workouts }
    const expected = records(S, workouts[1])
    expect(expected.map(r => r.id)).toEqual(['bench'])
    expect(records(S, JSON.parse(JSON.stringify(workouts[1])))).toEqual(JSON.parse(JSON.stringify(expected)))
  })
})

describe('Training log: Records over a large history', () => {
  it('reads Records for every Workout of a 2000-Workout history quickly', () => {
    const workouts = Array.from({ length: 2000 }, (_, i) => ({
      id: `w${i}`, d: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10), start: 1,
      entries: ['bench', 'squat', 'row'].map(id => ({ id, sets: [work(50 + (i % 7) * 5 + Math.floor(i / 100))] })),
    }))
    const S = { unit: 'kg', workouts }
    const t0 = performance.now()
    const total = workouts.reduce((n, w) => n + records(S, w).length, 0)
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(total).toBeGreaterThan(0)
    expect(records(S, workouts[0])).toEqual([])
  })
})
