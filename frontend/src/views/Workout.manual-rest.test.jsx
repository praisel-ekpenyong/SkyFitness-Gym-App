// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
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

function restControl() {
  return [...view.container.querySelectorAll('button')]
    .find(button => /^Rest \d+:\d{2}$/.test(button.textContent.trim()))
}

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

beforeEach(() => {
  vi.useFakeTimers()
  resetViewTestState()
  view = null
})

afterEach(() => {
  cleanupViewTest(view)
  view = null
})

describe('manual rest control', () => {
  it('shows the Rest duration on the exercise-position line', () => {
    view = renderWorkoutApp([entry('1001')])

    expect(view.container.textContent).toContain('Exercise 1 / 1')
    expect(restControl()).toBeTruthy()
    expect(restControl().disabled).toBe(false)
    expect(restControl().getAttribute('aria-label') || restControl().textContent.trim()).toBe('Rest 1:30')
  })

  it('updates the label and the countdown length when the Rest duration changes', () => {
    view = renderWorkoutApp([entry('1001')])

    act(() => { useStore.getState().update(S => { S.restSec = 120 }) })

    expect(restControl().textContent.trim()).toBe('Rest 2:00')
    click(restControl())
    expect(timerBarText()).toMatch(/^2:00/)
    act(() => vi.advanceTimersByTime(5000))
    expect(timerBarText()).toMatch(/^1:55/)
  })

  it('starts the Rest timer at the shown duration and counts down', () => {
    view = renderWorkoutApp([entry('1001')])

    click(restControl())

    expect(timerBarText()).toMatch(/^1:30/)
    act(() => vi.advanceTimersByTime(3000))
    expect(timerBarText()).toMatch(/^1:27/)
  })

  it('sits on the superset-position line too', () => {
    view = renderWorkoutApp([
      { ...entry('1001'), sg: 'g1' },
      { ...entry('1002'), sg: 'g1' },
    ])

    expect(view.container.textContent).toContain('Superset 1 / 1')
    expect(restControl()).toBeTruthy()
    expect(restControl().textContent.trim()).toBe('Rest 1:30')
  })

  it('does not offer a rest in an empty freestyle workout', () => {
    view = renderWorkoutApp([])

    expect(view.container.textContent).toContain('Freestyle workout — add your first exercise.')
    expect(restControl()).toBeUndefined()
  })

  it('does not offer a rest when no Active workout exists', () => {
    view = renderWorkoutApp(null)

    expect(view.container.textContent).toContain('Start workout')
    expect(restControl()).toBeUndefined()
  })

  it('is disabled while a rest runs and is available again after Skip', () => {
    view = renderWorkoutApp([entry('1001')])

    click(restControl())
    expect(restControl().disabled).toBe(true)

    click(buttonNamed('Skip'))
    expect(timerBarText()).toBeNull()
    expect(restControl().disabled).toBe(false)
  })

  it('is disabled while a Hold timer runs and is available again when the hold ends', () => {
    view = renderWorkoutApp([entry('1001')])

    act(() => { useUI.getState().startWork(3, 'Hold', vi.fn()) })
    expect(timerBarText()).toMatch(/^0:03/)
    expect(restControl().disabled).toBe(true)

    act(() => vi.advanceTimersByTime(3000))
    expect(timerBarText()).toBeNull()
    expect(restControl().disabled).toBe(false)
  })

  it('still starts a rest automatically after a performed set', () => {
    view = renderWorkoutApp([entry('1001', [{ w: 0, r: 1, done: false }, { w: 0, r: 1, done: false }])])

    click(view.container.querySelector('[role="checkbox"]'))

    expect(timerBarText()).toMatch(/^1:30/)
    expect(restControl().disabled).toBe(true)
  })

  it('offers the same −15, +15 and Skip on a manual rest', () => {
    view = renderWorkoutApp([entry('1001')])
    click(restControl())

    const fifteens = [...view.container.querySelectorAll('#timer button')]
      .filter(button => button.textContent.trim() === '15s')
    expect(fifteens).toHaveLength(2)

    click(fifteens[0])
    expect(timerBarText()).toMatch(/^1:15/)
    click(fifteens[1])
    expect(timerBarText()).toMatch(/^1:30/)

    click(buttonNamed('Skip'))
    expect(timerBarText()).toBeNull()
    expect(restControl().disabled).toBe(false)
  })

  it('removes the bar when the workout is finished while resting', () => {
    view = renderWorkoutApp([entry('1001', [{ w: 0, r: 1, done: true }])])
    click(restControl())
    expect(timerBarText()).toMatch(/^1:30/)

    click(buttonNamed('Finish'))

    expect(timerBarText()).toBeNull()
    expect(restControl()).toBeUndefined()
  })

  it('removes the bar when the workout is discarded while resting', () => {
    view = renderWorkoutApp([entry('1001')])
    click(restControl())
    expect(timerBarText()).toMatch(/^1:30/)

    click(buttonNamed('Discard'))
    const dialog = view.container.querySelector('[role="alertdialog"]')
    expect(dialog).toBeTruthy()
    click([...dialog.querySelectorAll('button')].find(button => button.textContent.trim() === 'Discard'))

    expect(timerBarText()).toBeNull()
    expect(restControl()).toBeUndefined()
  })

  it('counts down in background behind Top-Weight modal and preserves countdown when tapping Save & next exercise', () => {
    view = renderWorkoutApp([
      entry('1001', [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: false }]),
      entry('1002', [{ w: 50, r: 5, done: false }]),
    ])

    click(view.container.querySelectorAll('[role="checkbox"]')[1])

    expect(timerBarText()).toMatch(/^1:30/)
    act(() => vi.advanceTimersByTime(3000))
    expect(timerBarText()).toMatch(/^1:27/)

    const saveAndNext = buttonNamed('Save & next exercise')
    expect(saveAndNext).toBeTruthy()

    click(saveAndNext)

    expect(view.container.textContent).toContain('Exercise 2 / 2')
    expect(timerBarText()).toMatch(/^1:27/)
    act(() => vi.advanceTimersByTime(2000))
    expect(timerBarText()).toMatch(/^1:25/)
  })

  it('preserves countdown on current view when tapping Just close in Top-Weight modal', () => {
    view = renderWorkoutApp([
      entry('1001', [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: false }]),
      entry('1002', [{ w: 50, r: 5, done: false }]),
    ])

    click(view.container.querySelectorAll('[role="checkbox"]')[1])

    expect(timerBarText()).toMatch(/^1:30/)
    act(() => vi.advanceTimersByTime(3000))
    expect(timerBarText()).toMatch(/^1:27/)

    const justClose = buttonNamed('Just close')
    expect(justClose).toBeTruthy()

    click(justClose)

    expect(view.container.textContent).toContain('Exercise 1 / 2')
    expect(timerBarText()).toMatch(/^1:27/)
    act(() => vi.advanceTimersByTime(2000))
    expect(timerBarText()).toMatch(/^1:25/)
  })
})
