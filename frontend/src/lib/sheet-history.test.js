import { describe, expect, it } from 'vitest'
import { createSheetHistoryState, transitionSheetHistory } from './sheet-history.js'

const sheet = (id, locked = false) => ({ id, locked })

describe('sheet history transitions', () => {
  it('pushes one browser entry per opened sheet and closes only the top sheet on Back', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheetCount: 2,
      href: '#/workout',
    })
    expect(result.effects).toEqual([{ type: 'push' }, { type: 'push' }])

    result = transitionSheetHistory(result.state, {
      type: 'pop',
      sheets: [sheet('one'), sheet('two')],
    })
    expect(result.effects).toEqual([{ type: 'close', id: 'two' }])
  })

  it('closes normally stacked sheets one at a time', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheetCount: 1,
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheetCount: 2,
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, { type: 'pop', sheets: [sheet('one'), sheet('two')] })
    expect(result.effects).toEqual([{ type: 'close', id: 'two' }])

    result = transitionSheetHistory(result.state, { type: 'sheets-changed', sheetCount: 1, href: '#/workout' })
    expect(result.effects).toEqual([])
    result = transitionSheetHistory(result.state, { type: 'pop', sheets: [sheet('one')] })
    expect(result.effects).toEqual([{ type: 'close', id: 'one' }])
  })

  it('rewinds explicitly closed sheets only on their opening route', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheetCount: 1,
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, { type: 'sheets-changed', sheetCount: 0, href: '#/workout' })
    expect(result.effects).toEqual([{ type: 'rewind', count: 1 }])

    result = transitionSheetHistory(result.state, { type: 'pop', sheets: [] })
    expect(result.effects).toEqual([])

    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheetCount: 1,
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, { type: 'pop', sheets: [sheet('after-navigation')] })
    expect(result.effects).toEqual([{ type: 'close', id: 'after-navigation' }])
  })

  it('does not rewind to the opening route when a sheet closes after navigation', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheetCount: 1,
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, { type: 'sheets-changed', sheetCount: 0, href: '#/plan' })
    expect(result.effects).toEqual([])

    result = transitionSheetHistory(result.state, { type: 'pop', sheets: [] })
    expect(result.effects).toEqual([])
  })

  it('keeps a locked sheet open when Back consumes its history entry', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheetCount: 1,
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, { type: 'pop', sheets: [sheet('confirm', true)] })
    expect(result.effects).toEqual([])
    result = transitionSheetHistory(result.state, { type: 'sheets-changed', sheetCount: 0, href: '#/workout' })
    expect(result.effects).toEqual([])
  })
})
