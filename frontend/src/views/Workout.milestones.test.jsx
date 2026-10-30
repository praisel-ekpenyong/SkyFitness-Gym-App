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

  describe('Double progression in active workout view', () => {
    it('displays on-track cues for intermediate sets and unlocked milestone on final set when all hit rep ceiling', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double', sets: 3 },
        sets: [
          { r: 12, w: 14, done: false },
          { r: 12, w: 14, done: false },
          { r: 12, w: 14, done: false }
        ]
      }
      view = renderWorkout([entry])

      const setRows = () => view.container.querySelectorAll('.setrow')

      // Check set 0 (intermediate): displays "12/12 reps · On track"
      toggleSet(0)
      expect(setRows()[0].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')
      expect(setRows()[1].querySelector('.milestone-badge')).toBeNull()
      expect(setRows()[2].querySelector('.milestone-badge')).toBeNull()

      // Check set 1 (intermediate): displays "12/12 reps · On track"
      toggleSet(1)
      expect(setRows()[0].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')
      expect(setRows()[1].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')
      expect(setRows()[2].querySelector('.milestone-badge')).toBeNull()

      // Check set 2 (final planned set): all hit ceiling -> displays "All sets hit! +2.5 kg unlocked next session"
      toggleSet(2)
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('All sets hit! +2.5 kg unlocked next session')

      // Reactivity: editing set 0 reps down (from 12 to 11) removes on-track badge on set 0
      // and causes final set 2 to lose its "unlocked" milestone (falls back to "12/12 reps")
      bumpReps(0, -1)
      expect(useStore.getState().S.active.entries[0].sets[0].r).toBe(11)
      expect(setRows()[0].querySelector('.milestone-badge')).toBeNull()
      expect(setRows()[1].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps')

      // Reactivity: restoring set 0 to 12 reps unlocks the final set again
      bumpReps(0, 1)
      expect(setRows()[0].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('All sets hit! +2.5 kg unlocked next session')

      // Reactivity: unchecking set 0 clears its badge and removes unlocked on final set
      toggleSet(0)
      expect(setRows()[0].querySelector('.milestone-badge')).toBeNull()
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps')
    })

    it('displays rep progress badge when meeting rep progress aim against previous session', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double', sets: 2 },
        sets: [
          { r: 9, w: 14, done: false },
          { r: 8, w: 14, done: false }
        ]
      }
      view = renderWorkout([entry])

      // Seed previous session where weakest set was 8 reps
      act(() => {
        useStore.setState(s => ({
          S: {
            ...s.S,
            workouts: [
              {
                id: 'w-prev',
                d: '2026-08-10',
                entries: [
                  {
                    id: 'dumbbell-curl',
                    sets: [{ r: 8, w: 14, done: true }]
                  }
                ]
              }
            ]
          }
        }))
      })

      // Toggle set 0 with 9 reps (8 + 1) -> rep progress (+1)
      toggleSet(0)
      const setRows = view.container.querySelectorAll('.setrow')
      expect(setRows[0].querySelector('.milestone-badge')?.textContent).toBe('Rep progress (+1)')

      // Toggle set 1 with 8 reps -> falls short of progress aim (9 reps), no badge
      toggleSet(1)
      expect(setRows[1].querySelector('.milestone-badge')).toBeNull()
    })

    it('excludes warm-up sets from double progression milestone cues', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double', sets: 2 },
        sets: [
          { r: 12, w: 6, done: false, phase: 'warmup' },
          { r: 12, w: 14, done: false },
          { r: 12, w: 14, done: false }
        ]
      }
      view = renderWorkout([entry])

      const setRows = () => view.container.querySelectorAll('.setrow')

      // Check warm-up set (index 0) at 12 reps -> no milestone badge
      toggleSet(0)
      expect(setRows()[0].querySelector('.milestone-badge')).toBeNull()

      // Check work set 1 (index 1) at 12 reps -> intermediate on track
      toggleSet(1)
      expect(setRows()[1].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')

      // Check work set 2 (index 2) at 12 reps -> unlocked
      toggleSet(2)
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('All sets hit! +2.5 kg unlocked next session')
    })
  })

  describe('Greyskull LP progression in active workout view', () => {
    it('displays intermediate hit cues, AMRAP bonus cues, and double increment milestones', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'greyskull', sets: 3 },
        sets: [
          { r: 5, w: 60, done: false },
          { r: 5, w: 60, done: false },
          { r: 8, w: 60, done: false }
        ]
      }
      view = renderWorkout([entry])

      const setRows = () => view.container.querySelectorAll('.setrow')

      // Intermediate set 0 checked off at 5 reps
      toggleSet(0)
      expect(setRows()[0].querySelector('.milestone-badge')?.textContent).toBe('5/5 reps')

      // Intermediate set 1 checked off at 5 reps
      toggleSet(1)
      expect(setRows()[1].querySelector('.milestone-badge')?.textContent).toBe('5/5 reps')

      // AMRAP set 2 checked off at 8 reps (beats target by 3)
      toggleSet(2)
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('AMRAP +3')

      // Reactivity: bump reps up by 2 (from 8 to 10) -> doubles target reps (5 * 2) -> double increment unlocked!
      bumpReps(2, 1)
      bumpReps(2, 1)
      expect(useStore.getState().S.active.entries[0].sets[2].r).toBe(10)
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('Double increment unlocked! (+5 kg)')

      // Reactivity: bump reps down to 4 -> below target -> badge removed
      for (let k = 0; k < 6; k++) bumpReps(2, -1)
      expect(useStore.getState().S.active.entries[0].sets[2].r).toBe(4)
      expect(setRows()[2].querySelector('.milestone-badge')).toBeNull()

      // Reactivity: unchecking clears the badge
      toggleSet(2)
      expect(setRows()[2].querySelector('.milestone-badge')).toBeNull()
    })

    it('excludes warm-up sets under Greyskull LP from milestones', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'greyskull', sets: 2 },
        sets: [
          { r: 10, w: 20, done: false, phase: 'warmup' },
          { r: 5, w: 60, done: false },
          { r: 8, w: 60, done: false }
        ]
      }
      view = renderWorkout([entry])

      const setRows = () => view.container.querySelectorAll('.setrow')

      // Check warm-up set (index 0) at 10 reps -> silent, no badge
      toggleSet(0)
      expect(setRows()[0].querySelector('.milestone-badge')).toBeNull()

      // Check work set 1 at 5 reps -> 5/5 reps
      toggleSet(1)
      expect(setRows()[1].querySelector('.milestone-badge')?.textContent).toBe('5/5 reps')

      // Check AMRAP set 2 at 8 reps -> AMRAP +3
      toggleSet(2)
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('AMRAP +3')
    })
  })
})
