import { describe, it, expect } from 'vitest'
import { streakOf } from './streak.js'
import { weekKey } from './format.js'

// Mondays used as week anchors. 2026-07-01 is a Wednesday, so its week starts 2026-06-29.
const trained = d => ({ id: `w-${d}`, d, entries: [{ id: 'lift', sets: [{ done: true, w: 60, r: 5 }] }] })
const warmupOnly = d => ({ id: `w-${d}`, d, entries: [{ id: 'lift', sets: [{ done: true, phase: 'warmup', w: 20, r: 10 }] }] })
const uncheckedOnly = d => ({ id: `w-${d}`, d, entries: [{ id: 'lift', sets: [{ done: false, w: 60, r: 5 }] }] })
const on = (...dates) => dates.map(trained)
const at = (y, m, d) => new Date(y, m - 1, d, 12)
const key = iso => weekKey(iso)

describe('streakOf', () => {
  it('an empty profile has no streak, no freezes and no weeks', () => {
    const r = streakOf({ workouts: [] }, at(2026, 7, 1))
    expect(r.current).toBe(0)
    expect(r.best).toBe(0)
    expect(r.freezes).toBe(0)
    expect(r.thisWeekCounted).toBe(false)
    expect(r.weeks).toEqual({})
    expect(r.rule).toBe('gentle')
  })

  it('a single counted week in the current week is a streak of one', () => {
    const r = streakOf({ workouts: on('2026-06-30') }, at(2026, 7, 1))
    expect(r.current).toBe(1)
    expect(r.best).toBe(1)
    expect(r.thisWeekCounted).toBe(true)
    expect(r.weeks[key('2026-06-29')]).toEqual({ state: 'counted', run: 1, bank: 0, earned: false })
  })

  it('a missed week is covered by a freeze under Gentle, and the streak carries on', () => {
    // Four counted weeks earn one freeze; the fifth Monday is missed; the current week counts again.
    const S = { workouts: on('2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15', '2026-06-29') }
    const r = streakOf(S, at(2026, 7, 1))
    expect(r.current).toBe(5)
    expect(r.best).toBe(5)
    expect(r.freezes).toBe(0)
    expect(r.weeks[key('2026-06-15')]).toEqual({ state: 'counted', run: 4, bank: 1, earned: true })
    expect(r.weeks[key('2026-06-22')]).toEqual({ state: 'frozen', run: 4, bank: 0, earned: false })
    expect(r.weeks[key('2026-06-29')]).toEqual({ state: 'counted', run: 5, bank: 0, earned: false })
  })

  it('two missed weeks in a row break a Gentle streak but a Generous streak holds', () => {
    // Eight counted weeks, then two missed, then a counted current week.
    const S = { workouts: on(
      '2026-04-27', '2026-05-04', '2026-05-11', '2026-05-18',
      '2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15', '2026-07-06',
    ) }
    const today = at(2026, 7, 8)
    const gentle = streakOf({ ...S, streakRule: 'gentle' }, today)
    expect(gentle.current).toBe(1)
    expect(gentle.best).toBe(8)
    expect(gentle.weeks[key('2026-06-22')].state).toBe('frozen')
    expect(gentle.weeks[key('2026-06-29')].state).toBe('broke')

    const generous = streakOf({ ...S, streakRule: 'generous' }, today)
    expect(generous.current).toBe(9)
    expect(generous.best).toBe(9)
    expect(generous.weeks[key('2026-06-22')].state).toBe('frozen')
    expect(generous.weeks[key('2026-06-29')].state).toBe('frozen')
  })

  it('a full bank loses the freeze earned past it', () => {
    const S = { workouts: on('2026-04-27', '2026-05-04', '2026-05-11', '2026-05-18',
      '2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15') }
    const gentle = streakOf(S, at(2026, 6, 17))
    expect(gentle.weeks[key('2026-05-18')]).toEqual({ state: 'counted', run: 4, bank: 1, earned: true })
    expect(gentle.weeks[key('2026-06-15')]).toEqual({ state: 'counted', run: 8, bank: 1, earned: false })
    expect(gentle.freezes).toBe(1)

    const generous = streakOf({ ...S, streakRule: 'generous' }, at(2026, 6, 17))
    expect(generous.weeks[key('2026-06-15')]).toEqual({ state: 'counted', run: 8, bank: 2, earned: true })
  })

  it('a current week with no counted workout is open: it neither counts nor breaks', () => {
    const S = { workouts: on('2026-06-01', '2026-06-08', '2026-06-15') }
    const r = streakOf(S, at(2026, 6, 24))
    expect(r.current).toBe(3)
    expect(r.thisWeekCounted).toBe(false)
    expect(r.weeks[key('2026-06-22')]).toEqual({ state: 'open', run: 3, bank: 0, earned: false })
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

  it('Strict breaks on the first missed week, since its rule has no freezes', () => {
    const S = { streakRule: 'strict', workouts: on('2026-06-01', '2026-06-08', '2026-06-15', '2026-06-29') }
    const r = streakOf(S, at(2026, 7, 1))
    expect(r.rule).toBe('strict')
    expect(r.current).toBe(1)
    expect(r.best).toBe(3)
    expect(r.weeks[key('2026-06-22')]).toEqual({ state: 'broke', run: 0, bank: 0, earned: false })
  })

  it('previews the current and best streak under all three rules', () => {
    const S = { workouts: on('2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15', '2026-06-29') }
    const r = streakOf(S, at(2026, 7, 1))
    expect(r.preview).toEqual({
      strict: { current: 1, best: 4 },
      gentle: { current: 5, best: 5 },
      generous: { current: 5, best: 5 },
    })
  })

  it('counts the counted weeks left until the next freeze is earned', () => {
    // Gentle mid-run: three counted weeks, one more earns the freeze.
    expect(streakOf({ workouts: on('2026-06-15', '2026-06-22', '2026-06-29') }, at(2026, 7, 1)).toNextFreeze).toBe(1)
    // Gentle with the bank full: five counted weeks, the next freeze comes at the eighth (and would be lost).
    const full = streakOf({ workouts: on('2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29') }, at(2026, 7, 1))
    expect(full.freezes).toBe(1)
    expect(full.toNextFreeze).toBe(3)
    // Strict banks nothing but still counts toward the four-week mark.
    expect(streakOf({ streakRule: 'strict', workouts: on('2026-06-22', '2026-06-29') }, at(2026, 7, 1)).toNextFreeze).toBe(2)
    // A fresh streak needs the full four.
    expect(streakOf({ workouts: [] }, at(2026, 7, 1)).toNextFreeze).toBe(4)
  })

  it('reads the stored rule, with an absent or unknown value as Gentle', () => {
    const workouts = on('2026-06-01')
    expect(streakOf({ workouts, streakRule: 'generous' }, at(2026, 7, 1)).rule).toBe('generous')
    expect(streakOf({ workouts, streakRule: 'bogus' }, at(2026, 7, 1)).rule).toBe('gentle')
    expect(streakOf({ workouts }, at(2026, 7, 1)).rule).toBe('gentle')
  })
})
