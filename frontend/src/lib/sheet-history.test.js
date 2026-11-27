import { describe, expect, it } from 'vitest'
import { createSheetHistoryState, transitionSheetHistory } from './sheet-history.js'

const sheet = (id, locked = false) => ({ id, locked })

describe('sheet history transitions', () => {
  it('keeps browser Back aligned when a lower sheet closes by ID', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheets: [sheet('lower'), sheet('upper')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([{ type: 'push' }, { type: 'push' }])

    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheets: [sheet('upper')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([])

    result = transitionSheetHistory(result.state, {
      type: 'pop',
      sheets: [sheet('upper')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([
      { type: 'close', id: 'upper' },
      { type: 'rewind', count: 1 },
    ])
  })

  it('pushes one browser entry per opened sheet and closes only the top sheet on Back', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheets: [sheet('one'), sheet('two')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([{ type: 'push' }, { type: 'push' }])

    result = transitionSheetHistory(result.state, {
      type: 'pop',
      sheets: [sheet('one'), sheet('two')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([{ type: 'close', id: 'two' }])
  })

  it('closes normally stacked sheets one at a time', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheets: [sheet('one')],
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheets: [sheet('one'), sheet('two')],
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, {
      type: 'pop',
      sheets: [sheet('one'), sheet('two')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([{ type: 'close', id: 'two' }])

    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheets: [sheet('one')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([])
    result = transitionSheetHistory(result.state, {
      type: 'pop',
      sheets: [sheet('one')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([{ type: 'close', id: 'one' }])
  })

  it('rewinds explicitly closed sheets only on their opening route', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheets: [sheet('goal')],
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheets: [],
      href: '#/workout',
    })
    expect(result.effects).toEqual([{ type: 'rewind', count: 1 }])

    result = transitionSheetHistory(result.state, {
      type: 'pop',
      sheets: [],
      href: '#/workout',
    })
    expect(result.effects).toEqual([])

    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheets: [sheet('after-navigation')],
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, {
      type: 'pop',
      sheets: [sheet('after-navigation')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([{ type: 'close', id: 'after-navigation' }])
  })

  it('does not rewind to the opening route when a sheet closes after navigation', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheets: [sheet('navigating')],
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheets: [],
      href: '#/plan',
    })
    expect(result.effects).toEqual([])

    result = transitionSheetHistory(result.state, { type: 'pop', sheets: [], href: '#/plan' })
    expect(result.effects).toEqual([])
  })

  it('keeps a locked sheet open when Back consumes its history entry', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheets: [sheet('confirm', true)],
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, {
      type: 'pop',
      sheets: [sheet('confirm', true)],
      href: '#/workout',
    })
    expect(result.effects).toEqual([])
    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheets: [],
      href: '#/workout',
    })
    expect(result.effects).toEqual([])
  })

  it('unwinds the top sheet and lower tombstones when explicitly closed', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheets: [sheet('lower'), sheet('upper')],
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheets: [sheet('upper')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([])

    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheets: [],
      href: '#/workout',
    })
    expect(result.effects).toEqual([{ type: 'rewind', count: 2 }])
  })

  it('skips multiple lower tombstones after closing the visible sheet on Back', () => {
    let result = transitionSheetHistory(createSheetHistoryState(), {
      type: 'sheets-changed',
      sheets: [sheet('first'), sheet('second'), sheet('top')],
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheets: [sheet('second'), sheet('top')],
      href: '#/workout',
    })
    result = transitionSheetHistory(result.state, {
      type: 'sheets-changed',
      sheets: [sheet('top')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([])

    result = transitionSheetHistory(result.state, {
      type: 'pop',
      sheets: [sheet('top')],
      href: '#/workout',
    })
    expect(result.effects).toEqual([
      { type: 'close', id: 'top' },
      { type: 'rewind', count: 2 },
    ])
  })
})
