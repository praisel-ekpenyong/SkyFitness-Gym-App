// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import RoutineEdit from './RoutineEdit.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { useUI } from '../store/useUI.js'
import Modals from '../components/Modals.jsx'
import { fireEvent, screen, within } from '@testing-library/react'
import { buttonNamed, leafTexts, openSheets, pick, pickExercise, sheetField, tapInSheet, topSheet, typeInSheet } from '../test/sheet-host.jsx'

const mocks = vi.hoisted(() => ({
  nav: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.nav,
  useParams: () => ({ id: 'r-test-1' }),
}))


let container
let root

const routine = () => useStore.getState().S.routines.find(x => x.id === 'r-test-1')

/** The routine editor with the sheet host, so its sheets open as a lifter sees them. */
const renderEditor = () => act(async () => { root.render(<><RoutineEdit /><Modals /></>) })

/** Taps the routine row that shows this exercise. */
const openRow = name => fireEvent.click(screen.getByText(name))

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
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('RoutineEdit exercise config', () => {
  it('tapping an exercise opens its config sheet with its Target, Save, Replace and Remove', async () => {
    await renderEditor()

    openRow('3/4 sit-up')

    expect(within(topSheet()).getByRole('heading', { name: '3/4 sit-up' })).toBeTruthy()
    expect(sheetField('Sets').value).toBe('4')
    expect(sheetField('Reps').value).toBe('10')
    for (const name of ['Save', 'Replace exercise', 'Remove from routine']) {
      expect(within(topSheet()).getByRole('button', { name })).toBeTruthy()
    }
  })

  it('saving an exercise replaces its settings, so a setting turned off is cleared', async () => {
    const seeded = JSON.parse(JSON.stringify(useStore.getState().S))
    Object.assign(seeded.routines[0].ex[0], { side: true, rest: 150, prog: 'double', repsMin: 8, notes: 'Slow eccentric' })
    useStore.getState().replaceState(seeded)
    await renderEditor()

    openRow('3/4 sit-up')
    fireEvent.click(within(topSheet()).getByRole('switch', { name: 'Reps per side' }))
    tapInSheet(/^Rest duration/)
    tapInSheet(/^Default/)
    tapInSheet(/^Rule/)
    tapInSheet(/^Follow the routine/)
    fireEvent.change(within(topSheet()).getByRole('textbox', { name: 'Notes and cues' }), { target: { value: '' } })
    tapInSheet('Decrease Sets')
    tapInSheet('Save')

    expect(openSheets()).toEqual([])
    expect(routine().ex[0]).toEqual({ id: '0001', sg: 'sg-0-1', sets: 3, mode: 'reps', reps: 10, weight: 20, rowId: expect.any(String) })
  })

  it('Remove from routine asks first, then takes only that exercise out', async () => {
    await renderEditor()

    openRow('air bike')
    tapInSheet('Remove from routine')

    expect(within(topSheet()).getByRole('heading', { name: 'Remove air bike?' })).toBeTruthy()
    expect(routine().ex.map(e => e.id)).toEqual(['0001', '0002', '0003'])

    tapInSheet('Remove')

    expect(openSheets()).toEqual([])
    expect(routine().ex.map(e => e.id)).toEqual(['0001', '0002'])
    expect(screen.queryByText('air bike')).toBeNull()
  })
})

describe('RoutineEdit exercise replacement', () => {
  it('Replace exercise picks a new one in place, seeds its Target, and keeps the superset group', async () => {
    await renderEditor()

    openRow('3/4 sit-up')
    tapInSheet('Replace exercise')
    pickExercise('barbell clean and press')

    expect(within(topSheet()).getByRole('heading', { name: 'barbell clean and press' })).toBeTruthy()
    expect(sheetField('Sets').value).toBe('4')
    expect(sheetField('Weight (kg)').value).toBe('65')
    expect(within(topSheet()).queryByRole('button', { name: 'Replace exercise' })).toBeNull()
    typeInSheet('Reps', 8)
    tapInSheet('Add to routine')

    expect(routine().ex).toHaveLength(3)
    expect(routine().ex[0]).toEqual({ id: '0028', sg: 'sg-0-1', sets: 4, reps: 8, weight: 65, mode: 'reps', rowId: expect.any(String) })
    expect(routine().ex[1]).toMatchObject({ id: '0002', sg: 'sg-0-1' })
    expect(routine().ex[2].id).toBe('0003')
    expect(routine().ex[2]).not.toHaveProperty('sg')
    // The picker stays open after its pick is saved; close it to read the routine underneath.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(openSheets()).toEqual([])
    expect(screen.getByText('barbell clean and press')).toBeTruthy()
    expect(screen.queryByText('3/4 sit-up')).toBeNull()
  })

  it('replaces a non-superset exercise without adding a superset group', async () => {
    await renderEditor()

    openRow('air bike')
    tapInSheet('Replace exercise')
    pickExercise('barbell clean-grip front squat')

    expect(sheetField('Sets').value).toBe('3')
    typeInSheet('Reps', 10)
    typeInSheet('Weight (kg)', 40)
    tapInSheet('Add to routine')

    expect(routine().ex).toHaveLength(3)
    expect(routine().ex[2]).toEqual({ id: '0029', sets: 3, reps: 10, weight: 40, mode: 'reps', rowId: expect.any(String) })
  })

  it('leaves the routine as it was when the picker is closed without a pick', async () => {
    const before = JSON.parse(JSON.stringify(routine().ex))
    await renderEditor()

    openRow('3/4 sit-up')
    tapInSheet('Replace exercise')
    expect(within(topSheet()).getByRole('heading', { name: 'Add exercise' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(openSheets()).toEqual([])
    expect(routine().ex).toEqual(before)
  })

  it('clears notes on replacement so outgoing notes do not pollute the new exercise', async () => {
    useStore.getState().update(s => {
      s.routines.find(x => x.id === 'r-test-1').ex[0].notes = 'Outgoing machine setup cue'
    })
    await renderEditor()

    openRow('3/4 sit-up')
    tapInSheet('Replace exercise')
    pickExercise('barbell clean and press')

    expect(within(topSheet()).getByRole('textbox', { name: 'Notes and cues' }).value).toBe('')
    tapInSheet('Add to routine')

    expect(routine().ex[0].id).toBe('0028')
    expect(routine().ex[0]).not.toHaveProperty('notes')
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

})

describe('RoutineEdit delete key', () => {
  it('is a red text key, not a filled danger button, and still asks first', async () => {
    await renderEditor()

    const del = [...container.querySelectorAll('button')].find(b => b.textContent === 'Delete')
    expect(del.classList.contains('rt-delete')).toBe(true)
    expect(del.classList.contains('ghost')).toBe(true)
    expect(del.classList.contains('danger')).toBe(false)

    await act(async () => { del.click() })
    expect(within(topSheet()).getByRole('heading', { name: 'Delete routine?' })).toBeTruthy()
    expect(routine()).toBeDefined()

    tapInSheet('Delete')
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

    await pick(container, 'Pick an icon', 'Arm')
    expect(routine().emoji).toBe('arm')

    await pick(container, 'Pick an icon', 'Dumbbell')
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
