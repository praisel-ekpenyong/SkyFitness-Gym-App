import { describe, it, expect } from 'vitest'
import { best, tonnage } from './training-log.js'

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
