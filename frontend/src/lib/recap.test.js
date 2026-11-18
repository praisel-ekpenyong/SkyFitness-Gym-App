import { describe, it, expect } from 'vitest'
import { monthRecap } from './recap.js'

function mkWorkout({ d, start, end, entries = [], prs = [] }) {
  return { id: `w-${d}-${start}`, d, start, end, entries, prs }
}
function mkEntry(id, sets) {
  return { id, sets }
}
function s(w, r, done = true, extra = {}) {
  return { w, r, done, ...extra }
}

describe('monthRecap', () => {
  it('computes vol, sets, workouts, duration for a month', () => {
    const workouts = [
      mkWorkout({
        d: '2026-02-05', start: 1000, end: 460000,
        entries: [mkEntry('bench', [s(100, 5), s(100, 5)])],
        prs: ['bench'],
      }),
      mkWorkout({
        d: '2026-02-20', start: 2000, end: 2000 + 30 * 60000,
        entries: [mkEntry('squat', [s(120, 3)])],
        prs: [],
      }),
      mkWorkout({
        d: '2026-03-10', start: 3000, end: 3000 + 20 * 60000,
        entries: [mkEntry('bench', [s(110, 5)])],
        prs: ['bench'],
      }),
    ]
    const feb = monthRecap({ unit: 'kg', workouts }, '2026-02')
    expect(feb.workouts).toBe(2)
    expect(feb.sets).toBe(3)
    expect(feb.vol).toBe(100 * 5 + 100 * 5 + 120 * 3)
    expect(feb.durationMs).toBe((460000 - 1000) + 30 * 60000)
    expect(feb.prs).toEqual([])
    expect(monthRecap({ unit: 'kg', workouts }, '2026-03').prs).toEqual(['bench'])
    expect(feb.prev.workouts).toBe(0)
    expect(feb.deltas.workouts).toBe(2)
    expect(feb.deltas.vol).toBe(feb.vol)
  })

  it('both-months-present percent delta', () => {
    const workouts = [
      mkWorkout({ d: '2026-01-10', start: 1000, end: 61000, entries: [mkEntry('bench', [s(100, 5)])] }),
      mkWorkout({ d: '2026-01-20', start: 2000, end: 62000, entries: [mkEntry('bench', [s(100, 5)])] }),
      mkWorkout({ d: '2026-02-10', start: 3000, end: 63000, entries: [mkEntry('bench', [s(100, 10)])] }),
    ]
    const feb = monthRecap({ unit: 'kg', workouts }, '2026-02')
    expect(feb.workouts).toBe(1)
    expect(feb.prev.workouts).toBe(2)
    expect(feb.deltas.workouts).toBeCloseTo(-50)
    expect(feb.deltas.vol).toBeCloseTo(0)
  })

  it('empty-viewed-month suppression', () => {
    const workouts = [
      mkWorkout({ d: '2026-02-10', start: 1000, end: 61000, entries: [mkEntry('bench', [s(100, 5)])] }),
    ]
    const mar = monthRecap({ unit: 'kg', workouts }, '2026-03')
    expect(mar.workouts).toBe(0)
    expect(mar.vol).toBe(0)
    expect(mar.sets).toBe(0)
    expect(mar.durationMs).toBe(0)
    expect(mar.prs).toEqual([])
    expect(mar.e1prs).toEqual([])
    expect(mar.prev.workouts).toBe(1)
    expect(mar.deltas.vol).toBeNull()
    expect(mar.deltas.workouts).toBeNull()
    expect(mar.deltas.sets).toBeNull()
    expect(mar.deltas.durationMs).toBeNull()
  })

  it('empty-previous absolute', () => {
    const workouts = [
      mkWorkout({ d: '2026-03-10', start: 1000, end: 1000 + 10 * 60000, entries: [mkEntry('bench', [s(80, 5)])] }),
    ]
    const mar = monthRecap({ unit: 'kg', workouts }, '2026-03')
    expect(mar.workouts).toBe(1)
    expect(mar.prev.workouts).toBe(0)
    expect(mar.deltas.workouts).toBe(1)
    expect(mar.deltas.vol).toBe(400)
    expect(mar.deltas.sets).toBe(1)
  })

  it('excludes warm-up sets from vol and sets', () => {
    const workouts = [
      mkWorkout({
        d: '2026-02-10', start: 1000, end: 61000,
        entries: [mkEntry('bench', [
          s(50, 10, true, { phase: 'warmup' }),
          s(100, 5),
        ])],
      }),
    ]
    const feb = monthRecap({ unit: 'kg', workouts }, '2026-02')
    expect(feb.vol).toBe(500)
    expect(feb.sets).toBe(1)
  })

  it('ignores imported workouts lacking start/end for duration', () => {
    const workouts = [
      mkWorkout({ d: '2026-02-10', start: null, end: null, entries: [mkEntry('bench', [s(100, 5)])] }),
      mkWorkout({ d: '2026-02-11', start: 1000, end: 61000, entries: [mkEntry('bench', [s(100, 5)])] }),
    ]
    const feb = monthRecap({ unit: 'kg', workouts }, '2026-02')
    expect(feb.workouts).toBe(2)
    expect(feb.vol).toBe(1000)
    expect(feb.durationMs).toBe(60000)
  })

  it('reads Records and Estimated 1RM Records from the log, not from the stamped list', () => {
    const workouts = [
      mkWorkout({ d: '2026-01-10', start: 1000, entries: [mkEntry('bench', [s(100, 3)])] }),
      mkWorkout({ d: '2026-02-10', start: 2000, entries: [mkEntry('bench', [s(90, 10)])], prs: ['squat'] }),
    ]
    const feb = monthRecap({ unit: 'kg', workouts }, '2026-02')
    expect(feb.prs).toEqual([])
    expect(feb.e1prs).toEqual([{ id: 'bench', est: 120, w: 90, r: 10, d: '2026-02-10', t: 2000, prev: 110 }])
    expect(monthRecap({ unit: 'kg', workouts }, '2026-01').prev.e1prs).toEqual([])
  })

  it('deduplicates PRs across multiple workouts in the same month', () => {
    const workouts = [
      mkWorkout({ d: '2026-01-05', start: 500, entries: [mkEntry('bench', [s(90, 5)]), mkEntry('squat', [s(100, 5)])] }),
      mkWorkout({ d: '2026-02-05', start: 1000, entries: [mkEntry('bench', [s(100, 5)])] }),
      mkWorkout({ d: '2026-02-15', start: 2000, entries: [mkEntry('bench', [s(105, 5)])] }),
      mkWorkout({ d: '2026-02-20', start: 3000, entries: [mkEntry('squat', [s(120, 5)])] }),
    ]
    const feb = monthRecap({ unit: 'kg', workouts }, '2026-02')
    expect(feb.prs).toEqual(['bench', 'squat'])
  })
})
