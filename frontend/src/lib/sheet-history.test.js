import { describe, expect, it } from 'vitest'
import { consumesBack, createSheetHistoryState, isProgrammaticRewindPending, transitionSheetHistory } from './sheet-history.js'

const sheet = (id, locked = false) => ({ id, locked })

const open = (state, sheets, href = '#/workout') =>
  transitionSheetHistory(state, { type: 'sheets-changed', sheets, href })
const pop = (state, sheets, href = '#/workout') =>
  transitionSheetHistory(state, { type: 'pop', sheets, href })

describe('sheet history transitions', () => {
  it('drains a lower tombstone when the remaining top sheet is popped', () => {
    let result = open(createSheetHistoryState(), [sheet('lower'), sheet('upper')])
    expect(result.state.entries.map(entry => entry.backEligible)).toEqual([true, true])

    result = open(result.state, [sheet('upper')])
    expect(result.state.entries.map(entry => entry.backEligible)).toEqual([false, true])
    expect(result.state.entries).toHaveLength(2)

    result = pop(result.state, [sheet('upper')])
    expect(result.state.entries).toEqual([])
    expect(result.state.pendingProgrammaticPops).toBe(1)
    expect(consumesBack(result.state)).toBe(true)
  })

  it('absorbs the browser pop caused by its own rewind without touching entries again', () => {
    let result = open(createSheetHistoryState(), [sheet('goal')])
    result = open(result.state, [])
    expect(result.state.pendingProgrammaticPops).toBe(1)

    const absorbed = pop(result.state, [])
    expect(absorbed.state.pendingProgrammaticPops).toBe(0)
    expect(absorbed.state.entries).toEqual(result.state.entries)
    expect(consumesBack(absorbed.state)).toBe(false)
  })

  it('reports an in-flight programmatic rewind until its own pop is absorbed', () => {
    let result = open(createSheetHistoryState(), [sheet('goal')])
    expect(isProgrammaticRewindPending(result.state)).toBe(false)

    result = open(result.state, [])
    expect(isProgrammaticRewindPending(result.state)).toBe(true)

    const absorbed = pop(result.state, [])
    expect(isProgrammaticRewindPending(absorbed.state)).toBe(false)
  })

  it('does not queue a programmatic rewind for a sheet closed after navigation', () => {
    let result = open(createSheetHistoryState(), [sheet('navigating')])
    result = transitionSheetHistory(result.state, { type: 'sheets-changed', sheets: [], href: '#/plan' })
    expect(result.state.entries).toHaveLength(1)
    expect(result.state.entries[0].backEligible).toBe(false)
    expect(result.state.pendingProgrammaticPops).toBe(0)

    result = pop(result.state, [], '#/plan')
    expect(result.state.entries).toEqual([])
    expect(result.state.pendingProgrammaticPops).toBe(0)
  })
})
