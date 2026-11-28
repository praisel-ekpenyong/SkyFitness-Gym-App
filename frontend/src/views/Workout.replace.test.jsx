// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replaceActiveExerciseFlow } from '../sheets/session.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { entry, resetViewTestState, seedActiveWorkout, renderWorkoutApp, cleanupViewTest } from '../test/view-harness.jsx'

const mocks = vi.hoisted(() => ({
  confirmSheet: vi.fn(),
  exercisePicker: vi.fn(),
  exConfigSheet: vi.fn(),
  finishWorkout: vi.fn(),
  workoutCompleteSheet: vi.fn(),
  startFlow: vi.fn(),
}))

vi.mock('../sheets/confirm.jsx', () => ({ confirmSheet: mocks.confirmSheet }))
vi.mock('../sheets/exercise-picker.jsx', async (importOriginal) => ({ ...await importOriginal(), exercisePicker: mocks.exercisePicker }))
vi.mock('../sheets/exercise-config.jsx', async (importOriginal) => ({ ...await importOriginal(), exConfigSheet: mocks.exConfigSheet }))
vi.mock('../platform/sound.js', async orig => (await import('../test/platform-mocks.js')).mockSound(await orig()))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let view

function headerReplaceButton(index = 0) {
  const buttons = [...view.container.querySelectorAll('button[aria-label="Replace exercise"]')]
  return buttons[index]
}

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

    act(() => useUI.getState().startWork(30, 'Hold', vi.fn(), () => true))

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

    const newEx = { id: '1002', n: 'Incline Bench Press' }
    act(() => {
      mocks.exercisePicker.mock.calls[0][0](newEx)
    })

    expect(mocks.exConfigSheet).toHaveBeenCalledOnce()
    const [exArg, { existing: existingArg, onSave, onDelete: onDeleteArg, routine: routineArg, initial: seedArg, onReplace: onReplaceArg, actionLabel: actionLabelArg }] = mocks.exConfigSheet.mock.calls[0]
    expect(exArg).toEqual(newEx)
    expect(existingArg).toBeUndefined()
    expect(onDeleteArg).toBeUndefined()
    expect(routineArg).toBeUndefined()
    expect(seedArg).toEqual(expect.objectContaining({ sets: 2 }))
    expect(onReplaceArg).toBeUndefined()
    expect(actionLabelArg).toBe('Replace')

    act(() => {
      onSave({ sets: 3, reps: 8, weight: 50 })
    })

    const A = useStore.getState().S.active
    expect(A.entries[0].id).toBe('1002')
  })

  it('puts the footer-picked exercise and its saved config into the Active workout', () => {
    view = renderWorkoutApp([entry('1001', [{ w: 60, r: 5, done: false }])])

    click(footerReplaceButton())

    // Supporting evidence only: unperformed sets skip confirmation and open the picker.
    expect(mocks.confirmSheet).not.toHaveBeenCalled()
    expect(mocks.exercisePicker).toHaveBeenCalledOnce()

    const newEx = { id: '1002', n: 'Incline Bench Press' }
    act(() => {
      mocks.exercisePicker.mock.calls[0][0](newEx)
    })
    act(() => {
      mocks.exConfigSheet.mock.calls[0][1].onSave({ sets: 3, reps: 8, weight: 50 })
    })

    const A = useStore.getState().S.active
    expect(A.entries[0]).toEqual({
      id: '1002',
      target: { sets: 3, reps: 8, weight: 50 },
      plan: null,
      sets: [
        expect.objectContaining({ w: 50, r: 8, done: false }),
        expect.objectContaining({ w: 50, r: 8, done: false }),
        expect.objectContaining({ w: 50, r: 8, done: false }),
      ],
    })
  })

  it('seeds config with routine context and planned non-warmup sets', () => {
    const routineId = 'routine-legs'
    view = renderWorkoutApp([
      {
        id: '1001',
        target: { sets: 3, reps: 8 },
        sets: [
          { w: 40, r: 8, done: false, phase: 'warmup' },
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
    const [, { onSave, routine: routineArg, initial: seedArg, actionLabel: actionLabelArg }] = mocks.exConfigSheet.mock.calls[0]
    expect(routineArg).toEqual(expect.objectContaining({ id: routineId }))
    expect(seedArg).toEqual(expect.objectContaining({ sets: 2, reps: 12, weight: 100 }))
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
      mocks.exConfigSheet.mock.calls[0][1].onSave({ sets: 2, reps: 8, weight: 50 })
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

    expect(useStore.getState().S.active.entries[0].id).toBe('1001')
  })
})

describe('Replace goes through the view\'s sender', () => {
  it('sends the replaceExercise command through the sender it was given, so its effects run', () => {
    seedActiveWorkout([entry('1001')])
    const sent = []
    const send = command => { sent.push(command.type); return useStore.getState().act(command, send) }

    replaceActiveExerciseFlow(0, send)
    act(() => { mocks.exercisePicker.mock.calls[0][0]({ id: '1002', n: 'Incline Bench Press' }) })
    act(() => { mocks.exConfigSheet.mock.calls[0][1].onSave({ sets: 1, reps: 10, weight: 40 }) })

    expect(sent).toEqual(['replaceExercise'])
    expect(useStore.getState().S.active.entries[0].id).toBe('1002')
  })
})

describe('Hold timer halted on replace', () => {
  it('halts any running hold timer prior to replacement when no confirmation is needed', () => {
    seedActiveWorkout([entry('1001')])
    const timerCallback = vi.fn()
    useUI.getState().startWork(30, 'Plank', timerCallback, () => true)
    expect(useUI.getState().work).not.toBeNull()

    replaceActiveExerciseFlow(0, command => useStore.getState().act(command))

    expect(useUI.getState().work).toBeNull()
  })

  it('does not halt hold timer when confirmation sheet is shown, only halts when confirmed', () => {
    seedActiveWorkout([
      entry('1001', [{ w: 60, r: 5, done: true }])
    ])
    const timerCallback = vi.fn()
    useUI.getState().startWork(30, 'Plank', timerCallback, () => true)
    expect(useUI.getState().work).not.toBeNull()

    replaceActiveExerciseFlow(0, command => useStore.getState().act(command))

    expect(mocks.confirmSheet).toHaveBeenCalledOnce()
    expect(useUI.getState().work).not.toBeNull()

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
    useUI.getState().startWork(30, 'Plank', timerCallback, () => true)
    expect(useUI.getState().work).not.toBeNull()

    replaceActiveExerciseFlow(0, command => useStore.getState().act(command))

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

    const header0 = headerReplaceButton(0)
    const header1 = headerReplaceButton(1)
    expect(header0).toBeTruthy()
    expect(header1).toBeTruthy()

    click(header1)

    expect(mocks.confirmSheet).not.toHaveBeenCalled()
    expect(mocks.exercisePicker).toHaveBeenCalledOnce()

    const newEx = { id: '1003', n: 'Cable Row' }
    act(() => {
      mocks.exercisePicker.mock.calls[0][0](newEx)
    })

    act(() => {
      mocks.exConfigSheet.mock.calls[0][1].onSave({ sets: 1, reps: 10, weight: 40 })
    })

    const A = useStore.getState().S.active
    expect(A.entries[0].id).toBe('1001')
    expect(A.entries[1].id).toBe('1003')
  })

  it('footer replace button in a superset prompts which exercise to replace', () => {
    view = renderWorkoutApp([
      { ...entry('1001'), sg: 'g1' },
      { ...entry('1002'), sg: 'g1' }
    ])

    click(footerReplaceButton())

    expect(useUI.getState().sheets.length).toBeGreaterThan(0)
    expect(view.container.textContent).toContain('Which exercise in this superset do you want to replace?')

    const items = [...view.container.querySelectorAll('.list .item')]
    expect(items.length).toBe(2)

    click(items[1])

    expect(mocks.exercisePicker).toHaveBeenCalledOnce()

    const newEx = { id: '1003', n: 'Cable Row' }
    act(() => {
      mocks.exercisePicker.mock.calls[0][0](newEx)
    })

    act(() => {
      mocks.exConfigSheet.mock.calls[0][1].onSave({ sets: 1, reps: 10, weight: 40 })
    })

    const A = useStore.getState().S.active
    expect(A.entries[0].id).toBe('1001')
    expect(A.entries[1].id).toBe('1003')
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
  const strings = {
    ...import.meta.glob('./Workout.jsx', { eager: true, query: '?raw', import: 'default' }),
    ...import.meta.glob('../sheets/session.jsx', { eager: true, query: '?raw', import: 'default' }),
    ...import.meta.glob('../sheets/edit-workout.jsx', { eager: true, query: '?raw', import: 'default' }),
  }

  it('keeps every replace-flow string in the source that renders it', () => {
    expect(Object.keys(strings)).toHaveLength(3)
    const src = Object.values(strings).join('\n')
    required.forEach(key => {
      const esc = key.replace(/[{}?]/g, '\\$&')
      expect(src).toMatch(new RegExp(`['"\`]${esc}['"\`]`))
    })
  })
})
