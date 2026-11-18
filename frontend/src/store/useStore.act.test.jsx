// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform/sound.js', async orig => ({
  ...(await orig()),
  playSetComplete: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))

const { useStore, DEF } = await import('./useStore.js')
const { useUI } = await import('./useUI.js')
const { playSetComplete, playWorkoutComplete } = await import('../platform/sound.js')

const work = (done = false) => ({ w: 50, r: 8, done })
const entry = (id, sets, extra = {}) => ({ id, target: { reps: 8, weight: 50 }, sets, ...extra })
const withActive = (entries, extra = {}) => useStore.setState({
  S: { ...DEF, restSec: 75, sound: true, ...extra, active: { id: 'a1', d: '2026-11-16', start: 1, name: 'Push', cur: 0, entries } },
})

describe('store.act runs the effects', () => {
  beforeEach(() => { vi.clearAllMocks(); useUI.setState({ toastMsg: '' }) })
  afterEach(() => { useUI.getState().stopRest(); useUI.getState().stopWork() })

  it('starts rest for the Profile rest time and plays the set sound with the Profile sound setting', () => {
    withActive([entry('a', [work(), work()])], { sound: false })
    const res = useStore.getState().act({ type: 'toggle', entry: 0, set: 0 })
    expect(res.ok).toBe(true)
    expect(useStore.getState().S.active.entries[0].sets[0].done).toBe(true)
    expect(useUI.getState().timer?.total).toBe(75)
    expect(playSetComplete).toHaveBeenCalledWith(false)
  })

  it('stops rest and returns open-finish for the view after the last set', () => {
    withActive([entry('a', [work(), work()])])
    useUI.getState().startRest(60)
    useStore.getState().act({ type: 'toggle', entry: 0, set: 0 })
    const last = useStore.getState().act({ type: 'toggle', entry: 0, set: 1 })
    expect(last.effects.map(e => e.type)).toContain('open-finish')
    expect(useUI.getState().timer).toBe(null)
  })

  it('shows a notice as a toast', () => {
    withActive([{ id: 'x', target: { mode: 'cardio', min: 20 }, sets: [{ min: 20, done: false }] }, entry('a', [work()])])
    useStore.getState().act({ type: 'toggle', entry: 0, set: 0 })
    expect(useUI.getState().toastMsg).toBe('Cardio logged')
  })

  it('finishing stops rest and a running hold, and plays the finish sound', () => {
    withActive([entry('a', [work(true)])])
    useUI.getState().startWork(30, 'Plank', () => {})
    const res = useStore.getState().act({ type: 'finish' })
    expect(res.result.workout.entries).toHaveLength(1)
    expect(useUI.getState().work).toBe(null)
    expect(useUI.getState().timer).toBe(null)
    expect(playWorkoutComplete).toHaveBeenCalledWith(true)
    expect(useStore.getState().S.active).toBe(null)
  })

  it('a refused begin changes nothing', () => {
    withActive([entry('a', [work(true)])])
    useUI.getState().startRest(60)
    expect(useStore.getState().act({ type: 'begin', routineId: null }).ok).toBe(false)
    expect(useStore.getState().S.active.id).toBe('a1')
    expect(useUI.getState().timer).not.toBe(null)
  })
  describe('a timed hold', () => {
    const hold = () => ({ id: '0001', target: { mode: 'time', sec: 30, sets: 2 }, sets: [{ sec: 30, done: false }, { sec: 30, done: false }] })
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('refuses to start without a sender, so its finish cannot be lost', () => {
      withActive([hold()])
      expect(() => useStore.getState().act({ type: 'startHold', entry: 0, set: 0 })).toThrow(/sender/)
      expect(useUI.getState().work).toBe(null)
    })

    it('runs for the set\'s seconds and logs it when the time is up', () => {
      withActive([hold()])
      const send = command => useStore.getState().act(command, send)
      send({ type: 'startHold', entry: 0, set: 0 })
      expect(useUI.getState().work).toMatchObject({ total: 30, label: '3/4 sit-up' })
      vi.advanceTimersByTime(31_000)
      expect(useUI.getState().work).toBe(null)
      expect(useStore.getState().S.active.entries[0].sets.map(s => [s.sec, !!s.done])).toEqual([[30, true], [30, false]])
    })

    it('sends its finish through the sender it was started with, so the view sees open-finish', () => {
      withActive([hold()])
      useStore.getState().act({ type: 'toggle', entry: 0, set: 0 })
      const seen = []
      const send = command => { const res = useStore.getState().act(command, send); seen.push(...res.effects.map(e => e.type)); return res }
      send({ type: 'startHold', entry: 0, set: 1 })
      vi.advanceTimersByTime(31_000)
      expect(seen).toContain('open-finish')
    })
  })
})
