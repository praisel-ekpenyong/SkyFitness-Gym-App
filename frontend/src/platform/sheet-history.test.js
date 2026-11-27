import { describe, expect, it } from 'vitest'
import { createSheetHistory } from './sheet-history.js'

const sheet = (id, locked = false) => ({ id, locked })

// The Adapters are the seam: a sheets store that re-enters synchronously on close,
// a browser history that fires its pop listener on rewind, and a hardware-Back
// handle installed at attach time that can be fired by the test.
function harness(initial = []) {
  let sheets = initial
  const sheetListeners = new Set()
  let popHandler = null
  let handle = null
  let backInstalls = 0
  const calls = { push: [], rewind: [], close: [] }

  const emitSheets = () => {
    for (const listener of [...sheetListeners]) listener(sheets)
  }

  const sheetsAdapter = {
    subscribe: listener => {
      sheetListeners.add(listener)
      return () => sheetListeners.delete(listener)
    },
    getSheets: () => sheets,
    closeSheet: id => {
      calls.close.push(id)
      sheets = sheets.filter(item => item.id !== id)
      emitSheets()
    },
  }

  const historyAdapter = {
    href: () => '#/workout',
    push: () => calls.push.push('entry'),
    rewind: count => {
      calls.rewind.push(count)
      for (let i = 0; i < count; i++) popHandler?.()
    },
    onPop: listener => {
      popHandler = listener
      return () => { if (popHandler === listener) popHandler = null }
    },
  }

  const backAdapter = {
    install: listener => {
      backInstalls += 1
      handle = listener
      return () => { if (handle === listener) handle = null }
    },
  }

  const dispose = createSheetHistory({ sheets: sheetsAdapter, history: historyAdapter, back: backAdapter })

  return {
    calls,
    dispose,
    handle: () => handle?.(),
    pop: () => popHandler?.(),
    openSheets: next => { sheets = next; emitSheets() },
    closeSheet: id => sheetsAdapter.closeSheet(id),
    sheetListenerCount: () => sheetListeners.size,
    backInstalls: () => backInstalls,
    hasPopListener: () => popHandler !== null,
    hasHandle: () => handle !== null,
  }
}

describe('createSheetHistory attach seam', () => {
  it('installs one Back handle at attach time and reports only whether a press was consumed', () => {
    const h = harness()
    expect(h.backInstalls()).toBe(1)
    expect(h.hasHandle()).toBe(true)
    expect(h.handle()).toBe(false)
    expect(h.calls.rewind).toEqual([])

    h.openSheets([sheet('goal')])
    expect(h.handle()).toBe(true)
    expect(h.calls.close).toEqual(['goal'])
    expect(h.calls.rewind).toEqual([1])
  })

  it('does not close a locked sheet, but still consumes its Back press', () => {
    const h = harness([sheet('confirm', true)])
    expect(h.handle()).toBe(true)
    expect(h.calls.close).toEqual([])
    expect(h.handle()).toBe(false)
  })

  it('pushes once per opened sheet then rewinds once for drained tombstones', () => {
    const h = harness()
    h.openSheets([sheet('lower'), sheet('upper')])
    h.closeSheet('lower')
    expect(h.calls.push).toHaveLength(2)
    expect(h.calls.rewind).toEqual([])

    h.pop()
    expect(h.calls.close).toEqual(['lower', 'upper'])
    expect(h.calls.rewind).toEqual([1])
  })

  it('commits state before effects so a synchronous sheets re-entry cannot double-rewind', () => {
    const h = harness()
    h.openSheets([sheet('goal')])
    h.pop()
    expect(h.calls.close).toEqual(['goal'])
    expect(h.calls.rewind).toEqual([])
  })

  it('disposes idempotently, unsubscribing both listeners and unregistering only its own handle', () => {
    const h = harness()
    const other = harness()

    h.dispose()
    h.dispose()
    expect(h.hasHandle()).toBe(false)
    expect(h.sheetListenerCount()).toBe(0)
    expect(h.hasPopListener()).toBe(false)

    h.openSheets([sheet('ignored')])
    h.pop()
    expect(h.calls.push).toEqual([])
    expect(h.calls.close).toEqual([])

    expect(other.hasHandle()).toBe(true)
    other.openSheets([sheet('other')])
    other.pop()
    expect(other.calls.close).toEqual(['other'])
  })
})
