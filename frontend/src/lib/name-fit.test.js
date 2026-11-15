import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fitName, stackClasses, NAME_LAYOUTS, NAME_MEDIA } from './name-fit.js'

const css = file => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles', file), 'utf8')

describe('fitName per layout', () => {
  it('keeps "Push Day" beside the map on every layout', () => {
    expect(fitName('Push Day', NAME_LAYOUTS.hero)).toEqual({ step: 'poster', stacked: [] })
    expect(fitName('Push Day', NAME_LAYOUTS.card)).toEqual({ step: 'heading', stacked: [] })
  })

  it('stacks a name only on the layouts where its longest word cannot sit beside the map', () => {
    expect(fitName('Upper Body Hypertrophy', NAME_LAYOUTS.hero)).toEqual({ step: 's', stacked: ['phone', 'desktop'] })
    expect(fitName('Supercompensation Block', NAME_LAYOUTS.card)).toEqual({ step: 'heading', stacked: ['phone', 'desktop'] })
  })

  it('stacks on a desktop a word that fits its phone step but not the larger desktop size', () => {
    expect(fitName('Deadlifts', NAME_LAYOUTS.hero)).toEqual({ step: 'xs', stacked: ['desktop'] })
    expect(fitName('Shoulders', NAME_LAYOUTS.hero)).toEqual({ step: 'xxs', stacked: [] })
  })

  it('names one class per stacked layout', () => {
    expect(stackClasses({ stacked: [] })).toBe('')
    expect(stackClasses({ stacked: ['phone', 'desktop'] })).toBe(' name-stacked-phone name-stacked-desktop')
  })
})

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
