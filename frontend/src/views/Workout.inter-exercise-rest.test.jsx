// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exOr } from '../lib/exercises.js'
import { entry, resetViewTestState, renderWorkoutApp, cleanupViewTest } from '../test/view-harness.jsx'

vi.mock('../lib/sound.js', () => ({
  beep: vi.fn(),
  vibrate: vi.fn(),
  playSetComplete: vi.fn(),
  playTimerWarning: vi.fn(),
  playTimerComplete: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let view

function buttonNamed(name) {
  return [...view.container.querySelectorAll('button')]
    .find(button => (button.getAttribute('aria-label') || button.textContent.trim()) === name)
}

function position() {
  const segs = [...view.container.querySelectorAll('.lad-s')]
  return `${segs.findIndex(s => s.getAttribute('aria-current') === 'step') + 1} / ${segs.length}`
}

function nextKey() {
  return view.container.querySelector('.wk-next')
}

function timerBarText() {
  const bar = view.container.querySelector('#timer')
  return bar ? bar.textContent.trim() : null
}

function click(button) {
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

function setupAndCompleteFirstExercise() {
  view = renderWorkoutApp([
    entry('1001', [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: false }]),
    entry('1002', [{ w: 50, r: 5, done: false }]),
  ])

  click(view.container.querySelectorAll('[role="checkbox"]')[1])

  expect(timerBarText()).toMatch(/^1:30/)
  act(() => vi.advanceTimersByTime(3000))
  expect(timerBarText()).toMatch(/^1:27/)
}

beforeEach(() => {
  vi.useFakeTimers()
  resetViewTestState()
  view = null
})

afterEach(() => {
  cleanupViewTest(view)
  view = null
})

describe('inter-exercise auto-rest for solo exercises', () => {
  it('opens no sheet, shows the Next key, and preserves countdown when tapping it', () => {
    setupAndCompleteFirstExercise()

    expect(buttonNamed('Save and next exercise')).toBeFalsy()
    expect(view.container.querySelector('.sheet')).toBe(null)
    const next = nextKey()
    expect(next).toBeTruthy()
    expect(next.textContent).toMatch(/^Next: /)
    const name = next.querySelector('.capitalize')
    expect(name?.textContent).toBe(exOr('1002').n)
    expect(next.textContent).toBe(`Next: ${exOr('1002').n}`)
    expect(position()).toBe('1 / 2')

    click(next)

    expect(position()).toBe('2 / 2')

    expect(timerBarText()).toMatch(/^1:27/)
    act(() => vi.advanceTimersByTime(2000))
    expect(timerBarText()).toMatch(/^1:25/)
  })

  it('performing the final set of the session last exercise suppresses rest, stops running rest, and opens workout complete sheet', () => {
    view = renderWorkoutApp([
      entry('1001', [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: false }]),
      {
        ...entry('cardio-last', [{ min: 10, speed: 5, done: false }]),
        target: { mode: 'cardio', min: 10, speed: 5 },
      },
    ])

    click(view.container.querySelectorAll('[role="checkbox"]')[1])
    expect(timerBarText()).toMatch(/^1:30/)

    click(nextKey())
    expect(position()).toBe('2 / 2')
    expect(timerBarText()).toMatch(/^1:30/)

    act(() => vi.advanceTimersByTime(5000))
    expect(timerBarText()).toMatch(/^1:25/)

    click(view.container.querySelector('[role="checkbox"]'))

    expect(timerBarText()).toBe(null)

    expect(view.container.textContent).toContain("That's the whole workout!")
  })
})
