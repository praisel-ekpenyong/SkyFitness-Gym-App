import { describe, it, expect } from 'vitest'
import { streakOf } from './streak.js'
import { weekKey } from './dates.js'

// Mondays used as week anchors. 2026-07-01 is a Wednesday, so its week starts 2026-06-29.
const trained = d => ({ id: `w-${d}`, d, entries: [{ id: 'lift', sets: [{ done: true, w: 60, r: 5 }] }] })
const warmupOnly = d => ({ id: `w-${d}`, d, entries: [{ id: 'lift', sets: [{ done: true, phase: 'warmup', w: 20, r: 10 }] }] })
const uncheckedOnly = d => ({ id: `w-${d}`, d, entries: [{ id: 'lift', sets: [{ done: false, w: 60, r: 5 }] }] })
const on = (...dates) => dates.map(trained)
const at = (y, m, d) => new Date(y, m - 1, d, 12)
const key = iso => weekKey(iso)

describe('streakOf', () => {
  it('an empty profile has no streak and no weeks', () => {
    const r = streakOf({ workouts: [] }, at(2026, 7, 1))
    expect(r).toEqual({ current: 0, best: 0, thisWeekCounted: false, weeks: {} })
  })

  it('a single counted week in the current week is a streak of one', () => {
    const r = streakOf({ workouts: on('2026-06-30') }, at(2026, 7, 1))
    expect(r.current).toBe(1)
    expect(r.best).toBe(1)
    expect(r.thisWeekCounted).toBe(true)
    expect(r.weeks[key('2026-06-29')]).toEqual({ state: 'counted', run: 1 })
  })

  it('counts weeks trained in a row, however many workouts each week holds', () => {
    const S = { workouts: on('2026-06-08', '2026-06-10', '2026-06-12', '2026-06-15', '2026-06-22', '2026-06-29') }
    const r = streakOf(S, at(2026, 7, 1))
    expect(r.current).toBe(4)
    expect(r.best).toBe(4)
    expect(r.weeks[key('2026-06-08')]).toEqual({ state: 'counted', run: 1 })
    expect(r.weeks[key('2026-06-22')]).toEqual({ state: 'counted', run: 3 })
  })

  it('one missed week breaks the streak: nothing is banked to cover it', () => {
    // Four counted weeks, one missed, then a counted current week.
    const S = { workouts: on('2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15', '2026-06-29') }
    const r = streakOf(S, at(2026, 7, 1))
    expect(r.current).toBe(1)
    expect(r.best).toBe(4)
    expect(r.weeks[key('2026-06-15')]).toEqual({ state: 'counted', run: 4 })
    expect(r.weeks[key('2026-06-22')]).toEqual({ state: 'broke', run: 0 })
    expect(r.weeks[key('2026-06-29')]).toEqual({ state: 'counted', run: 1 })
  })

  it('the weeks after a break with no workout are missed, not broken again', () => {
    const S = { workouts: on('2026-06-01') }
    const r = streakOf(S, at(2026, 7, 1))
    expect(r.current).toBe(0)
    expect(r.best).toBe(1)
    expect(r.weeks[key('2026-06-08')].state).toBe('broke')
    expect(r.weeks[key('2026-06-15')].state).toBe('missed')
    expect(r.weeks[key('2026-06-22')].state).toBe('missed')
  })

  it('a current week with no counted workout is open: it neither counts nor breaks', () => {
    const S = { workouts: on('2026-06-01', '2026-06-08', '2026-06-15') }
    const r = streakOf(S, at(2026, 6, 24))
    expect(r.current).toBe(3)
    expect(r.thisWeekCounted).toBe(false)
    expect(r.weeks[key('2026-06-22')]).toEqual({ state: 'open', run: 3 })
  })

  it('a warm-up-only workout does not count and breaks the week it sits in', () => {
    const S = { workouts: [trained('2026-06-08'), warmupOnly('2026-06-15')] }
    const r = streakOf(S, at(2026, 6, 24))
    expect(r.current).toBe(0)
    expect(r.weeks[key('2026-06-15')].state).toBe('broke')
  })

  it('a workout whose sets are all unchecked does not count', () => {
    const S = { workouts: [trained('2026-06-08'), uncheckedOnly('2026-06-15')] }
    const r = streakOf(S, at(2026, 6, 24))
    expect(r.current).toBe(0)
    expect(r.weeks[key('2026-06-15')].state).toBe('broke')
  })

  it('best stays above current after a break', () => {
    const S = { workouts: on('2026-05-04', '2026-05-11', '2026-05-18', '2026-06-01', '2026-06-08') }
    const r = streakOf(S, at(2026, 6, 10))
    expect(r.current).toBe(2)
    expect(r.best).toBe(3)
  })

  it('ignores a stored streakRule from an old Profile', () => {
    const workouts = on('2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15', '2026-06-29')
    const plain = streakOf({ workouts }, at(2026, 7, 1))
    for (const streakRule of ['strict', 'gentle', 'generous', 'bogus']) {
      expect(streakOf({ workouts, streakRule }, at(2026, 7, 1))).toEqual(plain)
    }
  })

  it('a workout with a malformed day key never counts and never stretches the walk', () => {
    const S = { workouts: [...on('2026-06-22', '2026-06-29'), { ...trained('x'), d: 'garbage' }, { ...trained('y'), d: undefined }] }
    const r = streakOf(S, at(2026, 7, 1))
    expect(r.current).toBe(2)
    expect(Object.keys(r.weeks)).toEqual([key('2026-06-22'), key('2026-06-29')])
    expect(streakOf({ workouts: [{ ...trained('z'), d: '2026-1-5' }] }, at(2026, 7, 1))).toEqual({ current: 0, best: 0, thisWeekCounted: false, weeks: {} })
  })
})
