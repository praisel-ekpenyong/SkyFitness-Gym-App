import { describe, it, expect } from 'vitest'
import { estimate1RM, bestSetOf, e1rmSeries, best1RM, is1RMRecord, resolveSetWeight, REP_CAP, FORMULAS } from './onerm.js'
import { LB_TO_KG } from './bodyweight.js'

describe('estimate1RM', () => {
  it('returns the load unchanged for a single rep', () => {
    expect(estimate1RM(100, 1)).toBe(100)
    expect(estimate1RM(62.5, 1)).toBe(62.5)
  })

  it('matches Epley by hand across the usual rep ranges', () => {
    expect(estimate1RM(100, 5)).toBe(116.7)   // 100 · (1 + 5/30)
    expect(estimate1RM(100, 10)).toBe(133.3)
    expect(estimate1RM(80, 8)).toBe(101.3)
    expect(estimate1RM(60, 3)).toBe(66)
  })

  it('rounds to one decimal', () => {
    expect(estimate1RM(101.25, 7)).toBe(124.9)
    expect(Number.isInteger(estimate1RM(100, 3) * 10)).toBe(true)
  })

  it('refuses reps beyond the cap rather than guessing', () => {
    expect(estimate1RM(100, REP_CAP)).not.toBeNull()
    expect(estimate1RM(100, REP_CAP + 1)).toBeNull()
    expect(estimate1RM(60, 30)).toBeNull()
  })

  it('rejects invalid, zero and negative input', () => {
    expect(estimate1RM(0, 5)).toBeNull()
    expect(estimate1RM(-100, 5)).toBeNull()
    expect(estimate1RM(100, 0)).toBeNull()
    expect(estimate1RM(100, -3)).toBeNull()
    expect(estimate1RM(undefined, 5)).toBeNull()
    expect(estimate1RM(100, undefined)).toBeNull()
    expect(estimate1RM(NaN, 5)).toBeNull()
    expect(estimate1RM(Infinity, 5)).toBeNull()
    expect(estimate1RM('', '')).toBeNull()
  })

  it('accepts numeric strings, the shape number inputs arrive in', () => {
    expect(estimate1RM('100', '5')).toBe(116.7)
  })

  it('offers the other documented formulas and agrees with them at low reps', () => {
    expect(estimate1RM(100, 5, 'brzycki')).toBe(112.5)
    expect(estimate1RM(100, 5, 'lombardi')).toBe(117.5)
    expect(Object.keys(FORMULAS)).toContain('epley')
  })

  it('keeps the formulas within a few percent up to 8 reps, and diverges most at the cap', () => {
    const spread = r => Math.max(...Object.keys(FORMULAS).map(f => estimate1RM(100, r, f)))
      - Math.min(...Object.keys(FORMULAS).map(f => estimate1RM(100, r, f)))
    expect(spread(1)).toBe(0)                       // one rep is measured, not estimated
    for (let r = 2; r <= 8; r++) expect(spread(r)).toBeLessThan(6)
    const upTo = []
    for (let r = 1; r < REP_CAP; r++) upTo.push(spread(r))
    expect(spread(REP_CAP)).toBeGreaterThan(Math.max(...upTo))   // why REP_CAP exists
  })

  it('falls back to the default for an unknown formula name', () => {
    expect(estimate1RM(100, 5, 'nope')).toBe(estimate1RM(100, 5))
  })

  it('normalizes load when setUnit and targetUnit are passed', () => {
    // 220.462 lb -> ~100 kg
    expect(estimate1RM(220.462, 1, 'epley', 'lb', 'kg')).toBe(100)
    expect(estimate1RM(100, 1, 'epley', 'kg', 'lb')).toBe(220.5)
    expect(estimate1RM(220.462, 5, 'epley', 'lb', 'kg')).toBe(116.7)
    expect(estimate1RM(100, 5, 'epley', 'kg', 'kg')).toBe(116.7)
  })
})

describe('bestSetOf', () => {
  it('picks the highest estimate, not the heaviest set', () => {
    const entry = { id: 'x', sets: [
      { w: 100, r: 5, done: true },   // 116.7
      { w: 110, r: 3, done: true },   // 121.0
      { w: 120, r: 1, done: true }    // 120.0
    ] }
    expect(bestSetOf(entry)).toEqual({ est: 121, w: 110, r: 3 })
  })

  it('ignores sets that were never checked off', () => {
    const entry = { id: 'x', sets: [{ w: 100, r: 5, done: true }, { w: 200, r: 5, done: false }] }
    expect(bestSetOf(entry).w).toBe(100)
  })

  it('ignores topW, which carries no rep count', () => {
    const entry = { id: 'x', topW: 200, sets: [{ w: 100, r: 5, done: true }] }
    expect(bestSetOf(entry).est).toBe(116.7)
  })

  it('returns null for cardio and timed entries', () => {
    expect(bestSetOf({ id: 'c', sets: [{ min: 20, speed: 9, done: true }] })).toBeNull()
    expect(bestSetOf({ id: 'p', sets: [{ sec: 60, w: 0, done: true }] })).toBeNull()
    expect(bestSetOf({ id: 'p', sets: [{ sec: 60, w: 20, done: true }] })).toBeNull()
  })

  it('survives a missing or empty entry', () => {
    expect(bestSetOf(null)).toBeNull()
    expect(bestSetOf({ sets: [] })).toBeNull()
  })
})

const S = {
  workouts: [
    { d: '2026-01-01', start: 1, entries: [{ id: 'bench', sets: [{ w: 80, r: 5, done: true }] }] },
    { d: '2026-01-08', start: 2, entries: [{ id: 'squat', sets: [{ w: 100, r: 5, done: true }] }] },
    { d: '2026-01-15', start: 3, entries: [{ id: 'bench', sets: [{ w: 90, r: 5, done: true }, { w: 90, r: 3, done: false }] }] },
    { d: '2026-01-22', start: 4, entries: [{ id: 'bench', sets: [{ w: 85, r: 5, done: true }] }] },
    { d: '2026-01-29', start: 5, entries: [{ id: 'run', sets: [{ min: 30, speed: 10, done: true }] }] }
  ]
}

describe('e1rmSeries / best1RM', () => {
  it('yields one chronological point per workout that produced an estimate', () => {
    const pts = e1rmSeries(S, 'bench')
    expect(pts.map(p => p.d)).toEqual(['2026-01-01', '2026-01-15', '2026-01-22'])
    expect(pts.map(p => p.y)).toEqual([93.3, 105, 99.2])
  })

  it('reports the all-time best with the set behind it', () => {
    expect(best1RM(S, 'bench')).toEqual({ est: 105, w: 90, r: 5, d: '2026-01-15', t: 3 })
  })

  it('has nothing to say about cardio or an unknown exercise', () => {
    expect(e1rmSeries(S, 'run')).toEqual([])
    expect(best1RM(S, 'run')).toBeNull()
    expect(best1RM(S, 'nope')).toBeNull()
    expect(best1RM({ workouts: [] }, 'bench')).toBeNull()
    expect(best1RM({}, 'bench')).toBeNull()
  })
})

describe('is1RMRecord', () => {
  it('flags a session that beats every previous estimate', () => {
    const rec = is1RMRecord(S, 'bench', { id: 'bench', sets: [{ w: 95, r: 5, done: true }] })
    expect(rec).toEqual({ est: 110.8, w: 95, r: 5, prev: 105 })
  })

  it('stays quiet when the session does not beat the record', () => {
    expect(is1RMRecord(S, 'bench', { id: 'bench', sets: [{ w: 90, r: 5, done: true }] })).toBeNull()
    expect(is1RMRecord(S, 'bench', { id: 'bench', sets: [{ w: 80, r: 5, done: true }] })).toBeNull()
  })

  it('counts the first ever estimate as a record', () => {
    const rec = is1RMRecord(S, 'deadlift', { id: 'deadlift', sets: [{ w: 140, r: 3, done: true }] })
    expect(rec.prev).toBe(0)
    expect(rec.est).toBe(154)
  })

  it('says nothing for a timed or unfinished entry', () => {
    expect(is1RMRecord(S, 'plank', { id: 'plank', sets: [{ sec: 90, done: true }] })).toBeNull()
    expect(is1RMRecord(S, 'bench', { id: 'bench', sets: [{ w: 200, r: 5, done: false }] })).toBeNull()
  })
})


describe('warm-up sets and 1RM', () => {
  const ENTRY = { id: 'warm-test', sets: [
    { w: 20, r: 8, done: true, warmup: true },
    { w: 80, r: 5, done: true },
  ] }

  it('does not let a ticked-off warm-up set set or raise the estimated 1RM', () => {
    const working = { id: 'warm-test', sets: [{ w: 80, r: 5, done: true }] }
    expect(bestSetOf(ENTRY)).toEqual(bestSetOf(working))
    expect(best1RM({ workouts: [{ entries: [ENTRY] }] }, 'warm-test')).toEqual(
      best1RM({ workouts: [{ entries: [working] }] }, 'warm-test'),
    )
  })
})

describe('read-time unit normalization (ADR 0017)', () => {
  describe('resolveSetWeight', () => {
    it('normalizes lb to kg using LB_TO_KG factor', () => {
      const set = { w: 100, unit: 'lb' }
      expect(resolveSetWeight(set, null, null, 'kg')).toBeCloseTo(100 * LB_TO_KG, 5)
    })

    it('normalizes kg to lb using 1 / LB_TO_KG factor', () => {
      const set = { w: 100, unit: 'kg' }
      expect(resolveSetWeight(set, null, null, 'lb')).toBeCloseTo(100 / LB_TO_KG, 5)
    })

    it('preserves weight unchanged when units match', () => {
      expect(resolveSetWeight({ w: 80, unit: 'kg' }, null, null, 'kg')).toBe(80)
      expect(resolveSetWeight({ w: 175, unit: 'lb' }, null, null, 'lb')).toBe(175)
    })

    it('falls back through entry unit, workout unit, and target unit', () => {
      // Set missing unit -> uses entry.unit
      expect(resolveSetWeight({ w: 100 }, { unit: 'lb' }, null, 'kg')).toBeCloseTo(100 * LB_TO_KG, 5)
      // Set & entry missing unit -> uses workout.unit
      expect(resolveSetWeight({ w: 100 }, null, { unit: 'lb' }, 'kg')).toBeCloseTo(100 * LB_TO_KG, 5)
      // All missing unit -> defaults to targetUnit (no conversion)
      expect(resolveSetWeight({ w: 100 }, null, null, 'kg')).toBe(100)
    })

    it('handles non-finite or missing weights gracefully', () => {
      expect(resolveSetWeight({ w: undefined })).toBe(0)
      expect(resolveSetWeight({ w: NaN })).toBe(0)
      expect(resolveSetWeight(null)).toBe(0)
    })
  })

  describe('bestSetOf with mixed units', () => {
    it('normalizes a lb set to kg and rounds to 1 decimal place', () => {
      const entry = { id: 'bench', sets: [{ w: 150, r: 5, done: true, unit: 'lb' }] }
      // 150 lb * LB_TO_KG = 68.0388... kg -> estimate with epley (5 reps) = 68.0388 * (1 + 5/30) = 79.378... -> 79.4
      const best = bestSetOf(entry, 'epley', 'kg')
      expect(best.est).toBe(79.4)
      expect(best.w).toBe(68)
      expect(best.r).toBe(5)
    })

    it('normalizes a kg set to lb and rounds to 1 decimal place', () => {
      const entry = { id: 'bench', sets: [{ w: 100, r: 5, done: true, unit: 'kg' }] }
      // 100 kg / LB_TO_KG = 220.462... lb -> estimate with epley (5 reps) = 220.462 * (1 + 5/30) = 257.206... -> 257.2
      const best = bestSetOf(entry, 'epley', 'lb')
      expect(best.est).toBe(257.2)
      expect(best.w).toBe(220.5)
      expect(best.r).toBe(5)
    })

    it('selects the true physical maximum rather than the larger raw number', () => {
      const entry = { id: 'bench', sets: [
        { w: 200, r: 5, done: true, unit: 'lb' }, // 200 lb = 90.7 kg -> est ~ 105.8 kg
        { w: 100, r: 5, done: true, unit: 'kg' }, // 100 kg -> est = 116.7 kg
      ] }
      // In kg, 100 kg beats 200 lb
      const bestKg = bestSetOf(entry, 'epley', 'kg')
      expect(bestKg.est).toBe(116.7)
      expect(bestKg.w).toBe(100)

      // In lb, 100 kg (220.5 lb) also beats 200 lb
      const bestLb = bestSetOf(entry, 'epley', 'lb')
      expect(bestLb.est).toBe(257.2)
      expect(bestLb.w).toBe(220.5)
    })
  })

  describe('e1rmSeries and best1RM across unit transitions', () => {
    const multiUnitState = {
      unit: 'kg',
      workouts: [
        // Old workouts logged in pounds
        { d: '2025-10-01', start: 1, unit: 'lb', entries: [{ id: 'bench', sets: [{ w: 150, r: 5, done: true }] }] },
        // New workouts logged in kilograms
        { d: '2026-01-15', start: 2, unit: 'kg', entries: [{ id: 'bench', sets: [{ w: 100, r: 5, done: true }] }] },
      ]
    }

    it('evaluates series and best1RM in kg when active profile unit is kg', () => {
      const pts = e1rmSeries(multiUnitState, 'bench')
      expect(pts).toHaveLength(2)
      expect(pts[0].y).toBe(79.4) // 150 lb scaled to kg
      expect(pts[1].y).toBe(116.7) // 100 kg unchanged
      const best = best1RM(multiUnitState, 'bench')
      expect(best).toEqual({ est: 116.7, w: 100, r: 5, d: '2026-01-15', t: 2 })
    })

    it('evaluates series and best1RM in lb when active profile unit is switched to lb', () => {
      const lbState = { ...multiUnitState, unit: 'lb' }
      const pts = e1rmSeries(lbState, 'bench')
      expect(pts).toHaveLength(2)
      expect(pts[0].y).toBe(175) // 150 lb unchanged
      expect(pts[1].y).toBe(257.2) // 100 kg scaled to lb
      const best = best1RM(lbState, 'bench')
      expect(best).toEqual({ est: 257.2, w: 220.5, r: 5, d: '2026-01-15', t: 2 })
    })
  })

  describe('is1RMRecord with mixed units', () => {
    const historicalLbState = {
      unit: 'kg',
      workouts: [
        { d: '2025-10-01', start: 1, unit: 'lb', entries: [{ id: 'bench', sets: [{ w: 150, r: 5, done: true }] }] },
      ]
    }

    it('prevents PR suppression when user switches from lb to kg', () => {
      // Historical: 150 lb x 5 -> est 175.0 lb = 79.4 kg
      // Active workout: 100 kg x 5 -> est 116.7 kg.
      // Raw comparison: 116.7 < 175.0 (suppressed without unit awareness!).
      // Normalized: 116.7 > 79.4 -> valid PR established!
      const activeEntry = { id: 'bench', sets: [{ w: 100, r: 5, done: true, unit: 'kg' }] }
      const rec = is1RMRecord(historicalLbState, 'bench', activeEntry)
      expect(rec).not.toBeNull()
      expect(rec.est).toBe(116.7)
      expect(rec.prev).toBe(79.4)
    })

    it('prevents false PR when user switches from kg to lb', () => {
      const historicalKgState = {
        unit: 'lb',
        workouts: [
          { d: '2025-10-01', start: 1, unit: 'kg', entries: [{ id: 'bench', sets: [{ w: 100, r: 5, done: true }] }] },
        ]
      }
      // Historical: 100 kg x 5 -> est 116.7 kg = 257.2 lb
      // Active: 180 lb x 5 -> est 210.0 lb (numerically 210 > 116.7, but physically 210 lb < 257.2 lb)
      const activeEntry = { id: 'bench', sets: [{ w: 180, r: 5, done: true, unit: 'lb' }] }
      const rec = is1RMRecord(historicalKgState, 'bench', activeEntry)
      expect(rec).toBeNull()
    })
  })
})

