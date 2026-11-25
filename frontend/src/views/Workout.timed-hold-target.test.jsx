// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { resetViewTestState, renderWorkoutApp, cleanupViewTest } from '../test/view-harness.jsx'

vi.mock('../platform/sound.js', async orig => (await import('../test/platform-mocks.js')).mockSound(await orig()))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const held = (sec = 30) => ({ id: '0001', target: { mode: 'time', sec, sets: 2 }, sets: [{ sec, done: false }, { sec, done: false }] })
const click = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const startButtons = () => [...document.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') === 'Start set')
const active = () => useStore.getState().S.active

let view
beforeEach(() => { vi.useFakeTimers(); resetViewTestState(); view = null })
afterEach(() => { cleanupViewTest(view); view = null })

describe('a timed hold on the screen', () => {
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
