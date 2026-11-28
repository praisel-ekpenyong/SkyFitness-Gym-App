import { describe, expect, it } from 'vitest'
import { createSheetHistory } from './sheet-history.js'
import { createHardwareBackAdapter } from './back.js'

const sheet = (id, locked = false) => ({ id, locked })

// The one attach seam: a sheets Adapter that re-enters synchronously on close, a
// browser-history Adapter whose rewind fires its pop listener, and the *real*
// hardware Adapter with its native listener captured. A press goes native -> Adapter
// -> Module -> effects, and we assert only what closed and where history landed.
function harness(initial = [], { deferPops = false } = {}) {
  let sheets = initial
  let native = null
  let popHandler = null
  let queuedPops = []
  const sheetListeners = new Set()
  const calls = { push: [], rewind: [], close: [], goBack: 0, toasts: [], exit: 0 }

  const emitSheets = () => { for (const l of [...sheetListeners]) l(sheets) }
  const closeSheet = id => {
    calls.close.push(id)
    sheets = sheets.filter(item => item.id !== id)
    emitSheets()
  }
  const sheetsAdapter = {
    subscribe: l => { sheetListeners.add(l); return () => sheetListeners.delete(l) },
    getSheets: () => sheets,
    closeSheet,
  }
  const historyAdapter = {
    href: () => '#/workout',
    push: () => calls.push.push('entry'),
    rewind: count => {
      calls.rewind.push(count)
      const fire = () => { for (let i = 0; i < count; i++) popHandler?.() }
      if (deferPops) queuedPops.push(fire)
      else fire()
    },
    onPop: l => { popHandler = l; return () => { if (popHandler === l) popHandler = null } },
  }
  const backAdapter = createHardwareBackAdapter({
    listen: fn => { native = fn; return () => { if (native === fn) native = null } },
    goBack: () => { calls.goBack++ },
    toast: m => calls.toasts.push(m),
    exit: () => { calls.exit++ },
    now: () => 1000,
  })
  const dispose = createSheetHistory({ sheets: sheetsAdapter, history: historyAdapter, back: backAdapter })

  return {
    calls,
    dispose,
    press: (ev = {}) => native?.(ev),
    openSheets: next => { sheets = next; emitSheets() },
    flushPops: () => {
      const queued = queuedPops
      queuedPops = []
      for (const fire of queued) fire()
    },
  }
}

describe('hardware Back through the one attach seam', () => {
  it('closes the top sheet through the Module and leaves browser history aligned', () => {
    const h = harness()
    h.openSheets([sheet('lower'), sheet('goal')])
    h.press({ canGoBack: true })
    expect(h.calls.close).toEqual(['goal'])
    expect(h.calls.rewind).toEqual([1])
    expect(h.calls.goBack).toBe(0)
    expect(h.calls.exit).toBe(0)
  })

  it('a locked sheet consumes the press without closing or moving history', () => {
    const h = harness([sheet('confirm', true)])
    h.press({ canGoBack: false })
    expect(h.calls.close).toEqual([])
    // The Module consumes by keeping the sheet's own history entry; the Adapter walks no history.
    expect(h.calls.rewind).toEqual([])
    expect(h.calls.goBack).toBe(0)
    expect(h.calls.toasts).toEqual([])
    expect(h.calls.exit).toBe(0)
  })

  it('a locked sheet keeps consuming repeated hardware Back presses without arming exit', () => {
    const h = harness([sheet('confirm', true)])
    h.press({ canGoBack: false })
    h.press({ canGoBack: false })
    h.press({ canGoBack: false })
    expect(h.calls.close).toEqual([])
    expect(h.calls.rewind).toEqual([])
    expect(h.calls.goBack).toBe(0)
    expect(h.calls.toasts).toEqual([])
    expect(h.calls.exit).toBe(0)
  })

  it('traverses history when no sheet consumed the press', () => {
    const h = harness()
    h.press({ canGoBack: true })
    expect(h.calls.goBack).toBe(1)
    expect(h.calls.close).toEqual([])
    expect(h.calls.rewind).toEqual([])
    expect(h.calls.exit).toBe(0)
  })

  it('keeps double-press-to-exit when no sheet and no app history', () => {
    const h = harness()
    h.press({ canGoBack: false })
    expect(h.calls.toasts).toHaveLength(1)
    expect(h.calls.exit).toBe(0)
    h.press({ canGoBack: false })
    expect(h.calls.exit).toBe(1)
  })

  it('absorbs a Back press while its own rewind is in flight, leaving history aligned', () => {
    const h = harness([sheet('goal')], { deferPops: true })
    h.openSheets([])
    expect(h.calls.rewind).toEqual([1])

    h.press({ canGoBack: true })
    expect(h.calls.rewind).toEqual([1])
    expect(h.calls.close).toEqual([])
    expect(h.calls.goBack).toBe(0)
    expect(h.calls.exit).toBe(0)

    h.flushPops()
    expect(h.calls.rewind).toEqual([1])
    expect(h.calls.close).toEqual([])
  })
})
