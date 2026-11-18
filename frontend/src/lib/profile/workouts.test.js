import { describe, expect, it } from 'vitest'
import { sortWorkouts } from './index.js'

describe('the one Workout order', () => {
  it('sorts by date, then start, then original position', () => {
    const late = { id: 'late', d: '2026-02-01', start: 1 }
    const earlySecond = { id: 'early-second', d: '2026-01-01', start: 50 }
    const earlyFirst = { id: 'early-first', d: '2026-01-01', start: 10 }
    const firstTie = { id: 'first-tie', d: '2026-01-01', start: 10 }
    const secondTie = { id: 'second-tie', d: '2026-01-01', start: 10 }

    const out = sortWorkouts([late, earlySecond, earlyFirst, firstTie, secondTie])
    expect(out.map(w => w.id)).toEqual(['early-first', 'first-tie', 'second-tie', 'early-second', 'late'])
  })

  it('returns a new array and leaves the input alone', () => {
    const input = [{ id: 'b', d: '2026-01-02' }, { id: 'a', d: '2026-01-01' }]
    const out = sortWorkouts(input)
    expect(out).not.toBe(input)
    expect(input.map(w => w.id)).toEqual(['b', 'a'])
  })

  it('reads a missing or unreadable start as zero and never throws', () => {
    const out = sortWorkouts([
      { id: 'b', d: '2026-01-01', start: 5 },
      { id: 'a', d: '2026-01-01' },
      { id: 'c', d: '2026-01-01', start: 'nope' },
    ])
    expect(out.map(w => w.id)).toEqual(['a', 'c', 'b'])
    expect(sortWorkouts(null)).toEqual([])
    expect(sortWorkouts(undefined)).toEqual([])
  })
})
