import { describe, it, expect } from 'vitest'
import { setDayOverride, clearDayOverride, assignWeekday, detachRoutine, dayStatus, REST } from './schedule.js'
import { effectiveRoutineId, hasEffectiveOverride } from './history.js'

// Minimal profile slice the schedule seam reads: routines for id validation,
// week + dayPlan for the two maps. active/workouts only assert detach scope.
const mkState = (over = {}) => ({
  routines: [{ id: 'r1' }, { id: 'r2' }],
  week: {},
  dayPlan: {},
  ...over,
})

describe('setDayOverride / clearDayOverride', () => {
  it('round-trips a routine override for one date', () => {
    const s = mkState()
    setDayOverride(s, '2026-10-16', 'r1')
    expect(s.dayPlan['2026-10-16']).toBe('r1')
    clearDayOverride(s, '2026-10-16')
    expect(s.dayPlan['2026-10-16']).toBe(undefined)
    expect('2026-10-16' in s.dayPlan).toBe(false)
  })

  it('writes a rest day as the shared sentinel, not a routine id', () => {
    const s = mkState()
    setDayOverride(s, '2026-10-16', REST)
    expect(s.dayPlan['2026-10-16']).toBe('rest')
    expect(REST).toBe('rest')
  })

  it('treats falsy as clear, making the old implicit convention explicit', () => {
    const s = mkState({ dayPlan: { '2026-10-16': 'r1' } })
    setDayOverride(s, '2026-10-16', '')
    expect('2026-10-16' in s.dayPlan).toBe(false)
  })

  it('rejects an unknown routine id instead of writing a dangling override', () => {
    const s = mkState()
    expect(() => setDayOverride(s, '2026-10-16', 'no-such-routine')).toThrow()
    expect('2026-10-16' in s.dayPlan).toBe(false)
  })

  it('clear is a no-op when nothing is stored for the date', () => {
    const s = mkState()
    expect(() => clearDayOverride(s, '2026-10-16')).not.toThrow()
    expect(s.dayPlan).toEqual({})
  })
})

describe('assignWeekday', () => {
  it('assigns and clears one weekday without touching the others', () => {
    const s = mkState({ week: { 1: 'r1' } })
    assignWeekday(s, 3, 'r2')
    expect(s.week).toEqual({ 1: 'r1', 3: 'r2' })
    assignWeekday(s, 1, '')
    expect(s.week).toEqual({ 3: 'r2' })
  })

  it('rejects days outside 0-6 and unknown routine ids', () => {
    const s = mkState()
    expect(() => assignWeekday(s, 7, 'r1')).toThrow()
    expect(() => assignWeekday(s, -1, 'r1')).toThrow()
    expect(() => assignWeekday(s, 1.5, 'r1')).toThrow()
    expect(() => assignWeekday(s, 1, 'no-such-routine')).toThrow()
    expect(s.week).toEqual({})
  })
})

describe('detachRoutine', () => {
  it('sweeps the routine from week and dayPlan only', () => {
    const s = mkState({
      week: { 1: 'r1', 3: 'r2' },
      dayPlan: { '2026-10-16': 'r1', '2026-10-17': 'r2', '2026-10-18': 'rest' },
      active: { routineId: 'r1' },
      workouts: [{ id: 'w1', routineId: 'r1' }],
    })
    detachRoutine(s, 'r1')
    expect(s.week).toEqual({ 3: 'r2' })
    expect(s.dayPlan).toEqual({ '2026-10-17': 'r2', '2026-10-18': 'rest' })
  })

  it('leaves the active workout and finished history alone', () => {
    const active = { routineId: 'r1' }
    const workouts = [{ id: 'w1', routineId: 'r1' }]
    const s = mkState({ week: { 1: 'r1' }, dayPlan: { '2026-10-16': 'r1' }, active, workouts })
    detachRoutine(s, 'r1')
    expect(s.active).toBe(active)
    expect(s.workouts).toBe(workouts)
    expect(s.routines.map(r => r.id)).toEqual(['r1', 'r2'])
  })

  it('pins the read-side contract that makes the eager sweep safe: a stale override falls back to the week', () => {
    // A dayPlan entry pointing at a deleted routine: not an override, week wins.
    const s = mkState({ routines: [{ id: 'r2' }], week: { 5: 'r2' }, dayPlan: { '2026-10-16': 'gone' } })
    // 2026-10-16 is a Friday (getDay() === 5).
    expect(hasEffectiveOverride(s, '2026-10-16')).toBe(false)
    expect(effectiveRoutineId(s, '2026-10-16')).toBe('r2')
  })
})

describe('dayStatus', () => {
  // trained x effId x ovr: trained wins, then rescheduled, then planned.
  const rows = [
    [{ trained: true, effId: 'r1', ovr: true }, 'done'], // trained + override
    [{ trained: true, effId: 'r1', ovr: false }, 'done'], // trained, week plan
    [{ trained: true, effId: null, ovr: false }, 'done'], // trained on rest day
    [{ trained: true, effId: null, ovr: true }, 'done'], // trained + rest override
    [{ trained: false, effId: 'r1', ovr: true }, 'ovr'], // rescheduled
    [{ trained: false, effId: 'r1', ovr: false }, 'plan'], // planned
    [{ trained: false, effId: null, ovr: true }, ''], // rest override: no dot
    [{ trained: false, effId: null, ovr: false }, ''], // unscheduled: no dot
  ]
  it.each(rows)('classifies %o as %s', (input, expected) => {
    expect(dayStatus(input)).toBe(expected)
  })

  it('treats any trained hit as done regardless of the plan underneath', () => {
    expect(dayStatus({ trained: 1, effId: null, ovr: false })).toBe('done')
    expect(dayStatus({ trained: 0, effId: null, ovr: false })).toBe('')
  })
})
