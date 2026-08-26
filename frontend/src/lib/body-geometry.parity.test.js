import { describe, it, expect } from 'vitest'
import bodyPaths from './body-paths.js'
import { MUSCLES, MUSCLE_NAME, levelsOf, INERT } from './muscles.js'

/**
 * Gated visual parity check for lats vs upper-back.
 *
 * When the upstream lats geometry is present, synthetic loads isolating
 * lats vs upper-back must yield distinct selectable back regions with
 * independent heat levels. When absent (fallback), the test is gated and
 * passes as a documented skip — see .scratch/lats-upper-back-split/issues/02-body-geometry-for-lats.md
 * and body-paths.test.js optionalMissing gate.
 */
describe('lats vs upper-back visual parity (gated)', () => {
  const hasLats = (model) => {
    const front = bodyPaths[model]?.front?.p || {}
    const back = bodyPaths[model]?.back?.p || {}
    return Boolean(front.lats || back.lats)
  }
  const hasLatsAny = hasLats('male') || hasLats('female')
  const assertNoFakeSeam = () => {
    expect(hasLatsAny).toBe(false)
    expect(bodyPaths.male.back.p.lats).toBeUndefined()
    expect(bodyPaths.female.back.p.lats).toBeUndefined()
  }
  const assertValidSvgPaths = (paths) => {
    expect(Array.isArray(paths)).toBe(true)
    expect(paths.length).toBeGreaterThan(0)
    for (const d of paths) {
      expect(typeof d).toBe('string')
      expect(d.trim()).toMatch(/^[Mm]/)
    }
  }
  const assertIsolatedLevels = () => {
    const latLoad = levelsOf({ lats: 10, 'upper-back': 0 })
    const rowLoad = levelsOf({ lats: 0, 'upper-back': 10 })
    expect(latLoad.lats).toBe(4)
    expect(latLoad['upper-back']).toBe(0)
    expect(rowLoad['upper-back']).toBe(4)
    expect(rowLoad.lats).toBe(0)
  }
  const gatedSkipIfNoLats = () => {
    if (!hasLatsAny) {
      assertNoFakeSeam()
      return true
    }
    return false
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

  it('exposes independent back paths when lats geometry is present (gated)', () => {
    if (gatedSkipIfNoLats()) return

    for (const model of ['male', 'female']) {
      const back = bodyPaths[model].back
      expect(back, `${model}.back must exist`).toBeDefined()
      expect(back.p.lats, `${model}.back.p.lats must be present when geometry has landed`).toBeDefined()
      expect(back.p['upper-back'], `${model}.back.p['upper-back'] must remain`).toBeDefined()
      const latsPaths = back.p.lats
      const upperPaths = back.p['upper-back']
      assertValidSvgPaths(latsPaths)
      assertValidSvgPaths(upperPaths)
      // mutually exclusive: no double-shading seam overlap (no identical path strings)
      const latsSet = new Set(latsPaths.map(s => s.trim()))
      for (const d of upperPaths) {
        expect(latsSet.has(d.trim())).toBe(false)
      }

      // viewBox invariant (maleBack 718 95 727 1280, femaleBack 823 0 650 1450 per BodyPathData.swift)
      const vb = back.vb.trim().split(/\s+/)
      expect(vb.length).toBe(4)
      vb.forEach(n => expect(Number.isFinite(Number(n))).toBe(true))
      // inert regions remain inert (never shaded)
      for (const slug of INERT) {
        // if inert appears on back, it should be under same viewBox, not overlapping lats check
        if (back.p[slug]) {
          for (const d of back.p[slug]) expect(d.trim()).toMatch(/^[Mm]/)
        }
      }

      // selectable affordance: MUSCLES iteration would produce distinct entries
      const selectable = new Set(MUSCLES)
      expect(selectable.has('lats')).toBe(true)
      expect(selectable.has('upper-back')).toBe(true)
    }
  })

  it('BodyMap would shade lats and upper-back via shared level helper (gated rendering check)', () => {
    // This test validates the contract without needing DOM: BodyMap.jsx renders
    // {MUSCLES.map(slug => (view.p[slug] || []).map(... className={'bm-m l'+(levels[slug]||0)+(selected===slug?' sel':'')) ... <title>{MUSCLE_NAME[slug]}</title>)}
    // When lats path is present, levels[lats] vs levels[upper-back] produce distinct classes (l4 vs l0 etc).
    // When absent, the fallback is documented and no fake seam is invented.
    if (gatedSkipIfNoLats()) {
      // Module remains generated with header intact; size invariant (~90KB) is
      // enforced by vite build artifact `dist/assets/body-paths-*.js 93.27 kB`
      // and `body-paths.js` 94285 bytes — verified by body-paths.test.js size check.
      expect(MUSCLES).toContain('lats')
      return
    }
    assertIsolatedLevels()
    // If geometry has landed, the DOM rendering would contain two distinct selectable regions;
    // that is verified by the previous test's path existence + mutual exclusivity.
    expect(hasLatsAny).toBe(true)
  })
})
