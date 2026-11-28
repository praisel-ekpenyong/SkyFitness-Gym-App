// @vitest-environment happy-dom
import { act } from 'react'
import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replaceActiveExerciseFlow } from '../sheets/session.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { entry, resetViewTestState, renderWorkoutApp, cleanupViewTest } from '../test/view-harness.jsx'
import { openSheets, pickExercise, sheetField, tapInSheet, topSheet, typeInSheet } from '../test/sheet-host.jsx'

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

const activeEntries = () => useStore.getState().S.active.entries
const sheetHeading = () => within(topSheet()).getByRole('heading', { level: 3 }).textContent
const confirmShown = () => screen.queryByRole('alertdialog') !== null

/** Starts the replace flow straight from the session sheet's export, with the Workout and sheet host on screen. */
function startFlow(entries, send = command => useStore.getState().act(command)) {
  view = renderWorkoutApp(entries)
  act(() => { replaceActiveExerciseFlow(0, send) })
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
  it('replaces straight from the picker, with Replace as the config sheet\'s save action (header button)', () => {
    view = renderWorkoutApp([entry('1001', [{ w: 60, r: 5, done: false }, { w: 60, r: 5, done: false }])])

    click(headerReplaceButton())

    expect(confirmShown()).toBe(false)
    expect(sheetHeading()).toBe('Add exercise')
    pickExercise('band lying straight leg raise')

    expect(sheetHeading()).toBe('band lying straight leg raise')
    expect(sheetField('Sets').value).toBe('2')
    const actions = within(topSheet()).getAllByRole('button').map(b => b.textContent.trim())
    expect(actions).toContain('Replace')
    for (const absent of ['Save', 'Add to routine', 'Replace exercise', 'Remove from routine']) expect(actions).not.toContain(absent)

    tapInSheet('Replace')

    expect(activeEntries()[0].id).toBe('1002')
    expect(openSheets()).toEqual([])
  })

  it('puts the footer-picked exercise and its saved config into the Active workout', () => {
    view = renderWorkoutApp([entry('1001', [{ w: 60, r: 5, done: false }])])

    click(footerReplaceButton())

    expect(confirmShown()).toBe(false)
    pickExercise('band lying straight leg raise')
    typeInSheet('Sets', 3)
    typeInSheet('Reps', 8)
    typeInSheet('Weight (kg)', 50)
    tapInSheet('Replace')

    expect(openSheets()).toEqual([])
    expect(activeEntries()[0]).toEqual({
      id: '1002',
      target: { sets: 3, reps: 8, weight: 50, mode: 'reps' },
      plan: null,
      sets: [
        expect.objectContaining({ w: 50, r: 8, done: false }),
        expect.objectContaining({ w: 50, r: 8, done: false }),
        expect.objectContaining({ w: 50, r: 8, done: false }),
      ],
    })
  })

  it('seeds config from the routine\'s history and planned work sets, and follows the routine\'s rule', () => {
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
        s.routines = [{ id: routineId, name: 'Leg Day', prog: 'double', ex: [{ id: '1001', sets: 3 }] }]
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
    pickExercise('band squat row')

    expect(sheetField('Sets').value).toBe('2')
    expect(sheetField('Reps').value).toBe('12')
    expect(sheetField('Weight (kg)').value).toBe('100')
    expect(within(topSheet()).getByText('Follow the routine (Double progression)')).toBeTruthy()

    tapInSheet('Replace')

    expect(activeEntries()[0].id).toBe('1003')
  })
})

describe('Workout performed entry replacement', () => {
  it('asks before opening the picker, then replaces', () => {
    view = renderWorkoutApp([
      entry('1001', [{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: false }])
    ])

    click(headerReplaceButton())

    const confirm = screen.getByRole('alertdialog')
    expect(within(confirm).getByRole('heading').textContent).toBe('Replace band single leg split squat?')
    expect(within(confirm).getByText('The sets you logged for this exercise in this session will be lost.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Add exercise' })).toBeNull()

    tapInSheet('Replace')

    expect(sheetHeading()).toBe('Add exercise')
    pickExercise('band lying straight leg raise')
    tapInSheet('Replace')

    expect(openSheets()).toEqual([])
    expect(activeEntries()[0].id).toBe('1002')
  })

  it('leaves the entry untouched if replacement is cancelled', () => {
    view = renderWorkoutApp([
      entry('1001', [{ w: 60, r: 5, done: true }])
    ])

    click(headerReplaceButton())
    tapInSheet('Cancel')

    expect(openSheets()).toEqual([])
    expect(activeEntries()).toEqual([expect.objectContaining({ id: '1001', sets: [expect.objectContaining({ w: 60, r: 5, done: true })] })])
  })
})

describe('Workout replacement cancelled at the config sheet', () => {
  it('goes back to the picker and leaves the entry as it was', () => {
    view = renderWorkoutApp([entry('1001', [{ w: 60, r: 5, done: false }])])

    click(headerReplaceButton())
    pickExercise('band lying straight leg raise')
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(sheetHeading()).toBe('Add exercise')
    expect(activeEntries()).toEqual([expect.objectContaining({ id: '1001', sets: [expect.objectContaining({ w: 60, r: 5, done: false })] })])
  })
})

describe('Replace goes through the view\'s sender', () => {
  it('sends the replaceExercise command through the sender it was given, so its effects run', () => {
    const sent = []
    const send = command => { sent.push(command.type); return useStore.getState().act(command, send) }

    startFlow([entry('1001')], send)
    pickExercise('band lying straight leg raise')
    tapInSheet('Replace')

    expect(sent).toEqual(['replaceExercise'])
    expect(activeEntries()[0].id).toBe('1002')
  })
})

describe('Hold timer halted on replace', () => {
  const startHold = () => act(() => { useUI.getState().startWork(30, 'Plank', vi.fn(), () => true) })

  it('halts any running hold timer prior to replacement when no confirmation is needed', () => {
    view = renderWorkoutApp([entry('1001')])
    startHold()
    expect(useUI.getState().work).not.toBeNull()

    act(() => { replaceActiveExerciseFlow(0, command => useStore.getState().act(command)) })

    expect(useUI.getState().work).toBeNull()
  })

  it('does not halt hold timer when confirmation sheet is shown, only halts when confirmed', () => {
    view = renderWorkoutApp([entry('1001', [{ w: 60, r: 5, done: true }])])
    startHold()

    act(() => { replaceActiveExerciseFlow(0, command => useStore.getState().act(command)) })

    expect(confirmShown()).toBe(true)
    expect(useUI.getState().work).not.toBeNull()

    tapInSheet('Replace')

    expect(useUI.getState().work).toBeNull()
  })

  it('leaves hold timer running if confirmation is cancelled', () => {
    view = renderWorkoutApp([entry('1001', [{ w: 60, r: 5, done: true }])])
    startHold()

    act(() => { replaceActiveExerciseFlow(0, command => useStore.getState().act(command)) })
    expect(confirmShown()).toBe(true)
    tapInSheet('Cancel')

    expect(useUI.getState().work).not.toBeNull()
  })
})

describe('Superset replacement flow', () => {
  it('header replace button on each exercise targets that exercise directly', () => {
    view = renderWorkoutApp([
      { ...entry('1001'), sg: 'g1' },
      { ...entry('1002'), sg: 'g1' }
    ])

    expect(headerReplaceButton(0)).toBeTruthy()
    click(headerReplaceButton(1))

    expect(confirmShown()).toBe(false)
    pickExercise('band squat row')
    tapInSheet('Replace')

    expect(openSheets()).toEqual([])
    expect(activeEntries().map(e => [e.id, e.sg])).toEqual([['1001', 'g1'], ['1003', 'g1']])
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

    pickExercise('band squat row')
    tapInSheet('Replace')

    expect(openSheets()).toEqual([])
    expect(activeEntries().map(e => [e.id, e.sg])).toEqual([['1001', 'g1'], ['1003', 'g1']])
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
