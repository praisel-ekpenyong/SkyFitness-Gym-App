// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { hasKeptMore } from './useStore.js'

describe('hasKeptMore', () => {
  it('returns true when next has more workouts than prev', () => {
    const prev = { workouts: [], bodyweight: [] }
    const next = { workouts: [{ id: 'w1' }], bodyweight: [] }
    expect(hasKeptMore(prev, next)).toBe(true)
  })

  it('returns true when next has more bodyweight weigh-ins than prev', () => {
    const prev = { workouts: [], bodyweight: [] }
    const next = { workouts: [], bodyweight: [{ d: '2026-11-20', w: 80 }] }
    expect(hasKeptMore(prev, next)).toBe(true)
  })

  it('returns false when neither workouts nor bodyweight increased', () => {
    const prev = { workouts: [{ id: 'w1' }], bodyweight: [{ d: '2026-11-19', w: 79 }] }
    const next = { workouts: [{ id: 'w1' }], bodyweight: [{ d: '2026-11-19', w: 79 }], restSec: 90 }
    expect(hasKeptMore(prev, next)).toBe(false)
  })

  it('returns false when items were removed rather than added', () => {
    const prev = { workouts: [{ id: 'w1' }, { id: 'w2' }], bodyweight: [{ d: '2026-11-19', w: 79 }] }
    const next = { workouts: [{ id: 'w1' }], bodyweight: [] }
    expect(hasKeptMore(prev, next)).toBe(false)
  })

  it('handles Zustand store slices wrapped in { S }', () => {
    const prev = { S: { workouts: [], bodyweight: [] } }
    const next = { S: { workouts: [{ id: 'w1' }], bodyweight: [] } }
    expect(hasKeptMore(prev, next)).toBe(true)
    expect(hasKeptMore(prev, prev)).toBe(false)
  })

  it('handles nullish or empty initial prev gracefully', () => {
    expect(hasKeptMore(null, { workouts: [{ id: 'w1' }] })).toBe(true)
    expect(hasKeptMore(undefined, { bodyweight: [{ d: '2026-11-20', w: 80 }] })).toBe(true)
    expect(hasKeptMore(null, null)).toBe(false)
    expect(hasKeptMore(undefined, undefined)).toBe(false)
    expect(hasKeptMore({ workouts: [{ id: 'w1' }] }, null)).toBe(false)
  })

  it('ignores other array or profile mutations like routines or custom exercises', () => {
    const prev = { workouts: [], bodyweight: [], routines: [] }
    const next = { workouts: [], bodyweight: [], routines: [{ id: 'r1' }], customEx: [{ id: 'c1' }] }
    expect(hasKeptMore(prev, next)).toBe(false)
  })
})
