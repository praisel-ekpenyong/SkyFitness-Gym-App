import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fitName, stackClasses, NAME_LAYOUTS, NAME_MEDIA } from './name-fit.js'

const css = file => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles', file), 'utf8')

// The column beside the map is narrow on a phone, wide on a tablet (the app column is 720) and narrow
// again on a desktop, where the hero shares the row with the side column and its type is one step up.
// Each layout measures that column at the narrowest width of its range.
describe('fitName per layout', () => {
  it('keeps "Push Day" beside the map on every layout', () => {
    expect(fitName('Push Day', NAME_LAYOUTS.hero)).toEqual({ step: 'poster', stacked: [] })
    expect(fitName('Push Day', NAME_LAYOUTS.card)).toEqual({ step: 'heading', stacked: [] })
  })

  it('stacks a name only on the layouts where its longest word cannot sit beside the map', () => {
    // HYPERTROPHY is 5.49em. Phone: 154px at 28px > 148, so stacked at 44px (242px of 296).
    // Tablet: 242px fits the 312px column. Desktop: the 44px step is 56px there, 307px > 168.
    expect(fitName('Upper Body Hypertrophy', NAME_LAYOUTS.hero)).toEqual({ step: 's', stacked: ['phone', 'desktop'] })
    // SUPERCOMPENSATION is 8.43em: 236px at 28px. Columns: phone 203, tablet 430, desktop 206.
    expect(fitName('Supercompensation Block', NAME_LAYOUTS.card)).toEqual({ step: 'heading', stacked: ['phone', 'desktop'] })
  })

  it('stacks on a desktop a word that fits its phone step but not the larger desktop size', () => {
    // DEADLIFTS is 4.02em: 137px at the phone's 34px fits 148; that step is 44px on a desktop, 177px > 168
    expect(fitName('Deadlifts', NAME_LAYOUTS.hero)).toEqual({ step: 'xs', stacked: ['desktop'] })
    // SHOULDERS is 4.42em: 124px at the phone's 28px, 150px at the desktop's 34px; both fit
    expect(fitName('Shoulders', NAME_LAYOUTS.hero)).toEqual({ step: 'xxs', stacked: [] })
  })

  it('names one class per stacked layout', () => {
    expect(stackClasses({ stacked: [] })).toBe('')
    expect(stackClasses({ stacked: ['phone', 'desktop'] })).toBe(' name-stacked-phone name-stacked-desktop')
  })
})

// The helper decides per layout; the CSS applies each decision only inside that layout's media range.
describe('the stacked layout in CSS', () => {
  const blocks = text => {
    const out = []
    const re = /@media\s*([^{]+)\{/g
    let m
    while ((m = re.exec(text))) {
      let depth = 1, i = re.lastIndex
      while (depth && i < text.length) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++ }
      out.push({ media: m[1].trim(), body: text.slice(re.lastIndex, i) })
    }
    return out
  }
  const cases = [['hero', 'home.css', '.home-hero-body'], ['card', 'screens.css', '.rt-card']]

  for (const [layout, file, selector] of cases) {
    it(`${selector} stacks inside each layout's media range only`, () => {
      const media = blocks(css(file))
      expect(Object.keys(NAME_LAYOUTS[layout].at)).toEqual(Object.keys(NAME_MEDIA))
      for (const [name, query] of Object.entries(NAME_MEDIA)) {
        const rule = `${selector}.name-stacked-${name}`
        const holders = media.filter(b => b.body.includes(rule)).map(b => b.media)
        expect(holders, rule).toEqual([query])
      }
      expect(css(file)).not.toMatch(new RegExp(selector.replace('.', '\\.') + '\\.stack\\b'))
    })
  }
})
