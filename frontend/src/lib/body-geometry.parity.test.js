import { describe, it, expect } from 'vitest'
import bodyPaths from './body-paths.js'
import { MUSCLES, levelsOf } from './muscles.js'

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

    expect(bothLoad.lats).toBe(4)
    expect(bothLoad['upper-back']).toBe(4)
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

      const latsSet = new Set(latsPaths.map(s => s.trim()))
      for (const d of upperPaths) {
        expect(latsSet.has(d.trim())).toBe(false)
      }

      const vb = back.vb.trim().split(/\s+/)
      expect(vb.length).toBe(4)
      vb.forEach(n => expect(Number.isFinite(Number(n))).toBe(true))

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
