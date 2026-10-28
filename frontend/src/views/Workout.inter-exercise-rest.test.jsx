// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  // Check off the final work set of the first exercise
  click(view.container.querySelectorAll('[role="checkbox"]')[1])

  // Rest timer starts immediately and counts down in background behind top-weight sheet
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
  it('counts down in background behind the top-weight sheet and preserves countdown when tapping Save & next exercise', () => {
    setupAndCompleteFirstExercise()

    const saveAndNext = buttonNamed('Save & next exercise')
    expect(saveAndNext).toBeTruthy()

    click(saveAndNext)

    // View advances to the next exercise
    expect(view.container.textContent).toContain('Exercise 2 / 2')

    // Rest timer continues uninterrupted
    expect(timerBarText()).toMatch(/^1:27/)
    act(() => vi.advanceTimersByTime(2000))
    expect(timerBarText()).toMatch(/^1:25/)
  })

  it('preserves countdown on current view when tapping Just close on the top-weight sheet', () => {
    setupAndCompleteFirstExercise()

    const justClose = buttonNamed('Just close')
    expect(justClose).toBeTruthy()

    click(justClose)

    // View remains on the completed exercise
    expect(view.container.textContent).toContain('Exercise 1 / 2')

    // Rest timer continues uninterrupted
    expect(timerBarText()).toMatch(/^1:27/)
    act(() => vi.advanceTimersByTime(2000))
    expect(timerBarText()).toMatch(/^1:25/)
  })
})
