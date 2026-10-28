// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { entry, resetViewTestState, renderWorkoutApp, cleanupViewTest } from '../test/view-harness.jsx'

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

function reorderButton() {
  return [...view.container.querySelectorAll('button')].find(b => b.textContent.trim().includes('Reorder exercises'))
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

    act(() => useUI.getState().startWork(30, 'Plank', vi.fn()))
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

    // Boundary check on first item: move up is disabled, move down is enabled
    const item0Up = items[0].querySelector('button[aria-label*="up"]')
    const item0Down = items[0].querySelector('button[aria-label*="down"]')
    expect(item0Up.disabled).toBe(true)
    expect(item0Down.disabled).toBe(false)

    // Boundary check on last item: move up is enabled, move down is disabled
    const item2Up = items[2].querySelector('button[aria-label*="up"]')
    const item2Down = items[2].querySelector('button[aria-label*="down"]')
    expect(item2Up.disabled).toBe(false)
    expect(item2Down.disabled).toBe(true)

    // Move index 0 down -> swaps 0025 and 0043
    click(item0Down)

    const updatedEntries = useStore.getState().S.active.entries.map(e => e.id)
    expect(updatedEntries).toEqual(['0043', '0025', '0116'])

    // React should re-render the list items in the sheet
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

    // Click the row of the 3rd exercise (index 2)
    click(items[2])

    // Cursor jumped to index 2
    expect(useStore.getState().S.active.cur).toBe(2)

    // Sheet is closed
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
})
