import { describe, it, expect } from 'vitest'
import bodyPaths from './body-paths.js'
import { MUSCLES, INERT } from './muscles.js'

const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz][MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/

describe('body-paths SVG geometry', () => {
  const models = ['male', 'female']
  const views = ['front', 'back']
  const allKnownSlugs = new Set([...MUSCLES, ...INERT])

  it('exports valid structures for male and female front and back models', () => {
    expect(bodyPaths).toBeDefined()
    models.forEach(model => {
      expect(bodyPaths[model]).toBeDefined()
      views.forEach(view => {
        const entry = bodyPaths[model][view]
        expect(entry).toBeDefined()
        expect(typeof entry.vb).toBe('string')
        const vbParts = entry.vb.trim().split(/\s+/)
        expect(vbParts.length).toBe(4)
        vbParts.forEach(num => expect(Number.isFinite(Number(num))).toBe(true))
        expect(typeof entry.p).toBe('object')
      })
    })
  })

  it('contains valid SVG path command strings for every part', () => {
    models.forEach(model => {
      views.forEach(view => {
        const parts = bodyPaths[model][view].p
        Object.entries(parts).forEach(([slug, paths]) => {
          expect(Array.isArray(paths)).toBe(true)
          expect(paths.length).toBeGreaterThan(0)
          paths.forEach(d => {
            expect(typeof d).toBe('string')
            expect(d.trim().length).toBeGreaterThan(0)
            expect(d.trim()).toMatch(/^[Mm]/)
          })
        })
      })
    })
  })

  it('maps only known MUSCLES and INERT anatomical slugs without unknown keys', () => {
    models.forEach(model => {
      views.forEach(view => {
        const parts = bodyPaths[model][view].p
        Object.keys(parts).forEach(slug => {
          expect(allKnownSlugs.has(slug)).toBe(true)
        })
      })
    })
  })

  it('holds drawable, well-formed SVG data on both models', () => {
    models.forEach(model => {
      views.forEach(view => {
        const { vb, p } = bodyPaths[model][view]
        const [, , width, height] = vb.trim().split(/\s+/).map(Number)
        expect(width, `${model} ${view} viewBox width`).toBeGreaterThan(0)
        expect(height, `${model} ${view} viewBox height`).toBeGreaterThan(0)
        const slugs = Object.keys(p)
        expect(slugs.length, `${model} ${view} parts`).toBeGreaterThan(0)
        slugs.forEach(slug => {
          expect(p[slug].length, `${model} ${view} ${slug} paths`).toBeGreaterThan(0)
          p[slug].forEach(d => {
            expect(d, `${model} ${view} ${slug} path tokens`).toMatch(PATH_DATA)
            expect(d, `${model} ${view} ${slug} coordinates`).toMatch(/[0-9]/)
          })
        })
      })
    })
  })

  it('ensures every drawable muscle in MUSCLES is present on both body models', () => {
    models.forEach(model => {
      const frontSlugs = Object.keys(bodyPaths[model].front.p)
      const backSlugs = Object.keys(bodyPaths[model].back.p)
      const combinedSlugs = new Set([...frontSlugs, ...backSlugs])

      MUSCLES.forEach(muscle => {
        expect(combinedSlugs.has(muscle), `Expected muscle "${muscle}" to be present in ${model} model`).toBe(true)
      })
    })
  })
})
