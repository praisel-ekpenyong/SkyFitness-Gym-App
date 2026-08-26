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
    expect(feb.vol).toBe(100 * 5 + 100 * 5 + 120 * 3) // 1360
    expect(feb.durationMs).toBe((460000 - 1000) + 30 * 60000)
    expect(feb.prs).toEqual(['bench'])
    expect(feb.prev.workouts).toBe(0)
    // prev empty => absolute delta equals current
    expect(feb.deltas.workouts).toBe(2)
    expect(feb.deltas.vol).toBe(feb.vol)
  })

  it('both-months-present percent delta', () => {
    const workouts = [
      mkWorkout({ d: '2026-01-10', start: 1000, end: 61000, entries: [mkEntry('bench', [s(100, 5)])] }),
      mkWorkout({ d: '2026-01-20', start: 2000, end: 62000, entries: [mkEntry('bench', [s(100, 5)])] }),
      mkWorkout({ d: '2026-02-10', start: 3000, end: 63000, entries: [mkEntry('bench', [s(100, 10)])] }),
    ]
    // Jan: 2 workouts, vol 1000, sets 2
    // Feb: 1 workout, vol 1000, sets 1
    const feb = monthRecap(workouts, 'kg', '2026-02')
    expect(feb.workouts).toBe(1)
    expect(feb.prev.workouts).toBe(2)
    expect(feb.deltas.workouts).toBeCloseTo(-50) // (1-2)/2*100
    expect(feb.deltas.vol).toBeCloseTo(0) // same vol but different sets? Jan vol 1000, Feb vol 1000 => 0%
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
    // absolute delta == current value
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
    expect(feb.vol).toBe(500) // only 100*5, not 50*10
    expect(feb.sets).toBe(1)
  })

  it('e1RM attribution respects workout order across months', () => {
    // Jan 15: 80x5 => 93.3 ; Feb 02: 90x5 =>105 record in Feb; Jan recap should not contain Feb record
    // Also test that Feb 10 with 85x5 not a record, Mar record 95x5 =>110.8
    const workouts = [
      mkWorkout({ d: '2026-01-15', start: 1000, entries: [mkEntry('bench', [s(80, 5)])] }),
      mkWorkout({ d: '2026-02-02', start: 2000, entries: [mkEntry('bench', [s(90, 5)])] }),
      mkWorkout({ d: '2026-02-10', start: 3000, entries: [mkEntry('bench', [s(85, 5)])] }),
      mkWorkout({ d: '2026-03-01', start: 4000, entries: [mkEntry('bench', [s(95, 5)])] }),
    ]
    const jan = monthRecap(workouts, 'kg', '2026-01')
    const feb = monthRecap(workouts, 'kg', '2026-02')
    const mar = monthRecap(workouts, 'kg', '2026-03')

    // Jan first ever estimate is record
    expect(jan.e1prs.length).toBe(1)
    expect(jan.e1prs[0].id).toBe('bench')
    expect(jan.e1prs[0].est).toBeCloseTo(93.3, 1)

    // Feb should have exactly the 90x5 improvement
    expect(feb.e1prs.length).toBe(1)
    expect(feb.e1prs[0].w).toBe(90)
    expect(feb.e1prs[0].r).toBe(5)

    // Mar should have the 95x5
    expect(mar.e1prs.length).toBe(1)
    expect(mar.e1prs[0].w).toBe(95)

    // Ensure Jan does NOT contain Feb record
    expect(jan.e1prs.some(p => p.w === 90)).toBe(false)
    expect(feb.e1prs.some(p => p.w === 80)).toBe(false)
  })

  it('respects local date d not start timestamp', () => {
    // Two workouts: one with d 2026-02-28 but start in March timestamp, another with d 2026-03-01 but earlier timestamp
    // Chronological order should follow d, so Feb record then Mar record correctly attributed.
    // Create w1: d Feb 28, start 5000 ; w2: d Mar 01, start 1000 (earlier start but later date)
    // If sorted by start, w2 would be before w1 and attribution wrong
    const w1 = mkWorkout({ d: '2026-02-28', start: 5000, entries: [mkEntry('bench', [s(80, 5)])] })
    const w2 = mkWorkout({ d: '2026-03-01', start: 1000, entries: [mkEntry('bench', [s(85, 5)])] })
    const workouts = [w2, w1] // intentionally out of order in array
    const feb = monthRecap(workouts, 'kg', '2026-02')
    const mar = monthRecap(workouts, 'kg', '2026-03')
    // With d-sorted, Feb gets first record 80x5, Mar gets 85x5
    expect(feb.e1prs.length).toBe(1)
    expect(feb.e1prs[0].w).toBe(80)
    expect(mar.e1prs.length).toBe(1)
    expect(mar.e1prs[0].w).toBe(85)
  })

  it('caps e1RM at REP_CAP 12', () => {
    const workouts = [
      mkWorkout({ d: '2026-02-10', start: 1000, entries: [mkEntry('bench', [s(50, 13)])] }), // 13 reps => no estimate
      mkWorkout({ d: '2026-02-11', start: 2000, entries: [mkEntry('bench', [s(50, 12)])] }), // 12 reps => valid
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
    expect(feb.durationMs).toBe(60000) // only second workout
  })

  it('slices yearMonth correctly', () => {
    const workouts = [
      mkWorkout({ d: '2026-02-15', start: 1000, entries: [mkEntry('bench', [s(100, 5)])] }),
    ]
    const feb = monthRecap(workouts, 'kg', '2026-02-15') // passing full iso should still work via slice 0,7
    expect(feb.workouts).toBe(1)
  })
})
