import { describe, it, expect } from 'vitest'
import {
  LB_TO_KG,
  round1,
  sanitizeUnit,
  normalizeWeight,
  resolveSetWeight,
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
      // Set unit wins over entry and workout
      expect(resolveSetWeight({ w: 100, unit: 'lb' }, { unit: 'kg' }, { unit: 'kg' }, 'kg')).toBe(45.4)
      // Entry unit wins over workout and target
      expect(resolveSetWeight({ w: 100 }, { unit: 'lb' }, { unit: 'kg' }, 'kg')).toBe(45.4)
      // Workout unit wins over target
      expect(resolveSetWeight({ w: 100 }, {}, { unit: 'lb' }, 'kg')).toBe(45.4)
      // Fallback to targetUnit
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
