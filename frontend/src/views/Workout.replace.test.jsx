// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replaceActiveExerciseFlow } from './Workout.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { entry, resetViewTestState, seedActiveWorkout, renderWorkoutApp, cleanupViewTest } from '../test/view-harness.jsx'

const mocks = vi.hoisted(() => ({
  confirmSheet: vi.fn(),
  exercisePicker: vi.fn(),
  exConfigSheet: vi.fn(),
  exerciseDetailSheet: vi.fn(),
  topWeightSheet: vi.fn(),
  finishWorkout: vi.fn(),
  workoutCompleteSheet: vi.fn(),
  startFlow: vi.fn(),
}))

vi.mock('../sheets.jsx', () => mocks)
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

function headerReplaceButton(index = 0) {
  const buttons = [...view.container.querySelectorAll('button[aria-label="Replace exercise"]')]
  return buttons[index]
}

// Exercise-level edits live in the Edit workout sheet; open it before looking for one.
function inEditSheet(label, exact = false) {
  const find = () => [...document.querySelectorAll('button')].find(b => exact ? b.textContent.trim() === label : b.textContent.trim().includes(label))
  if (!find()) {
    const edit = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Edit workout')
    if (edit) act(() => { edit.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  }
  return find()
}

function footerReplaceButton() {
  return inEditSheet('Replace exercise', true)
}

function click(el) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  resetViewTestState()
  view = null
  mocks.confirmSheet.mockClear()
  mocks.exercisePicker.mockClear()
  mocks.exConfigSheet.mockClear()
})

afterEach(() => {
  cleanupViewTest(view)
  view = null
})

describe('Workout exercise replacement controls', () => {
  it('renders header and footer replace buttons and disables them while holding', () => {
    view = renderWorkoutApp([entry('1001')])

    const headerBtn = headerReplaceButton()
    const footerBtn = footerReplaceButton()

    expect(headerBtn).toBeTruthy()
    expect(headerBtn.disabled).toBe(false)
    expect(footerBtn).toBeTruthy()
    expect(footerBtn.disabled).toBe(false)

    act(() => useUI.getState().startWork(30, 'Hold', vi.fn()))

    expect(headerBtn.disabled).toBe(true)
    expect(footerBtn.disabled).toBe(true)

    act(() => useUI.getState().stopWork())

    expect(headerBtn.disabled).toBe(false)
    expect(footerBtn.disabled).toBe(false)
  })

  it('does not render replace buttons for an empty freestyle workout', () => {
    view = renderWorkoutApp([])

    expect(headerReplaceButton()).toBeUndefined()
    expect(footerReplaceButton()).toBeUndefined()
  })
})

describe('Workout unperformed entry replacement', () => {
  it('replaces immediately without confirmation sheet (header button)', () => {
    view = renderWorkoutApp([entry('1001', [{ w: 60, r: 5, done: false }, { w: 60, r: 5, done: false }])])

    click(headerReplaceButton())

    expect(mocks.confirmSheet).not.toHaveBeenCalled()
    expect(mocks.exercisePicker).toHaveBeenCalledOnce()

    // Exercise picker returns a new exercise
    const newEx = { id: '1002', n: 'Incline Bench Press' }
    act(() => {
      mocks.exercisePicker.mock.calls[0][0](newEx)
    })

    expect(mocks.exConfigSheet).toHaveBeenCalledOnce()
    const [exArg, existingArg, onSave, onDeleteArg, routineArg, seedArg, onReplaceArg, actionLabelArg] = mocks.exConfigSheet.mock.calls[0]
    expect(exArg).toEqual(newEx)
    expect(existingArg).toBeNull()
    expect(onDeleteArg).toBeNull()
    expect(routineArg).toBeUndefined()
    expect(seedArg).toEqual(expect.objectContaining({ sets: 2 }))
    expect(onReplaceArg).toBeNull()
    expect(actionLabelArg).toBe('Replace')

    // Saving config commits the replacement via store
    act(() => {
      onSave({ sets: 3, reps: 8, weight: 50 })
    })

    const A = useStore.getState().S.active
    expect(A.entries[0].id).toBe('1002')
  })

  it('replaces immediately from footer replace button for single exercise', () => {
    view = renderWorkoutApp([entry('1001', [{ w: 60, r: 5, done: false }])])

    click(footerReplaceButton())

    expect(mocks.confirmSheet).not.toHaveBeenCalled()
    expect(mocks.exercisePicker).toHaveBeenCalledOnce()
  })

  it('seeds config with routine context and planned non-warmup sets', () => {
    const routineId = 'routine-legs'
    view = renderWorkoutApp([
      {
        id: '1001',
        target: { sets: 3, reps: 8 },
        sets: [
          { w: 40, r: 8, done: false, warmup: true },
          { w: 80, r: 8, done: false },
          { w: 80, r: 8, done: false },
        ]
      }
    ])
    act(() => {
      useStore.getState().update(s => {
        s.routines = [{ id: routineId, name: 'Leg Day', ex: [{ id: '1001', sets: 3 }] }]
        s.workouts = [
          {
            d: '2026-10-01',
            routineId,
            entries: [{ id: '1003', target: { sets: 3, reps: 12, weight: 100 }, sets: [{ w: 100, r: 12, done: true }] }],
          },
        ]
        s.active.routineId = routineId
      })
    })

    click(headerReplaceButton())

    const newEx = { id: '1003', n: 'Leg Press' }
    act(() => {
      mocks.exercisePicker.mock.calls[0][0](newEx)
    })

    expect(mocks.exConfigSheet).toHaveBeenCalledOnce()
    const [, , onSave, , routineArg, seedArg, , actionLabelArg] = mocks.exConfigSheet.mock.calls[0]
    expect(routineArg).toEqual(expect.objectContaining({ id: routineId }))
    expect(seedArg).toEqual(expect.objectContaining({ sets: 2, reps: 12, weight: 100 })) // pre-seeded from routine history + 2 work sets
    expect(actionLabelArg).toBe('Replace')

    act(() => {
      onSave({ sets: 2, reps: 10, weight: 120 })
    })

    expect(useStore.getState().S.active.entries[0].id).toBe('1003')
  })
})

describe('Workout performed entry replacement', () => {
  it('shows confirmation sheet before proceeding to picker', () => {
    view = renderWorkoutApp([
      entry('1001', [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: false }])
    ])

    click(headerReplaceButton())

    expect(mocks.confirmSheet).toHaveBeenCalledOnce()
    expect(mocks.exercisePicker).not.toHaveBeenCalled()

    const confirmOpts = mocks.confirmSheet.mock.calls[0][0]
    expect(confirmOpts.title).toContain('Replace')
    expect(confirmOpts.message).toBe('The sets you logged for this exercise in this session will be lost.')
    expect(confirmOpts.confirmText).toBe('Replace')
    expect(confirmOpts.danger).toBe(true)

    // Confirming proceeds to picker
    act(() => {
      confirmOpts.onConfirm()
    })

    expect(mocks.exercisePicker).toHaveBeenCalledOnce()

    const newEx = { id: '1002', n: 'Incline Bench Press' }
    act(() => {
      mocks.exercisePicker.mock.calls[0][0](newEx)
    })

    expect(mocks.exConfigSheet).toHaveBeenCalledOnce()
    act(() => {
      mocks.exConfigSheet.mock.calls[0][2]({ sets: 2, reps: 8, weight: 50 })
    })

    expect(useStore.getState().S.active.entries[0].id).toBe('1002')
  })

  it('leaves the entry untouched if replacement is cancelled', () => {
    view = renderWorkoutApp([
      entry('1001', [{ w: 60, r: 5, done: true }])
    ])

    click(headerReplaceButton())

    expect(mocks.confirmSheet).toHaveBeenCalledOnce()
    expect(mocks.exercisePicker).not.toHaveBeenCalled()

    // Without confirming, entry is unchanged
    expect(useStore.getState().S.active.entries[0].id).toBe('1001')
  })
})

describe('Hold timer halted on replace', () => {
  it('halts any running hold timer prior to replacement when no confirmation is needed', () => {
    seedActiveWorkout([entry('1001')])
    const timerCallback = vi.fn()
    useUI.getState().startWork(30, 'Plank', timerCallback)
    expect(useUI.getState().work).not.toBeNull()

    replaceActiveExerciseFlow(0)

    expect(useUI.getState().work).toBeNull()
  })

  it('does not halt hold timer when confirmation sheet is shown, only halts when confirmed', () => {
    seedActiveWorkout([
      entry('1001', [{ w: 60, r: 5, done: true }])
    ])
    const timerCallback = vi.fn()
    useUI.getState().startWork(30, 'Plank', timerCallback)
    expect(useUI.getState().work).not.toBeNull()

    replaceActiveExerciseFlow(0)

    // Confirmation sheet shown, hold timer must still be running!
    expect(mocks.confirmSheet).toHaveBeenCalledOnce()
    expect(useUI.getState().work).not.toBeNull()

    // Confirming replacement halts the timer
    const confirmOpts = mocks.confirmSheet.mock.calls[0][0]
    act(() => {
      confirmOpts.onConfirm()
    })

    expect(useUI.getState().work).toBeNull()
  })

  it('leaves hold timer running if confirmation is cancelled', () => {
    seedActiveWorkout([
      entry('1001', [{ w: 60, r: 5, done: true }])
    ])
    const timerCallback = vi.fn()
    useUI.getState().startWork(30, 'Plank', timerCallback)
    expect(useUI.getState().work).not.toBeNull()

    replaceActiveExerciseFlow(0)

    expect(mocks.confirmSheet).toHaveBeenCalledOnce()
    expect(useUI.getState().work).not.toBeNull()
  })
})

describe('Superset replacement flow', () => {
  it('header replace button on each exercise targets that exercise directly', () => {
    view = renderWorkoutApp([
      { ...entry('1001'), sg: 'g1' },
      { ...entry('1002'), sg: 'g1' }
    ])

    // There should be two header replace buttons
    const header0 = headerReplaceButton(0)
    const header1 = headerReplaceButton(1)
    expect(header0).toBeTruthy()
    expect(header1).toBeTruthy()

    // Clicking header 1 directly replaces entry 1
    click(header1)

    expect(mocks.confirmSheet).not.toHaveBeenCalled()
    expect(mocks.exercisePicker).toHaveBeenCalledOnce()

    const newEx = { id: '1003', n: 'Cable Row' }
    act(() => {
      mocks.exercisePicker.mock.calls[0][0](newEx)
    })

    act(() => {
      mocks.exConfigSheet.mock.calls[0][2]({ sets: 1, reps: 10, weight: 40 })
    })

    const A = useStore.getState().S.active
    expect(A.entries[0].id).toBe('1001')
    expect(A.entries[1].id).toBe('1003')
    expect(A.entries[1].sg).toBe('g1')
  })

  it('footer replace button in a superset prompts which exercise to replace', () => {
    view = renderWorkoutApp([
      { ...entry('1001'), sg: 'g1' },
      { ...entry('1002'), sg: 'g1' }
    ])

    click(footerReplaceButton())

    // A sheet should open asking which exercise in this superset to replace
    expect(useUI.getState().sheets.length).toBeGreaterThan(0)
    expect(view.container.textContent).toContain('Which exercise in this superset do you want to replace?')

    // Select the second exercise in the prompt sheet
    const items = [...view.container.querySelectorAll('.list .item')]
    expect(items.length).toBe(2)

    click(items[1])

    // Should proceed to exercise picker for entry 1
    expect(mocks.exercisePicker).toHaveBeenCalledOnce()

    const newEx = { id: '1003', n: 'Cable Row' }
    act(() => {
      mocks.exercisePicker.mock.calls[0][0](newEx)
    })

    act(() => {
      mocks.exConfigSheet.mock.calls[0][2]({ sets: 1, reps: 10, weight: 40 })
    })

    const A = useStore.getState().S.active
    expect(A.entries[0].id).toBe('1001')
    expect(A.entries[1].id).toBe('1003')
    expect(A.entries[1].sg).toBe('g1')
  })
})

describe('replace-exercise prompt strings', () => {
  const required = [
    'Replace {0}?',
    'The sets you logged for this exercise in this session will be lost.',
    'Replace',
    'Which exercise in this superset do you want to replace?',
    'Replace exercise',
  ]
  const strings = import.meta.glob('./Workout.jsx', { eager: true, query: '?raw', import: 'default' })

  it('keeps every replace-flow string in the source that renders it', () => {
    expect(Object.keys(strings)).toHaveLength(1)
    const src = Object.values(strings)[0]
    required.forEach(key => {
      const esc = key.replace(/[{}?]/g, '\\$&')
      expect(src).toMatch(new RegExp(`['"\`]${esc}['"\`]`))
    })
  })
})
