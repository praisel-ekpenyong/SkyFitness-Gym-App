// @vitest-environment happy-dom
import { act, Profiler } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { ReorderExercisesSheet } from '../sheets/edit-workout.jsx'
import { buttonNamed } from '../test/sheet-host.jsx'
import { entry, resetViewTestState, renderWorkoutApp, cleanupViewTest } from '../test/view-harness.jsx'

vi.mock('../platform/sound.js', async orig => (await import('../test/platform-mocks.js')).mockSound(await orig()))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let view

function inEditSheet(label, exact = false) {
  const find = () => [...document.querySelectorAll('button')].find(b => exact ? b.textContent.trim() === label : b.textContent.trim().includes(label))
  if (!find()) {
    const edit = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Edit workout')
    if (edit) act(() => { edit.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  }
  return find()
}

/** The open sheet, found by its role. */
const sheet = () => document.querySelector('[role="dialog"]')

/** The reorder sheet's control that jumps to an exercise: the button named for it. */
function jumpButton(exId) {
  return buttonNamed(sheet(), exOr(exId).n)
}

/** The reorder sheet's move button for an exercise, `dir` 'up' or 'down'. */
function moveButton(exId, dir) {
  return buttonNamed(sheet(), `Move ${exOr(exId).n} ${dir}`)
}

/**
 * Press a key on a focused control the way a browser does, like user-event's keyboard: keydown,
 * then a native button's activation (a click on Enter at keydown, on Space at keyup) unless a
 * handler prevented it. happy-dom does not activate buttons from the keyboard itself.
 */
function press(el, key) {
  act(() => {
    el.focus()
    const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    const activates = el.dispatchEvent(down) && el instanceof HTMLButtonElement && !el.disabled
    if (activates && key === 'Enter') el.click()
    const up = new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true })
    if (el.dispatchEvent(up) && activates && key === ' ') el.click()
  })
}

function reorderButton() {
  return inEditSheet('Reorder exercises')
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
})

afterEach(() => {
  cleanupViewTest(view)
  view = null
})

describe('Workout exercise reorder button states', () => {
  it('renders reorder button disabled when session has fewer than 2 exercises', () => {
    view = renderWorkoutApp([entry('0025')])
    const btn = reorderButton()
    expect(btn).toBeTruthy()
    expect(btn.disabled).toBe(true)
  })

  it('renders reorder button enabled when session has 2 or more exercises', () => {
    view = renderWorkoutApp([entry('0025'), entry('0043')])
    const btn = reorderButton()
    expect(btn).toBeTruthy()
    expect(btn.disabled).toBe(false)
  })

  it('disables reorder button while a timed hold countdown is running', () => {
    view = renderWorkoutApp([entry('0025'), entry('0043')])
    const btn = reorderButton()
    expect(btn.disabled).toBe(false)

    act(() => useUI.getState().startWork(30, 'Plank', vi.fn(), () => true))
    expect(btn.disabled).toBe(true)

    act(() => useUI.getState().stopWork())
    expect(btn.disabled).toBe(false)
  })

  it('hides reorder button in an empty freestyle session', () => {
    view = renderWorkoutApp([])
    expect(reorderButton()).toBeUndefined()
  })
})

describe('Workout exercise reorder sheet interaction', () => {
  it('opens sheet, lists entries with correct boundary states, and moves exercises', () => {
    view = renderWorkoutApp([
      entry('0025', [{ w: 60, r: 8, done: true }]),
      entry('0043', [{ w: 100, r: 5, done: false }]),
      entry('0116', [{ w: 80, r: 8, done: false }])
    ])

    click(reorderButton())

    const heading = document.querySelector('h3')
    expect(heading?.textContent).toContain('Reorder exercises')

    expect(['0025', '0043', '0116'].map(id => !!jumpButton(id))).toEqual([true, true, true])
    expect(jumpButton('0025').textContent).toContain('1/1 sets')
    expect(jumpButton('0043').textContent).toContain('0/1 sets')

    expect(moveButton('0025', 'up').disabled).toBe(true)
    expect(moveButton('0025', 'down').disabled).toBe(false)
    expect(moveButton('0116', 'up').disabled).toBe(false)
    expect(moveButton('0116', 'down').disabled).toBe(true)

    click(moveButton('0025', 'down'))

    const updatedEntries = useStore.getState().S.active.entries.map(e => e.id)
    expect(updatedEntries).toEqual(['0043', '0025', '0116'])

    expect(moveButton('0043', 'up').disabled).toBe(true)
    expect(moveButton('0025', 'up').disabled).toBe(false)
  })

  it('tapping an exercise row jumps to that exercise and closes the sheet', () => {
    view = renderWorkoutApp([
      entry('0025'),
      entry('0043'),
      entry('0116')
    ])

    expect(useStore.getState().S.active.cur).toBe(0)

    click(reorderButton())

    click(jumpButton('0116'))

    expect(useStore.getState().S.active.cur).toBe(2)

    expect(useUI.getState().sheets).toHaveLength(0)
  })

  it('labels a superset once, above its first exercise', () => {
    view = renderWorkoutApp([
      { ...entry('0025'), sg: 'sg-pair' },
      { ...entry('0043'), sg: 'sg-pair' },
      entry('0116')
    ])

    click(reorderButton())

    const labels = [...sheet().querySelectorAll('div')].filter(el => el.children.length <= 1 && el.textContent === 'Superset')
    expect(labels).toHaveLength(1)
    const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(labels[0], jumpButton('0025'))).toBe(true)
  })

  it('dismisses sheet when clicking the close button', () => {
    view = renderWorkoutApp([entry('0025'), entry('0043')])
    click(reorderButton())
    expect(useUI.getState().sheets).toHaveLength(1)

    const closeBtn = document.querySelector('button[aria-label="Close"]')
    expect(closeBtn).toBeTruthy()
    click(closeBtn)

    expect(useUI.getState().sheets).toHaveLength(0)
  })

  it.each([['Enter'], [' ']])('pressing %j on an exercise jumps to it and closes the sheet', key => {
    view = renderWorkoutApp([entry('0025'), entry('0043')])
    click(reorderButton())

    press(jumpButton('0043'), key)

    expect(useStore.getState().S.active.cur).toBe(1)
    expect(useUI.getState().sheets).toHaveLength(0)
  })
})

describe('set rows keep their figures when the ladder shifts', () => {
  function weightInputs() {
    return [...view.container.querySelectorAll('input.num')].filter(el => el.getAttribute('aria-label').includes('Weight'))
  }

  function typeInto(input, text) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      setter.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('keeps the middle set\'s in-progress figure when a warm-up is inserted above it', () => {
    view = renderWorkoutApp([entry('0025', [
      { w: 40, r: 5, done: false },
      { w: 80, r: 5, done: false },
      { w: 80, r: 3, done: false },
    ])])
    const editing = weightInputs()[1]
    typeInto(editing, '80.')
    expect(editing.value).toBe('80.')

    const addWarmup = [...view.container.querySelectorAll('button')].find(b => b.textContent.includes('Add warm-up set'))
    click(addWarmup)

    expect(editing.isConnected).toBe(true)
    expect(editing.value).toBe('80.')
    expect(weightInputs().map(el => el.value)).toEqual(['80', '40', '80.', '80'])
  })
})

describe('Reorder sheet with no active workout', () => {
  it('renders an empty list without a getSnapshot warning or a render loop', () => {
    expect(useStore.getState().S.active).toBeFalsy()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    let renders = 0
    try {
      act(() => {
        root.render(<Profiler id="sheet" onRender={() => { renders++ }}><ReorderExercisesSheet close={() => {}} /></Profiler>)
      })
      expect(errors.mock.calls.map(c => String(c[0])).filter(m => /getSnapshot/.test(m))).toEqual([])
      expect(renders).toBeLessThanOrEqual(2)
      expect(container.querySelector('[role="heading"], h1, h2, h3')?.textContent).toBe('Reorder exercises')
      expect([...container.querySelectorAll('button')].map(b => b.getAttribute('aria-label'))).toEqual(['Close'])
    } finally {
      act(() => root.unmount())
      container.remove()
      errors.mockRestore()
    }
  })
})
