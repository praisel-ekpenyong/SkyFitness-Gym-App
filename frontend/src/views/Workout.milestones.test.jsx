// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { resetViewTestState, renderWorkout, cleanupViewTest } from '../test/view-harness.jsx'

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

function toggleSet(index = 0) {
  const checkbox = view.container.querySelectorAll('[role="checkbox"]')[index]
  expect(checkbox).toBeTruthy()
  act(() => checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

function bumpReps(setIndex = 0, dir = -1) {
  const row = view.container.querySelectorAll('.setrow')[setIndex]
  const repStepper = row.querySelector('.stp.r')
  const btn = repStepper.querySelectorAll('button')[dir === -1 ? 0 : 1]
  act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })))
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

describe('Workout milestone badges', () => {
  it('displays an inline milestone badge when checking off a work set meeting target reps under linear progression', () => {
    const entry = {
      id: 'barbell-bench-press',
      target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
      sets: [
        { r: 5, w: 60, done: false },
        { r: 5, w: 60, done: false },
      ]
    }
    view = renderWorkout([entry])

    // Before checking: no milestone badge
    expect(view.container.querySelector('.milestone-badge')).toBeNull()

    // Check off the first set
    toggleSet(0)

    const badge = view.container.querySelector('.milestone-badge')
    expect(badge).not.toBeNull()
    expect(badge.textContent).toBe('5/5 reps')

    // Upcoming set target remains unchanged
    const upcomingRow = view.container.querySelectorAll('.setrow')[1]
    expect(upcomingRow.querySelector('.milestone-badge')).toBeNull()
    expect(useStore.getState().S.active.entries[0].sets[1].r).toBe(5)
    expect(useStore.getState().S.active.entries[0].sets[1].w).toBe(60)
  })

  it('displays an inline milestone badge when checking off a timed hold set meeting target seconds', () => {
    const entry = {
      id: 'plank',
      target: { mode: 'time', sec: 45, prog: 'time' },
      sets: [
        { sec: 45, done: false }
      ]
    }
    view = renderWorkout([entry])

    expect(view.container.querySelector('.milestone-badge')).toBeNull()

    toggleSet(0)

    const badge = view.container.querySelector('.milestone-badge')
    expect(badge).not.toBeNull()
    expect(badge.textContent).toBe('45s hold')
  })

  it('does not display a milestone badge for warm-up sets', () => {
    const entry = {
      id: 'barbell-bench-press',
      target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
      sets: [
        { r: 5, w: 20, done: false, phase: 'warmup' },
        { r: 5, w: 60, done: false }
      ]
    }
    view = renderWorkout([entry])

    // Check off warm-up set (index 0)
    toggleSet(0)

    const setRows = view.container.querySelectorAll('.setrow')
    expect(setRows[0].querySelector('.milestone-badge')).toBeNull()

    // Check off work set (index 1)
    toggleSet(1)
    expect(setRows[1].querySelector('.milestone-badge')).not.toBeNull()
    expect(setRows[1].querySelector('.milestone-badge').textContent).toBe('5/5 reps')
  })

  it('quietly logs sets that fall short of target with neutral styling and no milestone badge', () => {
    const entry = {
      id: 'barbell-bench-press',
      target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
      sets: [
        { r: 4, w: 60, done: false }
      ]
    }
    view = renderWorkout([entry])

    toggleSet(0)

    expect(view.container.querySelector('.milestone-badge')).toBeNull()
    expect(view.container.querySelector('.failure-banner')).toBeNull()
    expect(view.container.querySelector('.warn')).toBeNull()
  })

  it('immediately and reactively removes the badge when a set is unchecked', () => {
    const entry = {
      id: 'barbell-bench-press',
      target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
      sets: [
        { r: 5, w: 60, done: true }
      ]
    }
    view = renderWorkout([entry])

    expect(view.container.querySelector('.milestone-badge')).not.toBeNull()

    // Uncheck set 0
    toggleSet(0)

    expect(view.container.querySelector('.milestone-badge')).toBeNull()
  })

  it('immediately and reactively removes the badge when reps are edited below target', () => {
    const entry = {
      id: 'barbell-bench-press',
      target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
      sets: [
        { r: 5, w: 60, done: true }
      ]
    }
    view = renderWorkout([entry])

    expect(view.container.querySelector('.milestone-badge')).not.toBeNull()

    // Tap minus button on reps stepper for set 0
    bumpReps(0, -1)

    expect(useStore.getState().S.active.entries[0].sets[0].r).toBe(4)
    expect(view.container.querySelector('.milestone-badge')).toBeNull()
  })
})
