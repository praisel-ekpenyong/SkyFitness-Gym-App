import { describe, it, expect } from 'vitest'
import { BAR_WEIGHT, platesFor, plateCaption, plateTone } from './plates.js'

describe('platesFor', () => {
  it('loads the heaviest calibrated plates first, per side, on a 20 kg bar', () => {
    const load = platesFor(102.5, 'kg')
    expect(load.bar).toBe(20)
    expect(load.perSide).toEqual([25, 15, 1.25])
    expect(load.remainder).toBe(0)
    expect(load.belowBar).toBe(false)
  })

  it('uses pound plates on a 45 lb bar for a pound profile', () => {
    const load = platesFor(225, 'lb')
    expect(load.bar).toBe(45)
    expect(load.perSide).toEqual([45, 45])
  })

  it('treats a load equal to the bar as an empty bar', () => {
    expect(platesFor(20, 'kg')).toMatchObject({ perSide: [], remainder: 0, belowBar: false })
  })

  it('flags a load lighter than the bar instead of inventing plates', () => {
    expect(platesFor(12.5, 'kg')).toMatchObject({ perSide: [], belowBar: true })
  })

  it('reports what the plates cannot make rather than rounding the set', () => {
    const load = platesFor(101, 'kg')
    expect(load.perSide).toEqual([25, 15])
    expect(load.remainder).toBe(1)
  })

  it('survives binary noise from decimal loads', () => {
    expect(platesFor(22.5, 'kg')).toMatchObject({ perSide: [1.25], remainder: 0 })
    expect(platesFor(47.5, 'lb')).toMatchObject({ perSide: [], remainder: 2.5 })
  })

  it('falls back to kilograms for an unknown unit and to an empty bar for bad input', () => {
    expect(platesFor(60, 'stone').bar).toBe(BAR_WEIGHT.kg)
    expect(platesFor(NaN, 'kg')).toMatchObject({ perSide: [], remainder: 0, belowBar: true })
  })
})

describe('plateCaption', () => {
  it('spells the load out for anyone who cannot see the drawing', () => {
    expect(plateCaption(platesFor(102.5, 'kg'), 'kg')).toBe('20 kg bar + 25 + 15 + 1.25 per side')
  })

  it('names an empty bar and a load below the bar plainly', () => {
    expect(plateCaption(platesFor(20, 'kg'), 'kg')).toBe('Empty 20 kg bar')
    expect(plateCaption(platesFor(10, 'kg'), 'kg')).toBe('Lighter than a 20 kg bar')
  })

  it('states the part of the load the plates cannot make', () => {
    expect(plateCaption(platesFor(101, 'kg'), 'kg')).toBe('20 kg bar + 25 + 15 per side · 1 kg not on the bar')
  })
})

describe('plateTone', () => {
  it('follows the competition colour code in kilograms', () => {
    expect([25, 20, 15, 10, 5].map(p => plateTone(p, 'kg'))).toEqual(['red', 'blue', 'yellow', 'green', 'white'])
  })

  it('keeps the big-plate colours recognisable in pounds', () => {
    expect([45, 35, 25, 10].map(p => plateTone(p, 'lb'))).toEqual(['blue', 'yellow', 'green', 'white'])
  })

  it('falls back to steel for a change plate', () => {
    expect(plateTone(1.25, 'kg')).toBe('steel')
    expect(plateTone(2.5, 'lb')).toBe('steel')
  })
})
