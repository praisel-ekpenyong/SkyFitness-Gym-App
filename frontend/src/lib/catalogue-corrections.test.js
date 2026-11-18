import { describe, expect, it } from 'vitest'
import { curationsByIdOf } from './catalogue-corrections.js'

describe('curationsByIdOf', () => {
  it('gives every id its pattern\'s curation, without the pattern name or id list', () => {
    const curations = curationsByIdOf([
      { pattern: 'squat', tg: 'quads', smAdd: ['glutes'], smRemove: ['calves'], ids: ['0001', '0002'] },
      { pattern: 'shrug', tg: 'traps', ids: ['0003'] },
    ])
    expect(curations).toEqual({
      '0001': { tg: 'quads', smAdd: ['glutes'], smRemove: ['calves'] },
      '0002': { tg: 'quads', smAdd: ['glutes'], smRemove: ['calves'] },
      '0003': { tg: 'traps' },
    })
  })

  it('returns an empty overlay for no patterns', () => {
    expect(curationsByIdOf([])).toEqual({})
  })

  it('throws when one id is curated by two patterns', () => {
    expect(() => curationsByIdOf([
      { pattern: 'squat', tg: 'quads', ids: ['0001'] },
      { pattern: 'lunge', tg: 'quads', ids: ['0002', '0001'] },
    ])).toThrow('catalogue id 0001 is curated twice (lunge)')
  })

  it('throws when one pattern lists an id twice', () => {
    expect(() => curationsByIdOf([{ pattern: 'squat', ids: ['0001', '0001'] }])).toThrow(/0001 is curated twice/)
  })
})
