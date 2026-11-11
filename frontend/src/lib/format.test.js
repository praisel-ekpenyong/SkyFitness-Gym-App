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
  fmtSigned,
  fmtDurParts,
  sentenceCase,
  MINUS,
  exCount,
  weekKey,
  localTZ,
  uid,
  ACCENTS,
  fmtSec,
  fmtElapsed,
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

    it('fmtNum puts a thousands separator in every count and load', () => {
      expect(fmtNum(1324)).toBe('1,324')
      expect(fmtNum(16910)).toBe('16,910')
      expect(fmtNum(1234.56)).toBe('1,234.6')
      expect(fmtVol(8200, 'kg')).toBe('8,200 kg')
    })

    it('exCount formats plural forms correctly', () => {
      expect(exCount(1)).toBe('1 exercise')
      expect(exCount(5)).toBe('5 exercises')
    })
  })

  describe('fmtSigned: the one way a signed figure is written', () => {
    it('writes a loss with the U+2212 minus sign, never a hyphen or an en dash', () => {
      expect(MINUS).toBe('−')
      expect(fmtSigned(-0.2)).toBe('−0.2')
      expect(fmtSigned(-15)).toBe('−15')
      expect(fmtSigned(-0.2)).not.toMatch(/[-–]/)
    })

    it('writes a gain with an explicit plus', () => {
      expect(fmtSigned(2.5)).toBe('+2.5')
      expect(fmtSigned(15)).toBe('+15')
    })

    it('gives zero, and anything that rounds to it, no sign at all', () => {
      expect(fmtSigned(0)).toBe('0')
      expect(fmtSigned(-0)).toBe('0')
      expect(fmtSigned(0.04)).toBe('0')
      expect(fmtSigned(-0.04)).toBe('0')
      expect(fmtSigned(-20000, n => fmtVol(n, 'kg'))).toBe('−20,000 kg')
      expect(fmtSigned(-30000, fmtDur)).toBe('0 min')
    })

    it('keeps the thousands separator and the one-decimal rounding of fmtNum', () => {
      expect(fmtSigned(1250)).toBe('+1,250')
      expect(fmtSigned(-1234.56)).toBe('−1,234.6')
    })

    it('signs whatever the magnitude formatter writes: volume, duration, percent', () => {
      expect(fmtSigned(-2500, n => fmtVol(n, 'kg'))).toBe('−2,500 kg')
      expect(fmtSigned(-5400000, fmtDur)).toBe('−1h 30m')
      expect(fmtSigned(12, n => fmtNum(n) + '%')).toBe('+12%')
    })

    it('treats junk as zero', () => {
      expect(fmtSigned(undefined)).toBe('0')
      expect(fmtSigned(NaN)).toBe('0')
      expect(fmtSigned(null)).toBe('0')
    })
  })

  describe('fmtDurParts: a duration as figure and unit pairs', () => {
    it('splits the same text fmtDur writes, so a tile can set the unit small', () => {
      expect(fmtDurParts(120000)).toEqual([['2', ' min']])
      expect(fmtDurParts(5400000)).toEqual([['1', 'h'], ['30', 'm']])
      expect(fmtDurParts(45000)).toEqual([['0', ' min']])
      for (const ms of [0, 45000, 120000, 3600000, 5400000, 7260000]) {
        expect(fmtDurParts(ms).map(p => p.join('')).join(' ')).toBe(fmtDur(ms))
      }
    })
  })

  describe('sentenceCase: dataset names as labels', () => {
    it('lifts only the first letter, never each word', () => {
      expect(sentenceCase('body weight')).toBe('Body weight')
      expect(sentenceCase('leverage machine')).toBe('Leverage machine')
      expect(sentenceCase('Upper back')).toBe('Upper back')
      expect(sentenceCase('')).toBe('')
    })

    it('keeps the names that are not ordinary words', () => {
      expect(sentenceCase('ez barbell')).toBe('EZ barbell')
      expect(sentenceCase('bosu ball')).toBe('BOSU ball')
      expect(sentenceCase('skierg machine')).toBe('SkiErg machine')
    })

    it('never capitalises a unit', () => {
      expect(sentenceCase('60 kg')).toBe('60 kg')
      expect(sentenceCase('kg')).toBe('kg')
      expect(sentenceCase('lb')).toBe('lb')
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
      expect(ACCENTS.lime).toBe('#a3e635')
      expect(ACCENTS.sky).toBe('#5cb8ff')
      expect(ACCENTS.orange).toBe('#ff8a3d')
      expect(ACCENTS.violet).toBe('#b79cff')
    })
  })

  describe('fmtSec time formatting', () => {
    it('formats seconds into mm:ss format', () => {
      expect(fmtSec(0)).toBe('0:00')
      expect(fmtSec(9)).toBe('0:09')
      expect(fmtSec(45)).toBe('0:45')
      expect(fmtSec(90)).toBe('1:30')
      expect(fmtSec(605)).toBe('10:05')
      expect(fmtSec(0.5)).toBe('0:01')
      expect(fmtSec(59.5)).toBe('1:00')
    })

    it('guards against null, negative, and non-numeric inputs', () => {
      expect(fmtSec(-10)).toBe('0:00')
      expect(fmtSec(null)).toBe('0:00')
      expect(fmtSec(undefined)).toBe('0:00')
      expect(fmtSec(NaN)).toBe('0:00')
    })
  })

  describe('fmtElapsed time formatting', () => {
    it('floors elapsed seconds so the clock never shows time that has not passed', () => {
      expect(fmtElapsed(0.5)).toBe('0:00')
      expect(fmtElapsed(59.5)).toBe('0:59')
      expect(fmtElapsed(60.4)).toBe('1:00')
      expect(fmtElapsed(-1)).toBe('0:00')
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
