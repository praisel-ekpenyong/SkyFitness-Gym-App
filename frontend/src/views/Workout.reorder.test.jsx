// @vitest-environment happy-dom
import { act, Profiler } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { ReorderExercisesSheet } from './Workout.jsx'
import { entry, resetViewTestState, renderWorkoutApp, cleanupViewTest } from '../test/view-harness.jsx'

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

function inEditSheet(label, exact = false) {
  const find = () => [...document.querySelectorAll('button')].find(b => exact ? b.textContent.trim() === label : b.textContent.trim().includes(label))
  if (!find()) {
    const edit = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Edit workout')
    if (edit) act(() => { edit.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  }
  return find()
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

    const items = [...document.querySelectorAll('.list .item')]
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toContain('1/1 sets')
    expect(items[1].textContent).toContain('0/1 sets')

    const item0Up = items[0].querySelector('button[aria-label*="up"]')
    const item0Down = items[0].querySelector('button[aria-label*="down"]')
    expect(item0Up.disabled).toBe(true)
    expect(item0Down.disabled).toBe(false)

    const item2Up = items[2].querySelector('button[aria-label*="up"]')
    const item2Down = items[2].querySelector('button[aria-label*="down"]')
    expect(item2Up.disabled).toBe(false)
    expect(item2Down.disabled).toBe(true)

    click(item0Down)

    const updatedEntries = useStore.getState().S.active.entries.map(e => e.id)
    expect(updatedEntries).toEqual(['0043', '0025', '0116'])

    const updatedItems = [...document.querySelectorAll('.list .item')]
    const updatedItem0Up = updatedItems[0].querySelector('button[aria-label*="up"]')
    expect(updatedItem0Up.disabled).toBe(true)
  })

  it('tapping an exercise row jumps to that exercise and closes the sheet', () => {
    view = renderWorkoutApp([
      entry('0025'),
      entry('0043'),
      entry('0116')
    ])

    expect(useStore.getState().S.active.cur).toBe(0)

    click(reorderButton())
    const items = [...document.querySelectorAll('.list .item')]

    click(items[2])

    expect(useStore.getState().S.active.cur).toBe(2)

    expect(useUI.getState().sheets).toHaveLength(0)
  })

  it('displays superset badge and in-ss class on paired exercises', () => {
    view = renderWorkoutApp([
      { ...entry('0025'), sg: 'sg-pair' },
      { ...entry('0043'), sg: 'sg-pair' },
      entry('0116')
    ])

    click(reorderButton())

    const ssLabel = document.querySelector('.ss-label')
    expect(ssLabel).toBeTruthy()
    expect(ssLabel.textContent).toContain('Superset')

    const inSSItems = document.querySelectorAll('.list .item.in-ss')
    expect(inSSItems).toHaveLength(2)
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

  it('jumps to exercise and closes sheet on Enter keyboard event', () => {
    view = renderWorkoutApp([entry('0025'), entry('0043')])
    click(reorderButton())

    const items = [...document.querySelectorAll('.list .item')]
    expect(items[1].getAttribute('aria-label')).toBeTruthy()

    act(() => {
      items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

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
  // A stale sheet can outlive finish/discard; its selector must return a cached value, not a fresh [].
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
      expect(container.querySelectorAll('[role="button"]')).toHaveLength(0)
    } finally {
      act(() => root.unmount())
      container.remove()
      errors.mockRestore()
    }
  })
})
