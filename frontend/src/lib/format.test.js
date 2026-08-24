import { describe, it, expect } from 'vitest'
import {
  todayISO,
  isoOf,
  DAYN,
  DAYS,
  MONTHS,
  MONTHS_LONG,
  fmtDate,
  fmtDur,
  durPart,
  fmtNum,
  fmtVol,
  exCount,
  weekKey,
  localTZ,
  uid,
  ACCENTS,
  fmtSec,
  setLabel,
  exLine,
} from './format.js'
import { EXDB } from './exercises.js'

const BARBELL_BENCH = EXDB.find(e => e.bp === 'chest' && e.eq === 'barbell')?.id || '0025'
const CARDIO = EXDB.find(e => e.bp === 'cardio')?.id || '2330'
const BW = EXDB.find(e => e.eq === 'body weight')?.id || '0047'

describe('format utility module', () => {
  describe('dates and ISO strings', () => {
    it('generates valid YYYY-MM-DD for todayISO and isoOf', () => {
      const today = todayISO()
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      const specificDate = new Date(2026, 4, 9)
      expect(isoOf(specificDate)).toBe('2026-05-09')
    })

    it('formats dates consistently', () => {
      const short = fmtDate('2026-08-24', false)
      expect(short).toContain('24')
      expect(short).toContain('Aug')

      const long = fmtDate('2026-08-24', true)
      expect(long).toContain('Mon')
      expect(long).toContain('24')
    })

    it('exports calendar day and month constants', () => {
      expect(DAYN.length).toBe(7)
      expect(DAYS.length).toBe(7)
      expect(MONTHS.length).toBe(12)
      expect(MONTHS_LONG.length).toBe(12)
    })
  })

  describe('durations and numbers', () => {
    it('formats duration in minutes and hours', () => {
      expect(fmtDur(45000)).toBe('0 min')
      expect(fmtDur(120000)).toBe('2 min')
      expect(fmtDur(3600000)).toBe('1h 0m')
      expect(fmtDur(5400000)).toBe('1h 30m')
    })

    it('durPart filters out sub-minute noise', () => {
      expect(durPart(30000)).toEqual([])
      expect(durPart(120000)).toEqual(['2 min'])
    })

    it('fmtNum and fmtVol format numeric quantities and units', () => {
      expect(fmtNum(60)).toBe('60')
      expect(fmtNum(62.5)).toBe('62.5')
      expect(fmtVol(12000, 'kg')).toContain('12')
      expect(fmtVol(12000, 'kg')).toContain('kg')
    })

    it('exCount formats plural forms correctly', () => {
      expect(exCount(1)).toBe('1 exercise')
      expect(exCount(5)).toBe('5 exercises')
    })
  })

  describe('weekKey ISO calendar week calculations', () => {
    it('computes ISO week keys for dates throughout the year', () => {
      expect(weekKey('2026-01-05')).toBe('2026-2')
      expect(weekKey('2026-08-24')).toBe('2026-35')
      expect(weekKey('2026-12-28')).toBe('2026-53')
    })
  })

  describe('localTZ, uid, and ACCENTS', () => {
    it('returns a valid IANA timezone string or fallback', () => {
      const tz = localTZ()
      expect(typeof tz).toBe('string')
      expect(tz.length).toBeGreaterThan(0)
    })

    it('generates unique non-empty random IDs', () => {
      const id1 = uid()
      const id2 = uid()
      expect(id1).not.toBe(id2)
      expect(typeof id1).toBe('string')
    })

    it('exports all standard theme hex accents', () => {
      expect(ACCENTS.lime).toBe('#30d158')
      expect(ACCENTS.sky).toBe('#0a84ff')
      expect(ACCENTS.orange).toBe('#ff9f0a')
      expect(ACCENTS.violet).toBe('#bf5af2')
    })
  })

  describe('fmtSec time formatting', () => {
    it('formats seconds into mm:ss format', () => {
      expect(fmtSec(0)).toBe('0:00')
      expect(fmtSec(9)).toBe('0:09')
      expect(fmtSec(45)).toBe('0:45')
      expect(fmtSec(90)).toBe('1:30')
      expect(fmtSec(605)).toBe('10:05')
    })

    it('guards against null, negative, and non-numeric inputs', () => {
      expect(fmtSec(-10)).toBe('0:00')
      expect(fmtSec(null)).toBe('0:00')
      expect(fmtSec(undefined)).toBe('0:00')
      expect(fmtSec(NaN)).toBe('0:00')
    })
  })

  describe('setLabel and exLine', () => {
    it('setLabel formats reps, bodyweight, timed, and cardio sets', () => {
      expect(setLabel(BARBELL_BENCH, { w: 80, r: 10 })).toBe('80×10')
      expect(setLabel(BW, { w: 0, r: 15 }, { bodyweight: true })).toBe('15')
      expect(setLabel(BW, { w: 10, r: 12 }, { bodyweight: true })).toBe('+10 × 12')
      expect(setLabel(BARBELL_BENCH, { sec: 45, w: 0 }, { mode: 'time' })).toBe('0:45')
      expect(setLabel(CARDIO, { min: 20, speed: 10 })).toBe('20 min @ 10 km/h')
    })

    it('setLabel appends RIR or RPE effort tags', () => {
      expect(setLabel(BARBELL_BENCH, { w: 100, r: 5, rir: 2 })).toBe('100×5 (RIR 2)')
      expect(setLabel(BARBELL_BENCH, { w: 100, r: 5, rpe: 8.5 })).toBe('100×5 (RPE 8.5)')
    })

    it('exLine formats planned routine exercise lines', () => {
      expect(exLine({ sets: 3, reps: 10, weight: 60 }, 'kg')).toBe('3 × 10 · 60 kg')
      expect(exLine({ sets: 3, sec: 45, mode: 'time' }, 'kg')).toBe('3 × 0:45')
      expect(exLine({ sets: 1, min: 20, speed: 9, mode: 'cardio' }, 'kg')).toBe('1 × 20 min @ 9 km/h')
      expect(exLine({ sets: 3, reps: 16, weight: 0, side: true }, 'kg')).toBe('3 × 16 · 8/side')
    })
  })
})
