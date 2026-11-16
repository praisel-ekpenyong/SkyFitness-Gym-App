import { describe, it, expect } from 'vitest'
import { best, records } from './training-log.js'

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
