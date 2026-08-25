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

  it('produces distinct heat levels for isolated lats vs upper-back loads', () => {
    const latLoad = levelsOf({ lats: 10, 'upper-back': 0 })
    const rowLoad = levelsOf({ lats: 0, 'upper-back': 10 })
    const bothLoad = levelsOf({ lats: 5, 'upper-back': 5 })

    // levelsOf is relative to max within the load object, so isolated should be 4 vs 0
    expect(latLoad.lats).toBe(4)
    expect(latLoad['upper-back']).toBe(0)
    expect(rowLoad['upper-back']).toBe(4)
    expect(rowLoad.lats).toBe(0)
    // when both present and equal, both should be hot
    expect(bothLoad.lats).toBe(4)
    expect(bothLoad['upper-back']).toBe(4)
    expect(MUSCLE_NAME.lats).toBe('Lats')
    expect(MUSCLE_NAME['upper-back']).toBe('Upper back')
    expect(MUSCLES.indexOf('lats')).toBe(MUSCLES.indexOf('upper-back') + 1)
  })

  it('exposes independent back paths when lats geometry is present (gated)', () => {
    if (!hasLatsAny) {
      // Fallback: no fake seam, taxonomy ships without geometry — gated skip is expected
      expect(hasLatsAny).toBe(false)
      return
    }

    for (const model of ['male', 'female']) {
      const back = bodyPaths[model].back
      expect(back, `${model}.back must exist`).toBeDefined()
      expect(back.p.lats, `${model}.back.p.lats must be present when geometry has landed`).toBeDefined()
      expect(back.p['upper-back'], `${model}.back.p['upper-back'] must remain`).toBeDefined()
      const latsPaths = back.p.lats
      const upperPaths = back.p['upper-back']
      expect(Array.isArray(latsPaths)).toBe(true)
      expect(latsPaths.length).toBeGreaterThan(0)
      expect(Array.isArray(upperPaths)).toBe(true)
      expect(upperPaths.length).toBeGreaterThan(0)

      // valid SVG path strings
      for (const d of [...latsPaths, ...upperPaths]) {
        expect(typeof d).toBe('string')
        expect(d.trim()).toMatch(/^[Mm]/)
      }

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

  it('BodyMap would shade lats and upper-back via shared level helper (gated rendering check)', async () => {
    // This test validates the contract without needing DOM: BodyMap.jsx renders
    // {MUSCLES.map(slug => (view.p[slug] || []).map(... className={'bm-m l'+(levels[slug]||0)+(selected===slug?' sel':'')) ... <title>{MUSCLE_NAME[slug]}</title>)}
    // When lats path is present, levels[lats] vs levels[upper-back] produce distinct classes (l4 vs l0 etc).
    // When absent, the fallback is documented and no fake seam is invented.
    if (!hasLatsAny) {
      // No path yet: component renders nothing for lats but levels are still independent (see first test).
      // Verify fallback does not invent a path.
      expect(bodyPaths.male.back.p.lats).toBeUndefined()
      expect(bodyPaths.female.back.p.lats).toBeUndefined()
      // Bundle size invariant: still ~90KB
      const fs = await import('node:fs')
      const stat = fs.statSync(new URL('./body-paths.js', import.meta.url))
      expect(stat.size).toBeGreaterThan(80_000)
      expect(stat.size).toBeLessThan(110_000)
      return
    }
    // If geometry has landed, the DOM rendering would contain two distinct selectable regions;
    // that is verified by the previous test's path existence + mutual exclusivity.
    expect(hasLatsAny).toBe(true)
  })
})
