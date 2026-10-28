// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import RoutineEdit from './RoutineEdit.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

const mocks = vi.hoisted(() => ({
  nav: vi.fn(),
  exConfigSheet: vi.fn(),
  exercisePicker: vi.fn(),
  glyphPicker: vi.fn(),
  confirmSheet: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.nav,
  useParams: () => ({ id: 'r-test-1' }),
}))

vi.mock('../sheets.jsx', () => ({
  exConfigSheet: mocks.exConfigSheet,
  exercisePicker: mocks.exercisePicker,
  glyphPicker: mocks.glyphPicker,
  confirmSheet: mocks.confirmSheet,
}))

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  const st = JSON.parse(JSON.stringify(DEF))
  st.routines = [
    {
      id: 'r-test-1',
      name: 'Push Day',
      emoji: '💪',
      ex: [
        { id: '0001', sets: 4, reps: 10, weight: 20, mode: 'reps', sg: 'sg-0-1' },
        { id: '0002', sets: 4, reps: 12, weight: 15, mode: 'reps', sg: 'sg-0-1' },
        { id: '0003', sets: 3, reps: 8, weight: 50, mode: 'reps' },
      ],
    },
  ]
  st.exWeights = {
    '0004': { w: 65 },
  }
  st.workouts = [
    {
      id: 'w-prev',
      routineId: 'r-test-1',
      entries: [
        {
          id: '0004',
          target: { sets: 3, reps: 8, weight: 65, mode: 'reps' },
          sets: [{ w: 65, r: 8, done: true }],
        },
      ],
    },
  ]
  useStore.getState().replaceState(st)
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  mocks.nav.mockReset()
  mocks.exConfigSheet.mockReset()
  mocks.exercisePicker.mockReset()
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('RoutineEdit exercise replacement', () => {
  it('opens exConfigSheet with an onReplace callback when clicking an exercise', async () => {
    await act(async () => {
      root.render(<RoutineEdit />)
    })

    const items = container.querySelectorAll('.list .item')
    expect(items.length).toBe(3)

    // Click on the first exercise
    await act(async () => {
      items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.exConfigSheet).toHaveBeenCalledTimes(1)
    const [ex, e, onSave, onDelete, r, initial, onReplace] = mocks.exConfigSheet.mock.calls[0]
    expect(ex.id).toBe('0001')
    expect(e.id).toBe('0001')
    expect(e.sets).toBe(4)
    expect(typeof onReplace).toBe('function')
  })

  it('tapping onReplace launches exercisePicker and replaces exercise in-place preserving superset sg', async () => {
    await act(async () => {
      root.render(<RoutineEdit />)
    })

    const items = container.querySelectorAll('.list .item')
    // Click on the first exercise (which is in superset sg-0-1)
    await act(async () => {
      items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const [, e, , , , , onReplace] = mocks.exConfigSheet.mock.calls[0]

    // Trigger onReplace callback
    await act(async () => {
      onReplace()
    })

    // exercisePicker should be launched
    expect(mocks.exercisePicker).toHaveBeenCalledTimes(1)
    const pickerCallback = mocks.exercisePicker.mock.calls[0][0]
    expect(typeof pickerCallback).toBe('function')

    // Simulate choosing replacement exercise 0004
    const newEx = { id: '0004', n: 'Replacement Lift', bp: 'chest', tg: 'chest', eq: 'barbell' }
    await act(async () => {
      pickerCallback(newEx)
    })

    // exConfigSheet should be opened for newEx pre-seeded with e.sets and newEx defaults/history
    expect(mocks.exConfigSheet).toHaveBeenCalledTimes(2)
    const [replEx, replExisting, replOnSave, replOnDelete, replR, replInitial] = mocks.exConfigSheet.mock.calls[1]
    expect(replEx.id).toBe('0004')
    expect(replExisting).toBeNull()
    expect(replInitial).toMatchObject({
      sets: 4, // pre-seeded from e.sets
      weight: 65, // from history/exWeights
    })

    // Save replacement config
    await act(async () => {
      replOnSave({ sets: 4, reps: 8, weight: 65, mode: 'reps' })
    })

    // Verify routine in store
    const updatedRoutine = useStore.getState().S.routines.find(x => x.id === 'r-test-1')
    expect(updatedRoutine.ex.length).toBe(3)
    // In-place replacement at index 0:
    expect(updatedRoutine.ex[0]).toEqual({
      id: '0004',
      sg: 'sg-0-1', // superset group preserved
      sets: 4,
      reps: 8,
      weight: 65,
      mode: 'reps',
    })
    // Indices 1 and 2 unchanged:
    expect(updatedRoutine.ex[1].id).toBe('0002')
    expect(updatedRoutine.ex[1].sg).toBe('sg-0-1')
    expect(updatedRoutine.ex[2].id).toBe('0003')
    expect(updatedRoutine.ex[2].sg).toBeUndefined()
  })

  it('replaces a non-superset exercise without adding an sg property', async () => {
    await act(async () => {
      root.render(<RoutineEdit />)
    })

    const items = container.querySelectorAll('.list .item')
    // Click on third exercise (index 2, no superset)
    await act(async () => {
      items[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const [, , , , , , onReplace] = mocks.exConfigSheet.mock.calls[0]
    await act(async () => {
      onReplace()
    })

    const pickerCallback = mocks.exercisePicker.mock.calls[0][0]
    const newEx = { id: '0005', n: 'Another Lift', bp: 'back', tg: 'lats', eq: 'cable' }
    await act(async () => {
      pickerCallback(newEx)
    })

    const [, , replOnSave, , , replInitial] = mocks.exConfigSheet.mock.calls[1]
    expect(replInitial.sets).toBe(3) // outgoing sets = 3

    await act(async () => {
      replOnSave({ sets: 3, reps: 10, weight: 40, mode: 'reps' })
    })

    const updatedRoutine = useStore.getState().S.routines.find(x => x.id === 'r-test-1')
    expect(updatedRoutine.ex.length).toBe(3)
    expect(updatedRoutine.ex[2]).toEqual({
      id: '0005',
      sets: 3,
      reps: 10,
      weight: 40,
      mode: 'reps',
    })
    expect(updatedRoutine.ex[2].sg).toBeUndefined()
  })

  it('does not alter routine exercises if replacement is cancelled before saving', async () => {
    await act(async () => {
      root.render(<RoutineEdit />)
    })

    const items = container.querySelectorAll('.list .item')
    await act(async () => {
      items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const [, , , , , , onReplace] = mocks.exConfigSheet.mock.calls[0]
    await act(async () => {
      onReplace()
    })

    // Picker opens, but user never picks anything or cancels
    const routine = useStore.getState().S.routines.find(x => x.id === 'r-test-1')
    expect(routine.ex[0].id).toBe('0001')
  })
})
