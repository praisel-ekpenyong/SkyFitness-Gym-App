// History's own seam: the schedule reads every Home/Calendar/Hero consumer
// shares, and the history write side (deleteWorkout). The barrel-era copy of this
// file duplicated
// workout-model.test.js line for line and was retired; effort, row, label and
// superset coverage lives at its canonical modules.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { deleteWorkout, effectiveRoutineId, hasEffectiveOverride, effectiveRoutine, streakWeeks } from './history.js'

describe('deleteWorkout — the history write seam', () => {
  const S = () => ({
    workouts: [
      { id: 'w-1', d: '2026-01-05', prs: ['0025'], entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }] },
      { id: 'w-2', d: '2026-01-06', prs: ['0047'], entries: [] }
    ],
    exWeights: { '0025': { w: 100, d: '2026-01-05' } }
  })

  it('removes exactly the workout with the id', () => {
    const s = S()
    expect(deleteWorkout(s, 'w-1')).toBe(true)
    expect(s.workouts.map(w => w.id)).toEqual(['w-2'])
  })

  it('is a no-op for a stale id and says so', () => {
    const s = S()
    expect(deleteWorkout(s, 'w-gone')).toBe(false)
    expect(s.workouts).toHaveLength(2)
  })

  it('never unremembers a Best: the exWeights suggestion stands after deleting its workout', () => {
    const s = S()
    deleteWorkout(s, 'w-1')
    // deleting the workout that held 100 kg cannot lower what was recorded
    expect(s.exWeights['0025']).toEqual({ w: 100, d: '2026-01-05' })
  })

  it('leaves every other collection untouched', () => {
    const s = S()
    deleteWorkout(s, 'w-2')
    expect(s.exWeights).toEqual({ '0025': { w: 100, d: '2026-01-05' } })
    expect(s.workouts[0].prs).toEqual(['0025'])
  })
})

describe('schedule reads shared by Home, Calendar and the hero', () => {
  const S = () => ({
    routines: [{ id: 'r-push' }, { id: 'r-pull' }],
    week: { 1: 'r-push' },                                   // Monday: push
    dayPlan: { '2026-01-07': 'r-pull', '2026-01-08': 'rest' } // + Wed pull, Thu rest
  })

  it('a valid day override wins over the weekday map', () => {
    expect(effectiveRoutineId(S(), '2026-01-07')).toBe('r-pull')
  })

  it('an override marked rest reads as unscheduled even on a scheduled weekday', () => {
    expect(effectiveRoutineId(S(), '2026-01-08')).toBeNull() // Thursday, but rest won
  })

  it('a stale override (deleted routine) falls back to the weekday plan', () => {
    const s = S()
    s.dayPlan['2026-01-05'] = 'r-deleted'
    // Monday per the map — the dead override cannot shadow it
    expect(effectiveRoutineId(s, '2026-01-05')).toBe('r-push')
    expect(hasEffectiveOverride(s, '2026-01-05')).toBe(false)
  })

  it('a weekday left as legacy rest reads as unscheduled', () => {
    const s = S()
    s.week[2] = 'rest'
    expect(effectiveRoutineId(s, '2026-01-06')).toBeNull() // Tuesday
  })

  it('hasEffectiveOverride distinguishes no override, rest, valid and stale', () => {
    const s = S()
    expect(hasEffectiveOverride(s, '2026-01-05')).toBe(false)
    expect(hasEffectiveOverride(s, '2026-01-07')).toBe(true)
    expect(hasEffectiveOverride(s, '2026-01-08')).toBe(true)
    s.dayPlan['2026-01-09'] = 'r-deleted'
    expect(hasEffectiveOverride(s, '2026-01-09')).toBe(false)
  })

  it('effectiveRoutine hands back the full routine object, or null', () => {
    const s = S()
    expect(effectiveRoutine(s, '2026-01-07')).toEqual({ id: 'r-pull' })
    expect(effectiveRoutine(s, '2026-01-09')).toBeNull()
  })
})

describe('streakWeeks', () => {
  afterEach(() => { vi.useRealTimers() })

  it('counts back in calendar weeks; the current week may still be in progress', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-04T12:00:00')) // Sunday — week starts Monday
    const s = { workouts: [{ d: '2026-01-04' }, { d: '2026-01-02' }, { d: '2025-12-28' }, { d: '2025-12-21' }] }
    expect(streakWeeks(s)).toBe(3)
  })

  it('a full gap breaks the streak even when older weeks are populated', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-04T12:00:00'))
    const s = { workouts: [{ d: '2026-01-04' }, { d: '2026-01-01' }, { d: '2025-12-15' }] }
    expect(streakWeeks(s)).toBe(1)
  })
})
