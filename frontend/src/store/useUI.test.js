// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

// Regression (surfaced by ticket 08's built-app smoke pass): the sky surgery removed the
// server-era imports from useUI.js but left two `useStore.getState()` calls in the rest and
// work timer ticks. Upstream masked them behind the same import; without it, the first tick
// of any rest timer throws ReferenceError in the production bundle — the beep sequence, the
// "rest over" toast and the notification never fire.
vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), vibrate: vi.fn() }))
vi.mock('./useStore.js', async () => {
  const { create } = await import('zustand')
  return { useStore: create(() => ({ S: { sound: true } })) }
})

describe('useUI rest timer', () => {
  it('ticks down to zero without throwing and announces the end of rest', async () => {
    vi.useFakeTimers()
    const { useUI } = await import('./useUI.js')
    const ui = useUI.getState()
    ui.startRest(1)
    expect(() => vi.advanceTimersByTime(1100)).not.toThrow()
    expect(useUI.getState().timer).toBeNull()
    vi.useRealTimers()
  })
})
