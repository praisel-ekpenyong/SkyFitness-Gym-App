// @vitest-environment happy-dom
// A timed hold must land on the set it was started from, even when the session changes under it.
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { isWarmupRow } from '../lib/warmup.js'
import { resetViewTestState, renderWorkoutApp, cleanupViewTest } from '../test/view-harness.jsx'

vi.mock('../lib/sound.js', () => ({
  beep: vi.fn(), vibrate: vi.fn(), playSetComplete: vi.fn(), playTimerWarning: vi.fn(),
  playTimerComplete: vi.fn(), playWorkoutComplete: vi.fn(),
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const held = (sec = 30) => ({ id: '0001', target: { mode: 'time', sec, sets: 2 }, sets: [{ sec, done: false }, { sec, done: false }] })
const click = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const button = label => [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || b.textContent.trim()) === label)
const startButtons = () => [...document.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') === 'Start set')
const active = () => useStore.getState().S.active

let view
beforeEach(() => { vi.useFakeTimers(); resetViewTestState(); view = null })
afterEach(() => { cleanupViewTest(view); view = null })

describe('timed hold lands on the set it started from', () => {
  it('adding a warm-up mid-hold does not move the result onto another row', () => {
    view = renderWorkoutApp([held()])
    click(startButtons()[0])
    expect(useUI.getState().work).not.toBeNull()

    click(button('Add warm-up set'))
    act(() => { vi.advanceTimersByTime(31_000) })

    const sets = active().entries[0].sets
    expect(sets.map(s => [isWarmupRow(s), !!s.done])).toEqual([
      [true, false],  // the new warm-up row stays untouched
      [false, true],  // the held work set is logged
      [false, false],
    ])
  })

  it('a hold left running from a discarded workout never writes into the next workout', () => {
    view = renderWorkoutApp([held()])
    click(startButtons()[0])
    act(() => { useStore.getState().act({ type: 'discard' }) })   // what the Discard confirm does

    act(() => {                                            // a fresh routine workout starts
      useStore.getState().update(s => { s.routines = [{ id: 'core', name: 'Core', ex: [{ id: '0001', mode: 'time', sec: 60, sets: 2, prog: 'off' }] }] })
      useStore.getState().act({ type: 'begin', routineId: 'core' })
    })
    act(() => { vi.advanceTimersByTime(31_000) })

    expect(active().entries[0].sets.map(s => !!s.done)).toEqual([false, false])
    expect(active().entries[0].sets[0].sec).toBe(60)
  })

  it('removing the held set mid-hold logs nothing on the set left behind', () => {
    view = renderWorkoutApp([held()])
    click(startButtons()[1])
    click(button('Remove set'))
    act(() => { vi.advanceTimersByTime(31_000) })

    expect(active().entries[0].sets.map(s => !!s.done)).toEqual([false])
  })

  it('discarding the workout from the screen stops its hold', () => {
    view = renderWorkoutApp([held()])
    click(startButtons()[0])
    click(button('Discard'))
    click([...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Discard').pop())

    expect(active()).toBeNull()
    expect(useUI.getState().work).toBeNull()
  })
  it('a hold that completes the last set opens the finish sheet', () => {
    view = renderWorkoutApp([held()])
    click(startButtons()[0])
    act(() => { vi.advanceTimersByTime(31_000) })
    click(startButtons()[1])
    act(() => { vi.advanceTimersByTime(31_000) })

    expect(active().entries[0].sets.every(s => s.done)).toBe(true)
    expect(document.body.textContent).toContain("That's the whole workout!")
  })
})
