import { describe, it, expect } from 'vitest'
import bodyPaths from './body-paths.js'
import { MUSCLES, MUSCLE_NAME, levelsOf, INERT } from './muscles.js'

/**
 * Visual parity check for lats vs upper-back.
 *
 * Synthetic loads isolating lats vs upper-back must yield distinct
 * selectable back regions with independent heat levels on both models.
 */
describe('lats vs upper-back visual parity', () => {
  const assertIsolatedLevels = () => {
    const latLoad = levelsOf({ lats: 10, 'upper-back': 0 })
    const rowLoad = levelsOf({ lats: 0, 'upper-back': 10 })
    expect(latLoad.lats).toBe(4)
    expect(latLoad['upper-back']).toBe(0)
    expect(rowLoad['upper-back']).toBe(4)
    expect(rowLoad.lats).toBe(0)
  }

  it('produces distinct heat levels for isolated lats vs upper-back loads', () => {
    assertIsolatedLevels()
    const bothLoad = levelsOf({ lats: 5, 'upper-back': 5 })

    // when both present and equal, both should be hot
    expect(bothLoad.lats).toBe(4)
    expect(bothLoad['upper-back']).toBe(4)
    expect(MUSCLE_NAME.lats).toBe('Lats')
    expect(MUSCLE_NAME['upper-back']).toBe('Upper back')
    expect(MUSCLES.indexOf('lats')).toBe(MUSCLES.indexOf('upper-back') + 1)
  })

  it('exposes independent, mutually exclusive back paths for lats and upper-back on both models', () => {
    for (const model of ['male', 'female']) {
      const back = bodyPaths[model].back
      expect(back, `${model}.back must exist`).toBeDefined()
      expect(back.p.lats, `${model}.back.p.lats must be present`).toBeDefined()
      expect(back.p['upper-back'], `${model}.back.p['upper-back'] must remain`).toBeDefined()
      const latsPaths = back.p.lats
      const upperPaths = back.p['upper-back']

      expect(latsPaths.length).toBeGreaterThan(0)
      expect(upperPaths.length).toBeGreaterThan(0)

      // mutually exclusive: no double-shading seam overlap (no identical path strings)
      const latsSet = new Set(latsPaths.map(s => s.trim()))
      for (const d of upperPaths) {
        expect(latsSet.has(d.trim())).toBe(false)
      }

      // viewBox invariant (maleBack 718 95 727 1280, femaleBack 823 0 650 1450 per BodyPathData.swift)
      const vb = back.vb.trim().split(/\s+/)
      expect(vb.length).toBe(4)
      vb.forEach(n => expect(Number.isFinite(Number(n))).toBe(true))

      // selectable affordance: MUSCLES iteration contains both
      const selectable = new Set(MUSCLES)
      expect(selectable.has('lats')).toBe(true)
      expect(selectable.has('upper-back')).toBe(true)
    }
  })

  it('shades lats and upper-back independently via shared level helper on BodyMap', () => {
    assertIsolatedLevels()
    expect(MUSCLES).toContain('lats')
    expect(MUSCLES).toContain('upper-back')
    expect(bodyPaths.male.back.p.lats.length).toBeGreaterThan(0)
    expect(bodyPaths.female.back.p.lats.length).toBeGreaterThan(0)
  })
})
