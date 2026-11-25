// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import RoutineEdit from './RoutineEdit.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { useUI } from '../store/useUI.js'
import { buttonNamed, leafTexts, pick } from '../test/sheet-host.jsx'

const mocks = vi.hoisted(() => ({
  nav: vi.fn(),
  exConfigSheet: vi.fn(),
  exercisePicker: vi.fn(),
  confirmSheet: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.nav,
  useParams: () => ({ id: 'r-test-1' }),
}))

vi.mock('../sheets/catalogue.jsx', () => ({
  exConfigSheet: mocks.exConfigSheet,
  exercisePicker: mocks.exercisePicker,
}))
vi.mock('../sheets/confirm.jsx', () => ({ confirmSheet: mocks.confirmSheet }))

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
    '0028': { w: 65 },
  }
  st.workouts = [
    {
      id: 'w-prev',
      routineId: 'r-test-1',
      entries: [
        {
          id: '0028',
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

    await act(async () => {
      items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.exConfigSheet).toHaveBeenCalledTimes(1)
    const [ex, { existing: e, onReplace }] = mocks.exConfigSheet.mock.calls[0]
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
    await act(async () => {
      items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const [, { onReplace }] = mocks.exConfigSheet.mock.calls[0]

    await act(async () => {
      onReplace()
    })

    expect(mocks.exercisePicker).toHaveBeenCalledTimes(1)
    const pickerCallback = mocks.exercisePicker.mock.calls[0][0]
    expect(typeof pickerCallback).toBe('function')

    const newEx = { id: '0028', n: 'Replacement Lift', bp: 'chest', tg: 'chest', eq: 'barbell' }
    await act(async () => {
      pickerCallback(newEx)
    })

    expect(mocks.exConfigSheet).toHaveBeenCalledTimes(2)
    const [replEx, { existing: replExisting, onSave: replOnSave, initial: replInitial }] = mocks.exConfigSheet.mock.calls[1]
    expect(replEx.id).toBe('0028')
    expect(replExisting).toBeUndefined()
    expect(replInitial).toMatchObject({
      sets: 4,
      weight: 65,
    })

    await act(async () => {
      replOnSave({ sets: 4, reps: 8, weight: 65, mode: 'reps' })
    })

    const updatedRoutine = useStore.getState().S.routines.find(x => x.id === 'r-test-1')
    expect(updatedRoutine.ex.length).toBe(3)
    expect(updatedRoutine.ex[0]).toEqual({
      id: '0028',
      sg: 'sg-0-1',
      sets: 4,
      reps: 8,
      weight: 65,
      mode: 'reps',
      rowId: expect.any(String),
    })
    expect(updatedRoutine.ex[1].id).toBe('0002')
    expect(updatedRoutine.ex[1].sg).toBe('sg-0-1')
    expect(updatedRoutine.ex[2].id).toBe('0003')
    expect(updatedRoutine.ex[2].sg).toBeUndefined()
  })

  it('saving an exercise replaces its settings, so a setting turned off is cleared', async () => {
    const st = useStore.getState().S
    const seeded = JSON.parse(JSON.stringify(st))
    Object.assign(seeded.routines[0].ex[0], { side: true, rest: 150, prog: 'double', repsMin: 8, inc: 1.25, bodyweight: true, notes: 'Slow eccentric' })
    useStore.getState().replaceState(seeded)
    await act(async () => {
      root.render(<RoutineEdit />)
    })

    const items = container.querySelectorAll('.list .item')
    await act(async () => {
      items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const [, { onSave }] = mocks.exConfigSheet.mock.calls[0]
    await act(async () => {
      onSave({ sets: 3, mode: 'reps', reps: 10, weight: 20 })
    })

    const saved = useStore.getState().S.routines.find(x => x.id === 'r-test-1').ex[0]
    expect(saved).toEqual({ id: '0001', sg: 'sg-0-1', sets: 3, mode: 'reps', reps: 10, weight: 20, rowId: expect.any(String) })
  })

  it('replaces a non-superset exercise without adding an sg property', async () => {
    await act(async () => {
      root.render(<RoutineEdit />)
    })

    const items = container.querySelectorAll('.list .item')
    await act(async () => {
      items[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const [, { onReplace }] = mocks.exConfigSheet.mock.calls[0]
    await act(async () => {
      onReplace()
    })

    const pickerCallback = mocks.exercisePicker.mock.calls[0][0]
    const newEx = { id: '0029', n: 'Another Lift', bp: 'back', tg: 'lats', eq: 'cable' }
    await act(async () => {
      pickerCallback(newEx)
    })

    const [, { onSave: replOnSave, initial: replInitial }] = mocks.exConfigSheet.mock.calls[1]
    expect(replInitial.sets).toBe(3)

    await act(async () => {
      replOnSave({ sets: 3, reps: 10, weight: 40, mode: 'reps' })
    })

    const updatedRoutine = useStore.getState().S.routines.find(x => x.id === 'r-test-1')
    expect(updatedRoutine.ex.length).toBe(3)
    expect(updatedRoutine.ex[2]).toEqual({
      id: '0029',
      sets: 3,
      reps: 10,
      weight: 40,
      mode: 'reps',
      rowId: expect.any(String),
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

    const [, { onReplace }] = mocks.exConfigSheet.mock.calls[0]
    await act(async () => {
      onReplace()
    })

    const routine = useStore.getState().S.routines.find(x => x.id === 'r-test-1')
    expect(routine.ex[0].id).toBe('0001')
  })
})

describe('RoutineEdit exercise notes display and replacement', () => {
  it('renders a subtitle note preview with clipboard icon when an exercise has notes', async () => {
    useStore.getState().update(s => {
      const r = s.routines.find(x => x.id === 'r-test-1')
      r.ex[0].notes = 'Seat 5, incline pin 2'
    })

    await act(async () => {
      root.render(<RoutineEdit />)
    })

    const items = container.querySelectorAll('.list .item')
    expect(items.length).toBe(3)

    const firstItem = items[0]
    const notePreview = firstItem.querySelector('.small.dim')
    expect(notePreview).toBeTruthy()
    expect(notePreview.textContent).toContain('Seat 5, incline pin 2')

    const clipIcon = notePreview.querySelector('svg.icn')
    expect(clipIcon).toBeTruthy()

    const secondItem = items[1]
    const secondPreview = secondItem.querySelector('.small.dim')
    expect(secondPreview).toBeNull()
  })

  it('clears notes on exercise replacement so outgoing notes do not pollute the new exercise', async () => {
    useStore.getState().update(s => {
      const r = s.routines.find(x => x.id === 'r-test-1')
      r.ex[0].notes = 'Outgoing machine setup cue'
    })

    await act(async () => {
      root.render(<RoutineEdit />)
    })

    const items = container.querySelectorAll('.list .item')
    await act(async () => {
      items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const [, { onReplace }] = mocks.exConfigSheet.mock.calls[0]
    await act(async () => {
      onReplace()
    })

    const pickerCallback = mocks.exercisePicker.mock.calls[0][0]
    const newEx = { id: '0028', n: 'New Exercise', bp: 'chest', tg: 'chest', eq: 'barbell' }
    await act(async () => {
      pickerCallback(newEx)
    })

    const [, { existing: replExisting, onSave: replOnSave, initial: replInitial }] = mocks.exConfigSheet.mock.calls[1]
    expect(replExisting).toBeUndefined()
    expect(replInitial?.notes).toBeFalsy()

    await act(async () => {
      replOnSave({ sets: 4, reps: 10, weight: 60, mode: 'reps' })
    })

    const updatedRoutine = useStore.getState().S.routines.find(x => x.id === 'r-test-1')
    expect(updatedRoutine.ex[0].id).toBe('0028')
    expect(updatedRoutine.ex[0].notes).toBeUndefined()
  })
})

describe('RoutineEdit delete key', () => {
  it('is a red text key, not a filled danger button, and still asks first', async () => {
    mocks.confirmSheet.mockReset()
    await act(async () => { root.render(<RoutineEdit />) })

    const del = [...container.querySelectorAll('button')].find(b => b.textContent === 'Delete')
    expect(del.classList.contains('rt-delete')).toBe(true)
    expect(del.classList.contains('ghost')).toBe(true)
    expect(del.classList.contains('danger')).toBe(false)

    await act(async () => { del.click() })
    expect(mocks.confirmSheet).toHaveBeenCalledTimes(1)
    expect(mocks.confirmSheet.mock.calls[0][0].danger).toBe(true)

    await act(async () => {
      mocks.confirmSheet.mock.calls[0][0].onConfirm()
    })
    expect(useStore.getState().S.routines.find(x => x.id === 'r-test-1')).toBeUndefined()
    expect(mocks.nav).toHaveBeenCalledWith('/plan')
  })
})

describe('Routine rows keep their own targets', () => {
  it('keeps the middle row\'s target when that row moves down', async () => {
    const current = useStore.getState().S
    useStore.getState().replaceState({
      ...current,
      routines: [{
        ...current.routines[0],
        ex: [
          { id: '0025', sets: 3, reps: 5, weight: 60, mode: 'reps' },
          { id: '0025', sets: 4, reps: 8, weight: 80, mode: 'reps' },
          { id: '0025', sets: 2, reps: 12, weight: 40, mode: 'reps' },
        ],
      }],
    })
    await act(async () => { root.render(<RoutineEdit />) })

    const items = () => [...container.querySelectorAll('.list .item')]
    const middle = items()[1]
    expect(middle.textContent).toContain('4 × 8')
    const moveDown = middle.querySelector('button[aria-label="Move down"]')
    moveDown.focus()
    await act(async () => { moveDown.click() })

    const focused = document.activeElement.closest('.item')
    expect(focused.textContent).toContain('4 × 8')
    expect(focused.textContent).toContain('80')
    expect(items().map(el => el.textContent.match(/\d+ × \d+/)[0])).toEqual(['3 × 5', '2 × 12', '4 × 8'])
  })
})

describe('RoutineEdit reordering and superset pairing', () => {
  it('moves exercise down on move down click', async () => {
    await act(async () => { root.render(<RoutineEdit />) })

    const moveDownBtns = container.querySelectorAll('button[aria-label="Move down"]')
    expect(moveDownBtns.length).toBe(3)

    await act(async () => {
      moveDownBtns[0].click()
    })

    const r = useStore.getState().S.routines.find(x => x.id === 'r-test-1')
    expect(r.ex[0].id).toBe('0002')
    expect(r.ex[1].id).toBe('0001')
  })

  it('toggles superset link with above on superset button click', async () => {
    await act(async () => { root.render(<RoutineEdit />) })

    const linkBtns = container.querySelectorAll('.rt-link')
    expect(linkBtns.length).toBe(2)

    await act(async () => {
      linkBtns[1].click()
    })

    const r = useStore.getState().S.routines.find(x => x.id === 'r-test-1')
    expect(r.ex[1].sg).toBeDefined()
    expect(r.ex[2].sg).toBe(r.ex[1].sg)
  })
})

describe('RoutineEdit metadata changes', () => {
  it('renames routine on input change', async () => {
    await act(async () => { root.render(<RoutineEdit />) })

    const input = container.querySelector('input.rt-title')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'Chest & Triceps')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const r = useStore.getState().S.routines.find(x => x.id === 'r-test-1')
    expect(r.name).toBe('Chest & Triceps')
  })
})

describe('RoutineEdit round trip: pick, save, read the routine', () => {
  const routine = () => useStore.getState().S.routines.find(x => x.id === 'r-test-1')
  const linkButtons = () => container.querySelectorAll('button[aria-label="Superset with exercise above"]')

  it('Progression stores the rule picked, the one shown when the routine has none included', async () => {
    await act(async () => { root.render(<RoutineEdit />) })
    expect(leafTexts(buttonNamed(container, 'Progression'))).toContain('Linear progression')
    expect(routine()).not.toHaveProperty('prog')

    await pick(container, 'Progression', 'Linear progression')

    expect(routine().prog).toBe('linear')
  })

  it('Icon stores the glyph picked, the one shown included', async () => {
    await act(async () => { root.render(<RoutineEdit />) })

    await pick(container, 'Pick an icon', 'arm')
    expect(routine().emoji).toBe('arm')

    await pick(container, 'Pick an icon', 'dumbbell')
    expect(routine().emoji).toBe('dumbbell')
  })

  it('Superset with above pairs the two exercises, and a second tap stores no group on either', async () => {
    await act(async () => { root.render(<RoutineEdit />) })

    await act(async () => { linkButtons()[1].click() })
    const sg = routine().ex[1].sg
    expect(sg).toBeTruthy()
    expect(routine().ex[2].sg).toBe(sg)
    expect(linkButtons()[1].getAttribute('aria-pressed')).toBe('true')

    await act(async () => { linkButtons()[1].click() })
    expect(routine().ex[2]).not.toHaveProperty('sg')
    expect(routine().ex.map(e => e.sg)).toEqual(['sg-0-1', 'sg-0-1', undefined])
  })
})
