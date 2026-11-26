import { describe, it, expect } from 'vitest'
import { best, best1RM, e1rmByWorkout, e1rmRecords, e1rmSeries, metric, records, tonnage, lastSession, lastSessionInRoutine, latestWorkSetAt, lastWorkoutInRoutine } from './training-log.js'
import { isoOf } from './dates.js'

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
      { phase: 'warmup', done: true, w: 130 },
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

describe('Training log: chart metric', () => {
  const score = (entry, unit = 'kg', workoutUnit) => {
    const workout = day('2026-11-01', [entry], workoutUnit)
    return metric({ unit }, workout, entry)
  }

  it('scores a reps Entry as the heaviest performed reps Work set, in the Profile unit', () => {
    const entry = lift([work(80), work(100.06), { w: 120, r: 3, done: false }])
    expect(score(entry)).toBe(100.1)
    expect(score(lift([{ ...work(200), unit: 'lb' }]))).toBe(90.7)
    expect(score(lift([{ ...work(200), unit: 'lb' }]), 'lb')).toBe(200)
  })

  it('leaves the stored Set unchanged when the Profile unit changes', () => {
    const set = { ...work(200), unit: 'lb' }
    const entry = lift([set])
    expect(score(entry, 'kg')).toBe(90.7)
    expect(score(entry, 'lb')).toBe(200)
    expect(set).toEqual({ w: 200, r: 5, done: true, unit: 'lb' })
  })

  it('leaves warm-ups and unchecked Sets out of a reps score', () => {
    const entry = lift([
      { phase: 'warmup', w: 140, r: 5, done: true },
      { phase: 'warmup', w: 130, r: 5, done: true },
      { w: 120, r: 5, done: false },
      work(80),
      work(100),
    ])
    expect(score(entry)).toBe(100)
  })

  it('scores a hold as seconds and ignores a heavier bar and a legacy top weight', () => {
    const entry = {
      id: 'hold', target: { mode: 'time' }, topW: 200, sets: [
        { phase: 'warmup', sec: 30, w: 30, done: true },
        { phase: 'work', sec: 60, w: 20, done: true },
        { phase: 'work', sec: 75, w: 25, done: true },
        { phase: 'work', sec: 90, w: 40, done: false },
      ],
    }
    expect(score(entry)).toBe(75)
  })

  it('scores cardio as the greatest performed speed', () => {
    const entry = {
      id: 'run', target: { mode: 'cardio' }, sets: [
        { phase: 'warmup', min: 5, speed: 20, done: true },
        { min: 10, speed: 8, done: true },
        { min: 20, speed: 12.04, done: true },
        { min: 5, speed: 15, done: false },
      ],
    }
    expect(score(entry)).toBe(12)
  })

  it('lets a legacy top weight raise a plain reps Entry when it is heavier', () => {
    const entry = lift([work(80)], { topW: 220, unit: 'lb', target: { mode: 'reps' } })
    const set = { ...work(80), unit: 'kg' }
    const mixed = lift([set], { topW: 220, unit: 'lb', target: { mode: 'reps' } })
    expect(score(entry, 'kg', 'lb')).toBe(99.8)
    expect(score(mixed)).toBe(99.8)
    expect(score(lift([work(80)], { topW: 70, target: { mode: 'reps' } }))).toBe(80)
  })

  it('keeps a legacy top weight off a reps Entry that has a warm-up or a non-reps Work set', () => {
    const warmed = lift([
      { phase: 'warmup', w: 40, r: 5, done: true },
      work(80),
    ], { topW: 200, target: { mode: 'reps' } })
    const mixed = lift([
      work(40, 8),
      { sec: 30, w: 90, done: true },
    ], { topW: 200 })
    const held = lift([work(40, 8), { sec: 30, w: 90, done: true }])
    expect(score(warmed)).toBe(80)
    expect(score(mixed)).toBe(40)
    expect(score(held)).toBe(40)
    expect(best({ unit: 'kg', workouts: [day('2026-11-01', [held])] }, 'bench')).toBe(90)
  })

  it('is 0 when the Entry performed nothing in its Mode, including a top weight with no Set', () => {
    expect(score(lift([{ w: 100, r: 5, done: false }], { topW: 120, target: { mode: 'reps' } }))).toBe(0)
    expect(score(lift([{ phase: 'warmup', w: 100, r: 5, done: true }], { topW: 120 }))).toBe(0)
    expect(score(lift([], { topW: 120, target: { mode: 'reps' } }))).toBe(0)
    expect(score({ id: 'hold', target: { mode: 'time' }, sets: [{ sec: 90, done: false }] })).toBe(0)
    expect(metric({ unit: 'kg' }, day('2026-11-01', []), null)).toBe(0)
  })
})

const seriesLog = {
  unit: 'kg',
  workouts: [
    { d: '2026-01-01', start: 1, entries: [{ id: 'bench', sets: [{ w: 80, r: 5, done: true }] }] },
    { d: '2026-01-08', start: 2, entries: [{ id: 'squat', sets: [{ w: 100, r: 5, done: true }] }] },
    { d: '2026-01-15', start: 3, entries: [{ id: 'bench', sets: [{ w: 90, r: 5, done: true }, { w: 90, r: 3, done: false }] }] },
    { d: '2026-01-22', start: 4, entries: [{ id: 'bench', sets: [{ w: 85, r: 5, done: true }] }] },
    { d: '2026-01-29', start: 5, entries: [{ id: 'run', sets: [{ min: 30, speed: 10, done: true }] }] },
  ],
}

describe('Training log: Estimated 1RM series', () => {
  it('yields one point per Workout that produced an estimate, in Workout order', () => {
    const pts = e1rmSeries(seriesLog, 'bench')
    expect(pts).toEqual([
      { t: 1, d: '2026-01-01', y: 93.3, w: 80, r: 5 },
      { t: 3, d: '2026-01-15', y: 105, w: 90, r: 5 },
      { t: 4, d: '2026-01-22', y: 99.2, w: 85, r: 5 },
    ])
    const later = { d: '2026-01-08', start: 2, entries: [lift([work(90)])] }
    const earlier = { d: '2026-01-01', start: 1, entries: [lift([work(80)])] }
    expect(e1rmSeries({ unit: 'kg', workouts: [later, earlier] }, 'bench').map(p => p.d))
      .toEqual(['2026-01-08', '2026-01-01'])
  })

  it('reports the standing best as the greatest estimate, and a tie keeps the earlier point', () => {
    expect(best1RM(seriesLog, 'bench')).toEqual({ est: 105, w: 90, r: 5, d: '2026-01-15', t: 3 })
    const tied = {
      unit: 'kg',
      workouts: [
        { d: '2026-01-01', start: 1, entries: [lift([work(100)])] },
        { d: '2026-01-08', start: 2, entries: [lift([work(100)])] },
      ],
    }
    expect(best1RM(tied, 'bench')).toEqual({ est: 116.7, w: 100, r: 5, d: '2026-01-01', t: 1 })
  })

  it('picks the Set with the highest estimate, not the heaviest Set', () => {
    const workout = {
      d: '2026-01-01', start: 1,
      entries: [lift([work(100, 5), work(110, 3), work(120, 1)])],
    }
    expect(e1rmSeries({ unit: 'kg', workouts: [workout] }, 'bench')).toEqual([
      { t: 1, d: '2026-01-01', y: 121, w: 110, r: 3 },
    ])
  })

  it('ignores an unchecked Set, a warm-up, and a legacy top weight', () => {
    const workout = {
      d: '2026-01-01', start: 1,
      entries: [{
        id: 'bench', topW: 200, sets: [
          { w: 20, r: 8, done: true, phase: 'warmup' },
          { w: 100, r: 5, done: true },
          { w: 200, r: 5, done: false },
        ],
      }],
    }
    expect(e1rmSeries({ unit: 'kg', workouts: [workout] }, 'bench')).toEqual([
      { t: 1, d: '2026-01-01', y: 116.7, w: 100, r: 5 },
    ])
  })

  it('has nothing to say about a hold, cardio, or an exercise that was never estimated', () => {
    expect(e1rmSeries(seriesLog, 'run')).toEqual([])
    expect(best1RM(seriesLog, 'run')).toBeNull()
    const hold = { d: '2026-01-01', start: 1, entries: [{ id: 'plank', sets: [{ sec: 60, w: 20, done: true }] }] }
    expect(e1rmSeries({ unit: 'kg', workouts: [hold] }, 'plank')).toEqual([])
    expect(best1RM(seriesLog, 'nope')).toBeNull()
    expect(best1RM({ workouts: [] }, 'bench')).toBeNull()
    expect(best1RM({}, 'bench')).toBeNull()
  })

  it('reads a kg/lb history in the Profile unit, and again after the Profile switches', () => {
    const workouts = [
      { d: '2025-10-01', start: 1, unit: 'lb', entries: [{ id: 'bench', sets: [{ w: 150, r: 5, done: true }] }] },
      { d: '2026-01-15', start: 2, unit: 'kg', entries: [{ id: 'bench', sets: [{ w: 100, r: 5, done: true }] }] },
    ]
    const kg = e1rmSeries({ unit: 'kg', workouts }, 'bench')
    expect(kg.map(p => p.y)).toEqual([79.3, 116.7])
    expect(best1RM({ unit: 'kg', workouts }, 'bench')).toEqual({ est: 116.7, w: 100, r: 5, d: '2026-01-15', t: 2 })
    const lb = e1rmSeries({ unit: 'lb', workouts }, 'bench')
    expect(lb.map(p => p.y)).toEqual([175, 257.3])
    expect(best1RM({ unit: 'lb', workouts }, 'bench')).toEqual({ est: 257.3, w: 220.5, r: 5, d: '2026-01-15', t: 2 })
    expect(workouts[0].entries[0].sets[0].w).toBe(150)
  })

  it('picks the heavier physical Set when one is stored in pounds and one in kilograms', () => {
    const workout = {
      d: '2026-01-01', start: 1,
      entries: [lift([
        { w: 200, r: 5, done: true, unit: 'lb' },
        { w: 100, r: 5, done: true, unit: 'kg' },
      ])],
    }
    expect(best1RM({ unit: 'kg', workouts: [workout] }, 'bench')).toMatchObject({ est: 116.7, w: 100, r: 5 })
    expect(best1RM({ unit: 'lb', workouts: [workout] }, 'bench')).toMatchObject({ est: 257.3, w: 220.5, r: 5 })
  })

  it('keeps one point when a Workout logs the exercise twice, matching that Workout\'s Estimated 1RM Record', () => {
    const first = day('2026-11-01', [lift([work(100, 3)])])
    first.start = 1
    const second = day('2026-11-08', [lift([work(90, 5)]), lift([work(95, 8)])])
    second.start = 2
    const profile = { unit: 'kg', workouts: [first, second] }
    const pts = e1rmSeries(profile, 'bench')
    expect(pts).toHaveLength(2)
    expect(pts[1]).toEqual({ t: 2, d: '2026-11-08', y: 120.3, w: 95, r: 8 })
    expect(e1rmRecords(profile, second)).toEqual([{ id: 'bench', est: 120.3, w: 95, r: 8, prev: 110 }])
  })

  it('shows an estimate for a first performed session, which is not a Record', () => {
    const first = seriesLog.workouts[0]
    expect(e1rmSeries({ unit: 'kg', workouts: [first] }, 'bench')).toHaveLength(1)
    expect(records({ unit: 'kg', workouts: [first] }, first)).toEqual([])
  })

  it('gives each series point with the Workout it comes from', () => {
    const byWorkout = e1rmByWorkout(seriesLog, 'bench')
    expect(byWorkout.map(({ workout, ...point }) => point)).toEqual(e1rmSeries(seriesLog, 'bench'))
    expect(byWorkout.map(p => p.workout)).toEqual([0, 2, 3].map(i => seriesLog.workouts[i]))
    expect(byWorkout[0].workout).toBe(seriesLog.workouts[0])
    expect(e1rmByWorkout(seriesLog, 'run')).toEqual([])
  })

  it('drops a deleted Workout from the series and from the standing best', () => {
    const keep = seriesLog.workouts[0]
    const drop = seriesLog.workouts[2]
    expect(best1RM({ unit: 'kg', workouts: [keep, drop] }, 'bench').est).toBe(105)
    expect(e1rmSeries({ unit: 'kg', workouts: [keep] }, 'bench')).toEqual([
      { t: 1, d: '2026-01-01', y: 93.3, w: 80, r: 5 },
    ])
    expect(best1RM({ unit: 'kg', workouts: [keep] }, 'bench').est).toBe(93.3)
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

  it('leaves a performed warm-up Set out', () => {
    const w = day('2026-11-01', [lift([
      { phase: 'warmup', w: 20, r: 5, done: true },
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

  it('reads sets and the Target in the Profile unit after a switch (ADR 0031)', () => {
    const workouts = [at('2026-11-08', [lift([work(100), { ...work(135), unit: 'lb' }], { target: { reps: 5, weight: 100, inc: 2.5 } })], { unit: 'kg' })]
    expect(lastSession({ unit: 'lb', workouts }, 'bench')).toEqual({
      d: '2026-11-08',
      sets: [work(220.5), { ...work(135), unit: 'lb' }],
      target: { reps: 5, weight: 220.5, inc: 5 },
    })
    expect(lastSessionInRoutine({ unit: 'lb', workouts }, 'bench', null).sets[0].w).toBe(220.5)
  })

  it('returns the stored sets themselves when they are already in the Profile unit', () => {
    const sets = [work(100)]
    const S = { unit: 'kg', workouts: [at('2026-11-08', [lift(sets)], { unit: 'kg' })] }
    expect(lastSession(S, 'bench').sets[0]).toBe(sets[0])
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
    const origTZ = process.env.TZ
    try {
      process.env.TZ = 'America/Los_Angeles'
      const S = { unit: 'kg', workouts: [{ d: '2026-11-01', entries: [lift([work(60)])] }] }
      expect(latestWorkSetAt(S, 'bench')).toBe(new Date('2026-11-01T12:00:00').getTime())
      expect(latestWorkSetAt(S, 'bench')).not.toBe(Date.UTC(2026, 10, 1, 0, 0, 0))
      expect(latestWorkSetAt(S, 'squat')).toBe(null)
      expect(latestWorkSetAt({ unit: 'kg', workouts: [] }, 'bench')).toBe(null)
    } finally {
      if (origTZ === undefined) delete process.env.TZ
      else process.env.TZ = origTZ
    }
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

  it.each([false, true])('ranks the later date first even when its start stamp is earlier (log reversed: %s)', reversed => {
    const edited = { d: '2026-11-09', start: 1000, routineId: 'push', entries: [lift([work(70)])], note: 'date edited forward' }
    const earlier = { d: '2026-11-08', start: 2000, routineId: 'push', entries: [lift([work(60)])] }
    const S = { unit: 'kg', workouts: reversed ? [edited, earlier] : [earlier, edited] }
    expect(lastWorkoutInRoutine(S, 'push').note).toBe('date edited forward')
    expect(lastSession(S, 'bench').sets.map(s => s.w)).toEqual([70])
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
      id: `w${i}`, d: isoOf(new Date(2020, 0, 1 + i)), start: 1,
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
