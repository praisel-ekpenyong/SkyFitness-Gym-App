import { describe, expect, it } from 'vitest'
import {
  LB_TO_KG,
  currentBodyweightKg,
  deleteWeighIn,
  deltaTowardGoal,
  latestWeighIn,
  mergeWeighIns,
  recordWeighIn,
} from './bodyweight.js'

const TOWARD = 'var(--acc-text)'
const AWAY = 'var(--red-text)'
const NO_DELTA = 'var(--label-2)'
const NO_GOAL = 'var(--label)'

describe('recordWeighIn (sheet write rule: upsert)', () => {
  it('inserts out of order and keeps the log chronological', () => {
    const S = { bodyweight: [{ d: '2026-01-10', w: 80, t: 1 }] }
    recordWeighIn(S, { d: '2026-01-05', w: 81, t: 2 })
    expect(S.bodyweight.map(b => b.d)).toEqual(['2026-01-05', '2026-01-10'])
  })

  it('overwrites the same day by default', () => {
    const S = { bodyweight: [{ d: '2026-01-10', w: 80, t: 1 }] }
    recordWeighIn(S, { d: '2026-01-10', w: 79.5, t: 2 })
    expect(S.bodyweight).toEqual([{ d: '2026-01-10', w: 79.5, t: 2 }])
  })

  it('leaves an existing day alone with {overwrite:false}', () => {
    const S = { bodyweight: [{ d: '2026-01-10', w: 80, t: 1 }] }
    recordWeighIn(S, { d: '2026-01-10', w: 79.5, t: 2 }, { overwrite: false })
    expect(S.bodyweight).toEqual([{ d: '2026-01-10', w: 80, t: 1 }])
  })

  it('rounds to 1 decimal and normalizes a missing log', () => {
    const S = {}
    recordWeighIn(S, { d: '2026-01-10', w: 80.06, t: 1 })
    expect(S.bodyweight).toEqual([{ d: '2026-01-10', w: 80.1, t: 1 }])
  })
})

describe('mergeWeighIns (import write rule: existing days win)', () => {
  it('skips days already logged and reports added/skipped', () => {
    const S = { bodyweight: [{ d: '2026-01-01', w: 80, t: 1 }] }
    const res = mergeWeighIns(S, [
      { d: '2026-01-01', w: 81, t: 2 },
      { d: '2026-01-02', w: 79, t: 3 },
    ])
    expect(res).toEqual({ added: 1, skipped: 1 })
    expect(S.bodyweight).toEqual([
      { d: '2026-01-01', w: 80, t: 1 },
      { d: '2026-01-02', w: 79, t: 3 },
    ])
  })

  it('sorts once for an out-of-order batch and dedupes within it', () => {
    const S = { bodyweight: [] }
    const res = mergeWeighIns(S, [
      { d: '2026-01-03', w: 79 },
      { d: '2026-01-01', w: 81 },
      { d: '2026-01-01', w: 80 },
    ])
    expect(res).toEqual({ added: 2, skipped: 1 })
    expect(S.bodyweight.map(b => b.d)).toEqual(['2026-01-01', '2026-01-03'])
    expect(S.bodyweight[0].w).toBe(81)
  })

  it('normalizes a missing log instead of throwing', () => {
    const S = {}
    expect(() => mergeWeighIns(S, [{ d: '2026-01-02', w: 79 }])).not.toThrow()
    expect(S.bodyweight).toEqual([{ d: '2026-01-02', w: 79 }])
  })
})

describe('deleteWeighIn / latestWeighIn', () => {
  it('removes exactly the day asked for', () => {
    const S = { bodyweight: [{ d: '2026-01-01', w: 80 }, { d: '2026-01-02', w: 79 }] }
    expect(deleteWeighIn(S, '2026-01-01')).toBe(1)
    expect(S.bodyweight).toEqual([{ d: '2026-01-02', w: 79 }])
    expect(deleteWeighIn(S, '2026-01-09')).toBe(0)
  })

  it('reads the chronologically latest entry even when stored out of order', () => {
    const S = { bodyweight: [{ d: '2026-01-10', w: 80 }, { d: '2026-01-05', w: 81 }] }
    expect(latestWeighIn(S)).toEqual({ d: '2026-01-10', w: 80 })
    expect(latestWeighIn({ bodyweight: [] })).toBeNull()
    expect(latestWeighIn({})).toBeNull()
  })
})

describe('canonical-kg reading', () => {
  it('passes kg through and converts a pound profile', () => {
    expect(currentBodyweightKg({ unit: 'kg', bodyweight: [{ d: '2026-01-10', w: 80 }] })).toBe(80)
    expect(currentBodyweightKg({ unit: 'lb', bodyweight: [{ d: '2026-01-10', w: 220.462262 }] })).toBeCloseTo(100, 6)
    expect(currentBodyweightKg({ unit: 'kg', bodyweight: [] })).toBeNull()
    expect(currentBodyweightKg({ unit: 'kg', bodyweight: [{ d: '2026-01-10', w: 0 }] })).toBeNull()
  })

  it('round-trips 80 kg across units at 1-decimal policy', () => {
    const asLb = Math.round(80 / LB_TO_KG * 10) / 10
    expect(asLb).toBe(176.4)
    expect(Math.round(asLb * LB_TO_KG * 10) / 10).toBe(80)
  })
})

describe('deltaTowardGoal (pure classifier)', () => {
  it('stays neutral without a delta or without a goal', () => {
    expect(deltaTowardGoal(80, 70, 0)).toBe(NO_DELTA)
    expect(deltaTowardGoal(80, 70, null)).toBe(NO_DELTA)
    expect(deltaTowardGoal(80, 70, NaN)).toBe(NO_DELTA)
    expect(deltaTowardGoal(null, 70, 1)).toBe(NO_GOAL)
    expect(deltaTowardGoal(undefined, 70, -1)).toBe(NO_GOAL)
  })

  it('judges movement against a gain goal', () => {
    expect(deltaTowardGoal(80, 70, 1)).toBe(TOWARD)
    expect(deltaTowardGoal(80, 70, -1)).toBe(AWAY)
  })

  it('judges movement against a loss goal', () => {
    expect(deltaTowardGoal(70, 80, -1)).toBe(TOWARD)
    expect(deltaTowardGoal(70, 80, 1)).toBe(AWAY)
  })
})
