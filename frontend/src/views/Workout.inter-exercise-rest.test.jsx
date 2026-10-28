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

  it('unprompted exercise starts rest automatically, stays on completed card, and Next preserves countdown', () => {
    view = renderWorkoutApp([
      {
        ...entry('cardio-1', [{ min: 20, speed: 8, done: false }]),
        target: { mode: 'cardio', min: 20, speed: 8 },
      },
      entry('1002', [{ w: 50, r: 5, done: false }]),
    ])

    // Perform the final set of the unprompted cardio exercise
    click(view.container.querySelector('[role="checkbox"]'))

    // Rest timer starts immediately
    expect(timerBarText()).toMatch(/^1:30/)
    act(() => vi.advanceTimersByTime(3000))
    expect(timerBarText()).toMatch(/^1:27/)

    // View remains on the completed exercise card
    expect(view.container.textContent).toContain('Exercise 1 / 2')
    // No top-weight sheet opened
    expect(buttonNamed('Save & next exercise')).toBeFalsy()

    // Lifter taps "Next"
    const nextBtn = buttonNamed('Next')
    expect(nextBtn).toBeTruthy()
    click(nextBtn)

    // View navigates to exercise 2 / 2
    expect(view.container.textContent).toContain('Exercise 2 / 2')

    // Rest timer continues uninterrupted
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

    // Perform exercise 1 final set: rest starts
    click(view.container.querySelectorAll('[role="checkbox"]')[1])
    expect(timerBarText()).toMatch(/^1:30/)

    // Advance to last exercise
    click(buttonNamed('Save & next exercise'))
    expect(view.container.textContent).toContain('Exercise 2 / 2')
    expect(timerBarText()).toMatch(/^1:30/)

    // Advance time a bit while rest is running
    act(() => vi.advanceTimersByTime(5000))
    expect(timerBarText()).toMatch(/^1:25/)

    // Perform the final set of the session's last exercise
    click(view.container.querySelector('[role="checkbox"]'))

    // Rest timer is stopped! No rest bar displayed
    expect(timerBarText()).toBe(null)

    // Workout complete sheet is open!
    expect(view.container.textContent).toContain("That's the whole workout!")
  })

  it('superset unit completion followed by solo exercise preserves inter-exercise rest', () => {
    view = renderWorkoutApp([
      { ...entry('1001', [{ w: 60, r: 5, done: true }]), sg: 'ss1' },
      { ...entry('1002', [{ w: 40, r: 5, done: false }]), sg: 'ss1' },
      entry('1003', [{ w: 50, r: 5, done: false }]),
    ])

    // Perform the final set of the superset unit
    click(view.container.querySelectorAll('[role="checkbox"]')[1])

    // Rest timer starts immediately behind top-weight sheet
    expect(timerBarText()).toMatch(/^1:30/)
    act(() => vi.advanceTimersByTime(4000))
    expect(timerBarText()).toMatch(/^1:26/)

    // Tapping Save & next exercise advances to the solo exercise
    click(buttonNamed('Save & next exercise'))
    expect(view.container.textContent).toContain('Exercise 2 / 2')

    // Rest timer continues uninterrupted
    expect(timerBarText()).toMatch(/^1:26/)
    act(() => vi.advanceTimersByTime(2000))
    expect(timerBarText()).toMatch(/^1:24/)
  })

  it('unprompted superset unit completion starts rest, stays on unit, and Next advances with rest running', () => {
    view = renderWorkoutApp([
      { ...entry('1001', [{ w: 0, r: 10, done: true }]), sg: 'ss1', asked: true },
      { ...entry('1002', [{ w: 0, r: 10, done: false }]), sg: 'ss1', asked: true },
      entry('1003', [{ w: 50, r: 5, done: false }]),
    ], { cur: 1 })

    // Perform the final set of the unprompted superset unit
    click(view.container.querySelectorAll('[role="checkbox"]')[1])

    // Rest timer starts immediately
    expect(timerBarText()).toMatch(/^1:30/)
    act(() => vi.advanceTimersByTime(3000))
    expect(timerBarText()).toMatch(/^1:27/)

    // View remains on the superset card
    expect(view.container.textContent).toContain('Superset 1 / 2')

    // Tapping Next navigates to the solo exercise while rest continues
    click(buttonNamed('Next'))
    expect(view.container.textContent).toContain('Exercise 2 / 2')
    expect(timerBarText()).toMatch(/^1:27/)
  })
})
