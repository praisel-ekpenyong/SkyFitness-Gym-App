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
    const feb = monthRecap(workouts, 'kg', '2026-02')
    expect(feb.workouts).toBe(2)
    expect(feb.sets).toBe(3)
    expect(feb.vol).toBe(100 * 5 + 100 * 5 + 120 * 3)
    expect(feb.durationMs).toBe((460000 - 1000) + 30 * 60000)
    expect(feb.prs).toEqual(['bench'])
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
    const feb = monthRecap(workouts, 'kg', '2026-02')
    expect(feb.workouts).toBe(1)
    expect(feb.prev.workouts).toBe(2)
    expect(feb.deltas.workouts).toBeCloseTo(-50)
    expect(feb.deltas.vol).toBeCloseTo(0)
  })

  it('empty-viewed-month suppression', () => {
    const workouts = [
      mkWorkout({ d: '2026-02-10', start: 1000, end: 61000, entries: [mkEntry('bench', [s(100, 5)])] }),
    ]
    const mar = monthRecap(workouts, 'kg', '2026-03')
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
    const mar = monthRecap(workouts, 'kg', '2026-03')
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
          s(50, 10, true, { warmup: true }),
          s(100, 5),
        ])],
      }),
    ]
    const feb = monthRecap(workouts, 'kg', '2026-02')
    expect(feb.vol).toBe(500)
    expect(feb.sets).toBe(1)
  })

  it('e1RM attribution respects workout order across months', () => {
    const workouts = [
      mkWorkout({ d: '2026-01-15', start: 1000, entries: [mkEntry('bench', [s(80, 5)])] }),
      mkWorkout({ d: '2026-02-02', start: 2000, entries: [mkEntry('bench', [s(90, 5)])] }),
      mkWorkout({ d: '2026-02-10', start: 3000, entries: [mkEntry('bench', [s(85, 5)])] }),
      mkWorkout({ d: '2026-03-01', start: 4000, entries: [mkEntry('bench', [s(95, 5)])] }),
    ]
    const jan = monthRecap(workouts, 'kg', '2026-01')
    const feb = monthRecap(workouts, 'kg', '2026-02')
    const mar = monthRecap(workouts, 'kg', '2026-03')

    expect(jan.e1prs.length).toBe(1)
    expect(jan.e1prs[0].id).toBe('bench')
    expect(jan.e1prs[0].est).toBeCloseTo(93.3, 1)

    expect(feb.e1prs.length).toBe(1)
    expect(feb.e1prs[0].w).toBe(90)
    expect(feb.e1prs[0].r).toBe(5)

    expect(mar.e1prs.length).toBe(1)
    expect(mar.e1prs[0].w).toBe(95)

    expect(jan.e1prs.some(p => p.w === 90)).toBe(false)
    expect(feb.e1prs.some(p => p.w === 80)).toBe(false)
  })

  it('respects local date d not start timestamp', () => {
    const w1 = mkWorkout({ d: '2026-02-28', start: 5000, entries: [mkEntry('bench', [s(80, 5)])] })
    const w2 = mkWorkout({ d: '2026-03-01', start: 1000, entries: [mkEntry('bench', [s(85, 5)])] })
    const workouts = [w2, w1]
    const feb = monthRecap(workouts, 'kg', '2026-02')
    const mar = monthRecap(workouts, 'kg', '2026-03')
    expect(feb.e1prs.length).toBe(1)
    expect(feb.e1prs[0].w).toBe(80)
    expect(mar.e1prs.length).toBe(1)
    expect(mar.e1prs[0].w).toBe(85)
  })

  it('caps e1RM at REP_CAP 12', () => {
    const workouts = [
      mkWorkout({ d: '2026-02-10', start: 1000, entries: [mkEntry('bench', [s(50, 13)])] }),
      mkWorkout({ d: '2026-02-11', start: 2000, entries: [mkEntry('bench', [s(50, 12)])] }),
    ]
    const feb = monthRecap(workouts, 'kg', '2026-02')
    expect(feb.e1prs.length).toBe(1)
    expect(feb.e1prs[0].r).toBe(12)
  })

  it('ignores imported workouts lacking start/end for duration', () => {
    const workouts = [
      mkWorkout({ d: '2026-02-10', start: null, end: null, entries: [mkEntry('bench', [s(100, 5)])] }),
      mkWorkout({ d: '2026-02-11', start: 1000, end: 61000, entries: [mkEntry('bench', [s(100, 5)])] }),
    ]
    const feb = monthRecap(workouts, 'kg', '2026-02')
    expect(feb.workouts).toBe(2)
    expect(feb.vol).toBe(1000)
    expect(feb.durationMs).toBe(60000)
  })

  it('deduplicates PRs across multiple workouts in the same month', () => {
    const workouts = [
      mkWorkout({ d: '2026-02-05', start: 1000, entries: [mkEntry('bench', [s(100, 5)])], prs: ['bench'] }),
      mkWorkout({ d: '2026-02-15', start: 2000, entries: [mkEntry('bench', [s(105, 5)])], prs: ['bench'] }),
      mkWorkout({ d: '2026-02-20', start: 3000, entries: [mkEntry('squat', [s(120, 5)])], prs: ['squat'] }),
    ]
    const feb = monthRecap(workouts, 'kg', '2026-02')
    expect(feb.prs).toEqual(['bench', 'squat'])
  })
})
