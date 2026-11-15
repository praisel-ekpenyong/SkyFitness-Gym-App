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

// Where the lifter is, read off the session segments (one per exercise or superset): the
// screen states progress there and in the header count, not in an "Exercise N / M" line.
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

  // Check off the final work set of the first exercise
  click(view.container.querySelectorAll('[role="checkbox"]')[1])

  // Rest timer starts immediately and counts down; no sheet opens
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
    // The dataset name arrives lowercase; .capitalize lifts it (DESIGN.md › Conventions).
    const name = next.querySelector('.capitalize')
    expect(name?.textContent).toBe(exOr('1002').n)
    expect(next.textContent).toBe(`Next: ${exOr('1002').n}`)
    expect(position()).toBe('1 / 2')

    click(next)

    // View advances to the next exercise
    expect(position()).toBe('2 / 2')

    // Rest timer continues uninterrupted
    expect(timerBarText()).toMatch(/^1:27/)
    act(() => vi.advanceTimersByTime(2000))
    expect(timerBarText()).toMatch(/^1:25/)
  })

  it('the Next key goes away when a Set is unchecked, and is absent on the last exercise', () => {
    setupAndCompleteFirstExercise()
    expect(nextKey()).toBeTruthy()

    click(view.container.querySelectorAll('[role="checkbox"]')[1])
    expect(nextKey()).toBe(null)
    click(view.container.querySelectorAll('[role="checkbox"]')[1])
    click(nextKey())

    expect(position()).toBe('2 / 2')
    expect(nextKey()).toBe(null)
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
    expect(position()).toBe('1 / 2')
    // No top-weight sheet opened
    expect(buttonNamed('Save and next exercise')).toBeFalsy()

    // The same Next key as a loaded Entry
    const nextBtn = nextKey()
    expect(nextBtn).toBeTruthy()
    click(nextBtn)

    // View navigates to exercise 2 / 2
    expect(position()).toBe('2 / 2')

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
    click(nextKey())
    expect(position()).toBe('2 / 2')
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

    // Rest timer starts immediately
    expect(timerBarText()).toMatch(/^1:30/)
    act(() => vi.advanceTimersByTime(4000))
    expect(timerBarText()).toMatch(/^1:26/)

    // One Next key for the whole superset advances to the solo exercise
    expect(view.container.querySelectorAll('.wk-next')).toHaveLength(1)
    click(nextKey())
    expect(position()).toBe('2 / 2')

    // Rest timer continues uninterrupted
    expect(timerBarText()).toMatch(/^1:26/)
    act(() => vi.advanceTimersByTime(2000))
    expect(timerBarText()).toMatch(/^1:24/)
  })

  it('unprompted superset unit completion starts rest, stays on unit, and Next advances with rest running', () => {
    view = renderWorkoutApp([
      { ...entry('1001', [{ w: 0, r: 10, done: true }]), sg: 'ss1' },
      { ...entry('1002', [{ w: 0, r: 10, done: false }]), sg: 'ss1' },
      entry('1003', [{ w: 50, r: 5, done: false }]),
    ], { cur: 1 })

    // Perform the final set of the unprompted superset unit
    click(view.container.querySelectorAll('[role="checkbox"]')[1])

    // Rest timer starts immediately
    expect(timerBarText()).toMatch(/^1:30/)
    act(() => vi.advanceTimersByTime(3000))
    expect(timerBarText()).toMatch(/^1:27/)

    // View remains on the superset card
    expect(position()).toBe('1 / 2')

    // Tapping the Next key navigates to the solo exercise while rest continues
    click(nextKey())
    expect(position()).toBe('2 / 2')
    expect(timerBarText()).toMatch(/^1:27/)
  })
})
