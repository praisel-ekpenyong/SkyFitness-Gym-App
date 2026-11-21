// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { resetViewTestState, renderWorkout, cleanupViewTest } from '../test/view-harness.jsx'

vi.mock('../platform/sound.js', () => ({
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

    expect(view.container.querySelector('.milestone-badge')).toBeNull()

    toggleSet(0)

    const badge = view.container.querySelector('.milestone-badge')
    expect(badge).not.toBeNull()
    expect(badge.textContent).toBe('5/5 reps')

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
    expect(badge.textContent).toBe('All sets hit! +5s unlocked next session')
  })

  it('does not display a milestone badge for warm-up sets', () => {
    const entry = {
      id: 'barbell-bench-press',
      target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
      sets: [
        { r: 5, w: 20, done: false, phase: 'warmup' },
        { r: 5, w: 60, done: false },
        { r: 5, w: 60, done: false }
      ]
    }
    view = renderWorkout([entry])

    toggleSet(0)

    const setRows = view.container.querySelectorAll('.setrow')
    expect(setRows[0].querySelector('.milestone-badge')).toBeNull()

    toggleSet(1)
    expect(setRows[1].querySelector('.milestone-badge')).not.toBeNull()
    expect(setRows[1].querySelector('.milestone-badge').textContent).toBe('5/5 reps')
  })

  it('displays unlocked milestone on final work set under linear progression when all work sets hit target reps', () => {
    const entry = {
      id: 'barbell-bench-press',
      target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear', sets: 2 },
      sets: [
        { r: 5, w: 60, done: false },
        { r: 5, w: 60, done: false }
      ]
    }
    view = renderWorkout([entry])

    toggleSet(0)
    const setRows = view.container.querySelectorAll('.setrow')
    expect(setRows[0].querySelector('.milestone-badge')?.textContent).toBe('5/5 reps')

    toggleSet(1)
    expect(setRows[1].querySelector('.milestone-badge')?.textContent).toBe('All sets hit! +2.5 kg unlocked next session')
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

      toggleSet(0)
      expect(setRows()[0].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')
      expect(setRows()[1].querySelector('.milestone-badge')).toBeNull()
      expect(setRows()[2].querySelector('.milestone-badge')).toBeNull()

      toggleSet(1)
      expect(setRows()[0].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')
      expect(setRows()[1].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')
      expect(setRows()[2].querySelector('.milestone-badge')).toBeNull()

      toggleSet(2)
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('All sets hit! +2.5 kg unlocked next session')

      bumpReps(0, -1)
      expect(useStore.getState().S.active.entries[0].sets[0].r).toBe(11)
      expect(setRows()[0].querySelector('.milestone-badge')).toBeNull()
      expect(setRows()[1].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps')

      bumpReps(0, 1)
      expect(setRows()[0].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('All sets hit! +2.5 kg unlocked next session')

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
          { r: 9, w: 14, done: false }
        ]
      }
      view = renderWorkout([entry])

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
                    target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double', sets: 2 },
                    sets: [{ r: 8, w: 14, done: true }, { r: 8, w: 14, done: true }]
                  }
                ]
              }
            ]
          }
        }))
      })

      const setRows = () => view.container.querySelectorAll('.setrow')

      toggleSet(0)
      expect(setRows()[0].querySelector('.milestone-badge')).toBeNull()

      toggleSet(1)
      expect(setRows()[1].querySelector('.milestone-badge')?.textContent).toBe('Rep progress (+1)')
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

      toggleSet(0)
      expect(setRows()[0].querySelector('.milestone-badge')).toBeNull()

      toggleSet(1)
      expect(setRows()[1].querySelector('.milestone-badge')?.textContent).toBe('12/12 reps · On track')

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

      toggleSet(0)
      expect(setRows()[0].querySelector('.milestone-badge')?.textContent).toBe('5/5 reps')

      toggleSet(1)
      expect(setRows()[1].querySelector('.milestone-badge')?.textContent).toBe('5/5 reps')

      toggleSet(2)
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('AMRAP +3 · +2.5 kg unlocked next session')

      bumpReps(2, 1)
      bumpReps(2, 1)
      expect(useStore.getState().S.active.entries[0].sets[2].r).toBe(10)
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('AMRAP +5 · +5 kg unlocked next session')

      for (let k = 0; k < 6; k++) bumpReps(2, -1)
      expect(useStore.getState().S.active.entries[0].sets[2].r).toBe(4)
      expect(setRows()[2].querySelector('.milestone-badge')).toBeNull()

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

      toggleSet(0)
      expect(setRows()[0].querySelector('.milestone-badge')).toBeNull()

      toggleSet(1)
      expect(setRows()[1].querySelector('.milestone-badge')?.textContent).toBe('5/5 reps')

      toggleSet(2)
      expect(setRows()[2].querySelector('.milestone-badge')?.textContent).toBe('AMRAP +3 · +2.5 kg unlocked next session')
    })
  })

  describe('Workout progline prescription display', () => {
    it('renders progline with up class and arrowUp icon when plan.kind is up', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
        plan: { kind: 'up', why: ['Every rep last time — 2.5 kg more.', 2.5, 'kg'] },
        sets: [{ r: 5, w: 62.5, done: false }]
      }
      view = renderWorkout([entry])
      const progline = view.container.querySelector('.progline')
      expect(progline).not.toBeNull()
      expect(progline.className).toBe('progline up')
      expect(progline.querySelector('svg')).not.toBeNull()
      expect(progline.textContent).toContain('Every rep last time')
    })

    it('renders progline with neutral class (no .warn) and info icon when plan.kind is deload', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
        plan: { kind: 'deload', why: ['Missed reps — reset to 54 kg and work back up.', 54, 'kg'] },
        sets: [{ r: 5, w: 54, done: false }]
      }
      view = renderWorkout([entry])
      const progline = view.container.querySelector('.progline')
      expect(progline).not.toBeNull()
      expect(progline.className).toBe('progline')
      expect(view.container.querySelector('.warn')).toBeNull()
      expect(progline.querySelector('svg')).not.toBeNull()
      expect(progline.textContent).toContain('Missed reps')
    })

    it('renders progline with neutral class and arrowDown icon when plan.kind is down', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 10, weight: 60, prog: 'double' },
        plan: { kind: 'down', why: ['First set 6 reps, below the 8–10 range. 2.5 kg less, back to 8 reps.', 6, 8, 10, 2.5, 'kg'] },
        sets: [{ r: 8, w: 57.5, done: false }]
      }
      view = renderWorkout([entry])
      const progline = view.container.querySelector('.progline')
      expect(progline).not.toBeNull()
      expect(progline.className).toBe('progline')
      expect(view.container.querySelector('.warn')).toBeNull()
      expect(progline.querySelector('svg')).not.toBeNull()
      expect(progline.textContent).toContain('First set 6 reps')
    })

    it('renders progline with lightbulb icon for hold and baseline first prescriptions', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
        plan: { kind: 'hold', why: ['Missed reps last time — same weight again (1 of 3 to go).', 1, 3] },
        sets: [{ r: 5, w: 60, done: false }]
      }
      view = renderWorkout([entry])
      const progline = view.container.querySelector('.progline')
      expect(progline).not.toBeNull()
      expect(progline.className).toBe('progline')
      expect(progline.querySelector('svg')).not.toBeNull()
      expect(progline.textContent).toContain('Missed reps last time')
    })

    it('does not render progline when plan.kind is off', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'off' },
        plan: { kind: 'off', why: ['No automatic progression'] },
        sets: [{ r: 5, w: 60, done: false }]
      }
      view = renderWorkout([entry])
      expect(view.container.querySelector('.progline')).toBeNull()
    })
  })
})
