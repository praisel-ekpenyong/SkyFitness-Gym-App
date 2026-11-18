// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('../platform/sound.js', () => ({
  beep: vi.fn(),
  vibrate: vi.fn(),
  playSetComplete: vi.fn(),
  playTimerWarning: vi.fn(),
  playTimerComplete: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))
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

  it('finishes work timer early with vibration and elapsed time', async () => {
    vi.useFakeTimers()
    const { vibrate } = await import('../platform/sound.js')
    const { useUI } = await import('./useUI.js')
    const ui = useUI.getState()
    const onDone = vi.fn()

    ui.startWork(45, 'Plank', onDone)
    expect(useUI.getState().work).toEqual(expect.objectContaining({ left: 45, total: 45, label: 'Plank' }))

    vi.advanceTimersByTime(10000)
    expect(useUI.getState().work?.left).toBe(35)

    ui.finishWorkEarly()

    expect(vibrate).toHaveBeenCalledWith(30)
    expect(onDone).toHaveBeenCalledWith(10)
    expect(useUI.getState().work).toBeNull()
    vi.useRealTimers()
  })
})

