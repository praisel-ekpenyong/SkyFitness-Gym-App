// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createHardwareBackAdapter, EXIT_WINDOW } from './back.js'

// The Adapter's seam is install(handle): it wires one native listener and hands the
// Module's handle the press. Everything it does is observed through the injected
// history/exit/toast edges — never through a decision word.
function harness({ consumed = false } = {}) {
  let state = { consumed }
  let now = 1000
  let handler = null
  let removals = 0
  let installs = 0
  let handleCalls = 0
  const calls = { goBack: 0, toasts: [], exit: 0 }
  const adapter = createHardwareBackAdapter({
    listen: fn => {
      installs++
      handler = fn
      return () => { removals++; handler = null }
    },
    goBack: () => { calls.goBack++ },
    toast: m => calls.toasts.push(m),
    exit: () => { calls.exit++ },
    now: () => now,
  })
  const dispose = adapter.install(() => { handleCalls++; return state.consumed })
  return {
    calls,
    dispose,
    press: (ev = {}) => handler?.(ev),
    handleCalls: () => handleCalls,
    setConsumed: value => { state.consumed = value },
    tick: ms => { now += ms },
    installs: () => installs,
    removals: () => removals,
    hasHandler: () => handler !== null,
  }
}

describe('hardware-Back Adapter install seam', () => {
  it('wires one native listener at install and removes it on dispose', () => {
    const h = harness()
    expect(h.installs()).toBe(1)
    expect(h.hasHandler()).toBe(true)
    h.press({ canGoBack: true })
    expect(h.handleCalls()).toBe(1)

    h.dispose()
    h.dispose()
    expect(h.removals()).toBe(1)
    expect(h.hasHandler()).toBe(false)
    const before = h.handleCalls()
    h.press({ canGoBack: true })
    expect(h.handleCalls()).toBe(before)
  })

  it('leaves history and exit alone when the Module consumed the press', () => {
    const h = harness({ consumed: true })
    h.press({ canGoBack: true })
    expect(h.calls.goBack).toBe(0)
    expect(h.calls.toasts).toEqual([])
    expect(h.calls.exit).toBe(0)
  })

  it('a locked sheet consumes the press without arming exit', () => {
    const h = harness({ consumed: true })
    h.press({ canGoBack: false })
    h.setConsumed(false)
    h.tick(EXIT_WINDOW + 1)
    h.press({ canGoBack: false })
    expect(h.calls.exit).toBe(0)
    expect(h.calls.toasts).toHaveLength(1)
  })

  it('walks app history when the press was not consumed', () => {
    const h = harness()
    h.press({ canGoBack: true })
    expect(h.calls.goBack).toBe(1)
    expect(h.calls.toasts).toEqual([])
    expect(h.calls.exit).toBe(0)
  })

  it('warns once, then exits on a second press inside the window', () => {
    const h = harness()
    h.press({ canGoBack: false })
    expect(h.calls.toasts).toHaveLength(1)
    expect(h.calls.exit).toBe(0)
    h.tick(EXIT_WINDOW - 1)
    h.press({ canGoBack: false })
    expect(h.calls.exit).toBe(1)
  })

  it('re-arms rather than exiting once the window has passed', () => {
    const h = harness()
    h.press({ canGoBack: false })
    h.tick(EXIT_WINDOW + 1)
    h.press({ canGoBack: false })
    expect(h.calls.exit).toBe(0)
    expect(h.calls.toasts).toHaveLength(2)
  })

  it('disarms the exit when another press does real work', () => {
    const h = harness()
    h.press({ canGoBack: false })
    h.setConsumed(true)
    h.press({ canGoBack: false })
    h.setConsumed(false)
    h.press({ canGoBack: false })
    expect(h.calls.exit).toBe(0)
    expect(h.calls.toasts).toHaveLength(2)
  })

  it('treats a missing event payload as no app history', () => {
    const h = harness()
    h.press()
    expect(h.calls.goBack).toBe(0)
    expect(h.calls.toasts).toHaveLength(1)
  })
})
