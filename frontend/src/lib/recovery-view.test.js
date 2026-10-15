import { describe, expect, it } from 'vitest'
import { FATIGUE_STATES, fatigueOf, strengthOf, fatigueStateOf } from './recovery.js'
import { FATIGUE_LEVELS } from './recovery-view.js'
import { MUSCLES, levelsOf } from './muscles.js'

const STRENGTH_BANDS = [
  { at: 0.5, level: 0 },
  { at: 0.625, level: 1 },
  { at: 0.75, level: 2 },
  { at: 0.875, level: 3 },
  { at: 1, level: 4 },
]

describe('production recovery view selectors', () => {
  it('preserves the relative balance scale when no thresholds are supplied', () => {
    const levels = levelsOf({ chest: 10, biceps: 5 })
    expect(levels.chest).toBe(4)
    expect(levels.biceps).toBe(2)
  })

  it('uses the production fatigue selector at both approved boundaries', () => {
    expect(fatigueStateOf(0.2499)).toBe(FATIGUE_STATES.READY)
    expect(fatigueStateOf(0.25)).toBe(FATIGUE_STATES.RECOVERING)
    expect(fatigueStateOf(0.5)).toBe(FATIGUE_STATES.RECOVERING)
    expect(fatigueStateOf(0.5001)).toBe(FATIGUE_STATES.FATIGUED)
    expect(fatigueStateOf(null)).toBe(FATIGUE_STATES.READY)
    expect(fatigueStateOf(undefined)).toBe(FATIGUE_STATES.READY)
    expect(fatigueStateOf(NaN)).toBe(FATIGUE_STATES.READY)
  })

  it('renders Fatigue bands on the canonical bucket stops rather than relative to the map maximum', () => {
    const levels = levelsOf({
      chest: 0.25,
      biceps: 0.6,
      triceps: 0.1,
    }, FATIGUE_LEVELS)
    expect(levels.chest).toBe(2)
    expect(levels.biceps).toBe(4)
    expect(levels.triceps).toBe(0)
  })

  it('Fatigue Muscle map shade and inspector label agree at the canonical boundaries', () => {
    // Ready below 0.25 shades l0/l1, recovering through 0.5 shades l2/l3, fatigued
    // above shades l4 — the same agreement the Strength view pins through its bands.
    const probes = [
      { value: 0.2499, label: 'ready', levels: [0, 1] },
      { value: 0.25, label: 'recovering', levels: [2, 3] },
      { value: 0.5, label: 'recovering', levels: [2, 3] },
      { value: 0.5001, label: 'fatigued', levels: [4] },
    ]
    for (const { value, label, levels } of probes) {
      expect(fatigueStateOf(value)).toBe(label)
      expect(levels).toContain(levelsOf({ chest: value }, FATIGUE_LEVELS).chest)
    }
  })

  it('renders strength on fixed .5-to-1 bands with full retention at l4', () => {
    const levels = levelsOf({ chest: 0.9, biceps: 1, triceps: 0.5 }, STRENGTH_BANDS)
    expect(levels.chest).toBe(3)
    expect(levels.biceps).toBe(4)
    expect(levels.triceps).toBe(0)
  })

  it('keeps selectors tied to the same render-time clock', () => {
    const now = Date.UTC(2026, 0, 22)
    const workout = { start: now - 15 * 86400000, d: '2026-01-07', entries: [] }
    expect(strengthOf([workout], now).chest).toBe(0.5)
    expect(fatigueOf([workout], now).chest).toBe(0)
    expect(strengthOf([workout], now + 7 * 86400000).chest).toBe(0.5)
  })
})
