// @vitest-environment happy-dom
import { act } from 'react'
import { fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { resetViewTestState, renderWorkout, cleanupViewTest } from '../test/view-harness.jsx'

vi.mock('../platform/sound.js', async orig => (await import('../test/platform-mocks.js')).mockSound(await orig()))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let view

const screen = () => within(view.container)
const checkboxes = () => screen().getAllByRole('checkbox')
const toggleSet = (index = 0) => fireEvent.click(checkboxes()[index])
// Set numbers count work sets from 1, as the stepper labels do.
const bumpReps = (setNumber, dir) => fireEvent.click(screen().getByRole('button', { name: `${dir < 0 ? 'Decrease' : 'Increase'} Set ${setNumber} Reps` }))
const milestones = () => screen().queryAllByRole('status', { name: /^Milestone: / })
// A set's badge is the milestone that sits after its checkbox and before the next set's.
const badgeOf = index => {
  const boxes = checkboxes()
  const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
  return milestones().find(m => after(boxes[index], m) && !(boxes[index + 1] && after(boxes[index + 1], m))) ?? null
}
const labelOf = index => badgeOf(index)?.textContent

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

    expect(milestones()).toHaveLength(0)

    toggleSet(0)

    expect(labelOf(0)).toBe('5/5 reps')
    expect(badgeOf(1)).toBeNull()
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

    expect(milestones()).toHaveLength(0)

    toggleSet(0)

    expect(labelOf(0)).toBe('All sets hit! +5s unlocked next session')
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

    expect(badgeOf(0)).toBeNull()

    toggleSet(1)
    expect(labelOf(1)).toBe('5/5 reps')
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
    expect(labelOf(0)).toBe('5/5 reps')

    toggleSet(1)
    expect(labelOf(1)).toBe('All sets hit! +2.5 kg unlocked next session')
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

    expect(milestones()).toHaveLength(0)
  })

  it('reads the cue through the Prospective Prescription when the Active unit differs from the Profile unit', () => {
    const entry = {
      id: 'barbell-bench-press',
      target: { mode: 'reps', reps: 5, weight: 135, prog: 'linear', sets: 2, inc: 5 },
      sets: [
        { r: 5, w: 135, done: false },
        { r: 5, w: 135, done: false },
      ]
    }
    view = renderWorkout([entry])

    act(() => {
      useStore.setState(s => ({ S: { ...s.S, active: { ...s.S.active, unit: 'lb' }, unit: 'kg' } }))
    })

    toggleSet(0)
    toggleSet(1)

    expect(labelOf(1)).toBe('All sets hit! +5 lb unlocked next session')
  })

  it('reads the cue from the logged Workout when the Active id is already in the Training log', () => {
    const entry = {
      id: 'barbell-bench-press',
      target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear', sets: 2 },
      sets: [
        { r: 5, w: 60, done: false },
        { r: 5, w: 60, done: false },
      ]
    }
    view = renderWorkout([entry])

    act(() => {
      useStore.setState(s => ({
        S: {
          ...s.S,
          workouts: [{
            id: 'view-test',
            d: '2026-08-10',
            start: 0,
            end: 1,
            routineId: null,
            name: '',
            bw: null,
            unit: 'kg',
            entries: [{
              id: 'barbell-bench-press',
              target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear', sets: 2 },
              sets: [{ r: 3, w: 60, done: true }, { r: 3, w: 60, done: true }]
            }]
          }]
        }
      }))
    })

    toggleSet(0)
    toggleSet(1)

    expect(labelOf(1)).toBe('5/5 reps')
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

    expect(milestones()).toHaveLength(1)

    toggleSet(0)

    expect(milestones()).toHaveLength(0)
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

    expect(milestones()).toHaveLength(1)

    bumpReps(1, -1)

    expect(useStore.getState().S.active.entries[0].sets[0].r).toBe(4)
    expect(milestones()).toHaveLength(0)
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

      toggleSet(0)
      expect(labelOf(0)).toBe('12/12 reps · On track')
      expect(badgeOf(1)).toBeNull()
      expect(badgeOf(2)).toBeNull()

      toggleSet(1)
      expect(labelOf(0)).toBe('12/12 reps · On track')
      expect(labelOf(1)).toBe('12/12 reps · On track')
      expect(badgeOf(2)).toBeNull()

      toggleSet(2)
      expect(labelOf(2)).toBe('All sets hit! +2.5 kg unlocked next session')

      bumpReps(1, -1)
      expect(useStore.getState().S.active.entries[0].sets[0].r).toBe(11)
      expect(badgeOf(0)).toBeNull()
      expect(labelOf(1)).toBe('12/12 reps · On track')
      expect(labelOf(2)).toBe('12/12 reps')

      bumpReps(1, 1)
      expect(labelOf(0)).toBe('12/12 reps · On track')
      expect(labelOf(2)).toBe('All sets hit! +2.5 kg unlocked next session')

      toggleSet(0)
      expect(badgeOf(0)).toBeNull()
      expect(labelOf(2)).toBe('12/12 reps')
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

      toggleSet(0)
      expect(badgeOf(0)).toBeNull()

      toggleSet(1)
      expect(labelOf(1)).toBe('Rep progress (+1)')
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

      toggleSet(0)
      expect(badgeOf(0)).toBeNull()

      toggleSet(1)
      expect(labelOf(1)).toBe('12/12 reps · On track')

      toggleSet(2)
      expect(labelOf(2)).toBe('All sets hit! +2.5 kg unlocked next session')
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

      toggleSet(0)
      expect(labelOf(0)).toBe('5/5 reps')

      toggleSet(1)
      expect(labelOf(1)).toBe('5/5 reps')

      toggleSet(2)
      expect(labelOf(2)).toBe('AMRAP +3 · +2.5 kg unlocked next session')

      bumpReps(3, 1)
      bumpReps(3, 1)
      expect(useStore.getState().S.active.entries[0].sets[2].r).toBe(10)
      expect(labelOf(2)).toBe('AMRAP +5 · +5 kg unlocked next session')

      for (let k = 0; k < 6; k++) bumpReps(3, -1)
      expect(useStore.getState().S.active.entries[0].sets[2].r).toBe(4)
      expect(badgeOf(2)).toBeNull()

      toggleSet(2)
      expect(badgeOf(2)).toBeNull()
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

      toggleSet(0)
      expect(badgeOf(0)).toBeNull()

      toggleSet(1)
      expect(labelOf(1)).toBe('5/5 reps')

      toggleSet(2)
      expect(labelOf(2)).toBe('AMRAP +3 · +2.5 kg unlocked next session')
    })
  })

  describe('Workout progline prescription display', () => {
    const lineWith = text => screen().getByText(text).parentElement

    it('shows the reason and marks it as a rise when plan.kind is up', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
        plan: { kind: 'up', why: ['Every rep last time — 2.5 kg more.', 2.5, 'kg'] },
        sets: [{ r: 5, w: 62.5, done: false }]
      }
      view = renderWorkout([entry])
      expect(lineWith(/Every rep last time/).classList.contains('up'), 'a rise is told apart by colour alone').toBe(true)
    })

    it.each([
      ['deload', ['Missed reps — reset to 54 kg and work back up.', 54, 'kg'], /Missed reps — reset/],
      ['down', ['First set 6 reps, below the 8–10 range. 2.5 kg less, back to 8 reps.', 6, 8, 10, 2.5, 'kg'], /First set 6 reps/],
      ['hold', ['Missed reps last time — same weight again (1 of 3 to go).', 1, 3], /Missed reps last time/],
    ])('shows the reason with no emphasis when plan.kind is %s', (kind, why, text) => {
      view = renderWorkout([{
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
        plan: { kind, why },
        sets: [{ r: 5, w: 60, done: false }]
      }])
      expect(lineWith(text).classList.contains('up')).toBe(false)
    })

    it('shows nothing when plan.kind is off', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'off' },
        plan: { kind: 'off', why: ['No automatic progression'] },
        sets: [{ r: 5, w: 60, done: false }]
      }
      view = renderWorkout([entry])
      expect(screen().queryByText(/No automatic progression/)).toBeNull()
    })
  })
})
