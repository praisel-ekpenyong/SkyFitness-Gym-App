import { describe, expect, it } from 'vitest'
import { createBrowserHistoryAdapter } from './browser-history.js'

// The Adapter wraps only the browser-history edge. Tests inject stand-ins for the
// three globals the sheet host uses — history, location and the event target — so a
// call that reaches for a global instead of the injected edge cannot pass.
function harness() {
  const calls = []
  const listeners = new Set()
  const h = {
    pushState: (...args) => calls.push(['pushState', ...args]),
    go: delta => calls.push(['go', delta]),
  }
  const loc = { href: 'https://sky.test/#/workout' }
  const win = {
    addEventListener: (type, fn) => { if (type === 'popstate') listeners.add(fn) },
    removeEventListener: (type, fn) => { if (type === 'popstate') listeners.delete(fn) },
    dispatchPop: () => { for (const fn of [...listeners]) fn() },
  }
  return { calls, h, loc, win, adapter: createBrowserHistoryAdapter({ history: h, location: loc, win }) }
}

describe('browser-history Adapter', () => {
  it('reads the current href from the injected location', () => {
    const t = harness()
    expect(t.adapter.href()).toBe('https://sky.test/#/workout')
    t.loc.href = 'https://sky.test/#/plan'
    expect(t.adapter.href()).toBe('https://sky.test/#/plan')
  })

  it('pushes one marked entry on the injected history', () => {
    const t = harness()
    t.adapter.push()
    expect(t.calls).toEqual([['pushState', { skySheet: true }, '']])
  })

  it('rewinds history by a negative delta on the injected history', () => {
    const t = harness()
    t.adapter.rewind(2)
    expect(t.calls).toEqual([['go', -2]])
  })

  it('runs the handler on a browser pop and stops after dispose', () => {
    const t = harness()
    let n = 0
    const dispose = t.adapter.onPop(() => { n++ })
    t.win.dispatchPop()
    expect(n).toBe(1)
    dispose()
    t.win.dispatchPop()
    expect(n).toBe(1)
  })

  it('unsubscribes only its own listener by identity', () => {
    const t = harness()
    let mine = 0
    let other = 0
    const dispose = t.adapter.onPop(() => { mine++ })
    const foreign = () => { other++ }
    t.win.addEventListener('popstate', foreign)
    dispose()
    t.win.dispatchPop()
    expect(mine).toBe(0)
    expect(other).toBe(1)
  })
})
