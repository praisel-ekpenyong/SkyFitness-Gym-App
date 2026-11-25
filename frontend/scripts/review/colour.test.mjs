import { describe, expect, it } from 'vitest'
import { over, parseColor } from './colour.mjs'

const close = (a, b) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 1))

describe('audit colour parser', () => {
  it('reads rgb() with commas and spaces', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30, 1])
    expect(parseColor('rgb(10 20 30)')).toEqual([10, 20, 30, 1])
  })
  it('reads rgba() in both syntaxes', () => {
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30, 0.5])
    expect(parseColor('rgb(10 20 30 / 0.5)')).toEqual([10, 20, 30, 0.5])
    expect(parseColor('rgba(0, 0, 0, 0)')).toEqual([0, 0, 0, 0])
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual([10, 20, 30, 0.5])
  })
  it('reads color(srgb) with 0-1 channels, with and without alpha', () => {
    close(parseColor('color(srgb 1 0.5 0)'), [255, 127.5, 0, 1])
    close(parseColor('color(srgb 1 1 1 / 0.25)'), [255, 255, 255, 0.25])
  })
  it('reads a real color-mix() result as light, not near-black', () => {
    close(parseColor('color(srgb 0.5 0.5 0.5)'), [127.5, 127.5, 127.5, 1])
    const [r, g, b] = parseColor('color(srgb 0.843137 0.760784 0.964706)')
    expect(Math.min(r, g, b)).toBeGreaterThan(190)
  })
  it('reads hex', () => {
    expect(parseColor('#0a141e')).toEqual([10, 20, 30, 1])
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1])
  })
  it('composites translucent colour over the ground', () => {
    close(over([255, 255, 255, 0.5], [0, 0, 0]), [127.5, 127.5, 127.5])
    close(over(parseColor('color(srgb 1 1 1 / 0.5)'), [0, 0, 0]), [127.5, 127.5, 127.5])
  })
  it('fails loudly on unknown syntaxes instead of parsing as black', () => {
    for (const s of ['oklch(0.7 0.1 200)', 'lab(50 20 30)', 'color(display-p3 1 0 0)', 'hsl(10 50% 50%)', 'transparent', 'banana', '', 'rgb(a b c)'])
      expect(() => parseColor(s), s).toThrow(/unsupported colour|audit/)
  })
})
