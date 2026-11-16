import { describe, it, expect } from 'vitest'
import { best, lastSession, lastSessionInRoutine, latestWorkSetAt, lastWorkoutInRoutine } from './training-log.js'

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
