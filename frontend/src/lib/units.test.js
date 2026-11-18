import { describe, it, expect } from 'vitest'
import { produce } from 'immer'
import {
  LB_TO_KG,
  round1,
  sanitizeUnit,
  normalizeWeight,
  resolveSetWeight,
  targetIn,
  setIn,
  switchUnit,
} from './units.js'

describe('units module', () => {
  describe('constants & rounding', () => {
    it('exports canonical LB_TO_KG conversion constant', () => {
      expect(LB_TO_KG).toBeCloseTo(0.45359237, 8)
    })

    it('rounds numbers to 1 decimal place', () => {
      expect(round1(45.359237)).toBe(45.4)
      expect(round1(100)).toBe(100)
      expect(round1(100.04)).toBe(100)
      expect(round1(100.06)).toBe(100.1)
      expect(round1(0)).toBe(0)
    })
  })

  describe('sanitizeUnit', () => {
    it('normalizes kilograms variants to kg', () => {
      expect(sanitizeUnit('kg')).toBe('kg')
      expect(sanitizeUnit('KG')).toBe('kg')
      expect(sanitizeUnit('  Kg  ')).toBe('kg')
      expect(sanitizeUnit('kilogram')).toBe('kg')
      expect(sanitizeUnit('kilograms')).toBe('kg')
    })

    it('normalizes pounds variants and aliases to lb', () => {
      expect(sanitizeUnit('lb')).toBe('lb')
      expect(sanitizeUnit('LB')).toBe('lb')
      expect(sanitizeUnit('lbs')).toBe('lb')
      expect(sanitizeUnit('LBS')).toBe('lb')
      expect(sanitizeUnit('  lbs  ')).toBe('lb')
      expect(sanitizeUnit('pound')).toBe('lb')
      expect(sanitizeUnit('pounds')).toBe('lb')
    })

    it('falls back to kg on nullish, empty, or unknown strings', () => {
      expect(sanitizeUnit(null)).toBe('kg')
      expect(sanitizeUnit(undefined)).toBe('kg')
      expect(sanitizeUnit('')).toBe('kg')
      expect(sanitizeUnit('stones')).toBe('kg')
    })
  })

  describe('normalizeWeight', () => {
    it('returns load unchanged when units match', () => {
      expect(normalizeWeight(80, 'kg', 'kg')).toBe(80)
      expect(normalizeWeight(175, 'lb', 'lb')).toBe(175)
      expect(normalizeWeight(175, 'lbs', 'lb')).toBe(175)
    })

    it('converts pounds to kilograms with 1-decimal rounding', () => {
      expect(normalizeWeight(100, 'lb', 'kg')).toBe(45.4)
      expect(normalizeWeight(220.462, 'lb', 'kg')).toBe(100)
      expect(normalizeWeight(150, 'lbs', 'kg')).toBe(68)
    })

    it('converts kilograms to pounds with 1-decimal rounding', () => {
      expect(normalizeWeight(100, 'kg', 'lb')).toBe(220.5)
      expect(normalizeWeight(80, 'kg', 'lb')).toBe(176.4)
      expect(normalizeWeight(45.359237, 'kg', 'lb')).toBe(100)
    })

    it('handles zero, negative, and non-numeric values safely', () => {
      expect(normalizeWeight(0, 'lb', 'kg')).toBe(0)
      expect(normalizeWeight(null, 'lb', 'kg')).toBe(0)
      expect(normalizeWeight(undefined, 'lb', 'kg')).toBe(0)
      expect(normalizeWeight(NaN, 'lb', 'kg')).toBe(0)
      expect(normalizeWeight('not-a-number', 'lb', 'kg')).toBe(0)
    })
  })

  describe('resolveSetWeight', () => {
    it('resolves load from set directly when units match', () => {
      expect(resolveSetWeight({ w: 80, unit: 'kg' }, null, null, 'kg')).toBe(80)
      expect(resolveSetWeight({ w: 175, unit: 'lb' }, null, null, 'lb')).toBe(175)
    })

    it('converts set.unit to targetUnit', () => {
      expect(resolveSetWeight({ w: 100, unit: 'lb' }, null, null, 'kg')).toBe(45.4)
      expect(resolveSetWeight({ w: 80, unit: 'kg' }, null, null, 'lb')).toBe(176.4)
    })

    it('follows unit cascade: set > entry > workout > targetUnit', () => {
      expect(resolveSetWeight({ w: 100, unit: 'lb' }, { unit: 'kg' }, { unit: 'kg' }, 'kg')).toBe(45.4)
      expect(resolveSetWeight({ w: 100 }, { unit: 'lb' }, { unit: 'kg' }, 'kg')).toBe(45.4)
      expect(resolveSetWeight({ w: 100 }, {}, { unit: 'lb' }, 'kg')).toBe(45.4)
      expect(resolveSetWeight({ w: 100 }, null, null, 'kg')).toBe(100)
    })

    it('normalizes alias unit strings in cascade', () => {
      expect(resolveSetWeight({ w: 100, unit: 'LBS' }, null, null, 'kg')).toBe(45.4)
      expect(resolveSetWeight({ w: 100 }, { unit: 'lbs' }, null, 'kg')).toBe(45.4)
      expect(resolveSetWeight({ w: 100 }, null, { unit: 'pounds' }, 'kg')).toBe(45.4)
    })

    it('handles non-numeric and null set safely', () => {
      expect(resolveSetWeight(null)).toBe(0)
      expect(resolveSetWeight({})).toBe(0)
      expect(resolveSetWeight({ w: null })).toBe(0)
      expect(resolveSetWeight({ w: undefined })).toBe(0)
      expect(resolveSetWeight({ w: NaN })).toBe(0)
    })
  })
})

describe('targetIn: a Target (ExCfg) in another unit', () => {
  it('converts weight and the load step, rounded like normalizeWeight', () => {
    const cfg = { id: 'bench', sets: 3, reps: 5, weight: 60, inc: 2.5 }
    expect(targetIn(cfg, 'kg', 'lb')).toEqual({ id: 'bench', sets: 3, reps: 5, weight: 132.3, inc: 5.5 })
    expect(cfg.weight).toBe(60)
  })

  it('keeps a time-Mode step, which is seconds, and converts its weight', () => {
    const cfg = { id: 'plank', mode: 'time', sec: 45, weight: 10, inc: 5 }
    expect(targetIn(cfg, 'kg', 'lb')).toEqual({ id: 'plank', mode: 'time', sec: 45, weight: 22, inc: 5 })
  })

  it('converts a negative (assisted) weight and leaves absent or zero loads alone', () => {
    expect(targetIn({ id: 'dip', weight: -20 }, 'kg', 'lb').weight).toBe(-44.1)
    expect(targetIn({ id: 'dip', weight: 0 }, 'kg', 'lb')).toEqual({ id: 'dip', weight: 0 })
    expect(targetIn({ id: 'row', reps: 8 }, 'kg', 'lb')).toEqual({ id: 'row', reps: 8 })
  })

  it('returns the same object when nothing changes', () => {
    const cfg = { id: 'bench', weight: 60 }
    expect(targetIn(cfg, 'kg', 'kg')).toBe(cfg)
    expect(targetIn(cfg, 'kgs', 'KG')).toBe(cfg)
    expect(targetIn(null, 'kg', 'lb')).toBe(null)
  })
})

describe('setIn: one logged row in another unit', () => {
  it('converts the load from the row stamp, else the given unit', () => {
    expect(setIn({ w: 100, r: 5, done: true }, 'kg', 'lb')).toEqual({ w: 220.5, r: 5, done: true })
    expect(setIn({ w: 100, r: 5, unit: 'lb' }, 'kg', 'kg')).toEqual({ w: 45.4, r: 5, unit: 'kg' })
  })

  it('returns the same row when there is no load or no change', () => {
    const cardio = { min: 20, speed: 8, done: true }
    const kg = { w: 60, r: 5 }
    expect(setIn(cardio, 'kg', 'lb')).toBe(cardio)
    expect(setIn(kg, 'kg', 'kg')).toBe(kg)
  })
})

describe('switchUnit: the Settings switch (ADR 0031)', () => {
  const profile = () => ({
    unit: 'kg',
    targetW: 75,
    routines: [{ id: 'push', name: 'Push', ex: [
      { id: 'bench', sets: 3, reps: 5, weight: 60, inc: 2.5 },
      { id: 'plank', mode: 'time', sets: 3, sec: 45, inc: 5 },
      { id: 'dip', sets: 3, reps: 8, weight: -20, bodyweight: true },
    ] }],
    workouts: [
      { id: 'w1', d: '2026-11-01', unit: 'kg', bw: 80, entries: [{ id: 'bench', sets: [{ w: 60, r: 5, done: true }] }] },
      { id: 'w2', d: '2026-11-03', bw: 81, entries: [{ id: 'bench', sets: [{ w: 62.5, r: 5, done: true }] }] },
      { id: 'w3', d: '2026-11-05', unit: 'lb', entries: [{ id: 'bench', sets: [{ w: 135, r: 5, done: true }] }] },
    ],
    bodyweight: [{ d: '2026-11-01', w: 80, t: 1 }, { d: '2026-11-02', w: 176, t: 2, unit: 'lb' }],
    active: null,
  })

  it('converts the plan and the Goal weight in place', () => {
    const S = profile()
    expect(switchUnit(S, 'lb')).toBe(true)
    expect(S.unit).toBe('lb')
    expect(S.targetW).toBe(165.3)
    expect(S.routines[0].ex).toEqual([
      { id: 'bench', sets: 3, reps: 5, weight: 132.3, inc: 5.5 },
      { id: 'plank', mode: 'time', sets: 3, sec: 45, inc: 5 },
      { id: 'dip', sets: 3, reps: 8, weight: -44.1, bodyweight: true },
    ])
  })

  it('never rewrites a logged number, and stamps unstamped logs with the outgoing unit', () => {
    const S = profile()
    switchUnit(S, 'lb')
    expect(S.workouts.map(w => w.unit)).toEqual(['kg', 'kg', 'lb'])
    expect(S.workouts.map(w => w.bw ?? null)).toEqual([80, 81, null])
    expect(S.workouts.map(w => w.entries[0].sets[0].w)).toEqual([60, 62.5, 135])
    expect(S.bodyweight).toEqual([{ d: '2026-11-01', w: 80, t: 1, unit: 'kg' }, { d: '2026-11-02', w: 176, t: 2, unit: 'lb' }])
  })

  it('round-trips a kg plan exactly', () => {
    const S = profile()
    switchUnit(S, 'lb')
    switchUnit(S, 'kg')
    expect(S.unit).toBe('kg')
    expect(S.targetW).toBe(75)
    expect(S.routines).toEqual(profile().routines)
  })

  it('leaves a missing Goal weight missing', () => {
    const S = { ...profile(), targetW: null }
    switchUnit(S, 'lb')
    expect(S.targetW).toBe(null)
  })

  it('refuses while a workout is active, and changes nothing', () => {
    const S = { ...profile(), active: { id: 'a', unit: 'kg', entries: [] } }
    const before = structuredClone(S)
    expect(switchUnit(S, 'lb')).toBe(false)
    expect(S).toEqual(before)
  })

  it('does nothing when the unit is already in force', () => {
    const S = profile()
    const before = structuredClone(S)
    expect(switchUnit(S, 'kg')).toBe(false)
    expect(S).toEqual(before)
  })

  it('reads a Profile with no unit as kg and tolerates missing collections', () => {
    const S = { routines: [{ id: 'r', ex: [{ id: 'bench', weight: 100 }] }] }
    expect(switchUnit(S, 'lb')).toBe(true)
    expect(S.routines[0].ex[0].weight).toBe(220.5)
    expect(S.unit).toBe('lb')
  })

  it('works on an immer draft, leaving untouched branches shared', () => {
    const base = profile()
    base.workouts[1].unit = 'kg'
    const next = produce(base, d => { switchUnit(d, 'lb') })
    expect(next.unit).toBe('lb')
    expect(next.routines[0].ex[0].weight).toBe(132.3)
    expect(next.workouts).toBe(base.workouts)
    expect(base.routines[0].ex[0].weight).toBe(60)
  })
})
