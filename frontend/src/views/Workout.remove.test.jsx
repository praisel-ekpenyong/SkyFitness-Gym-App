// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { entry, resetViewTestState, renderWorkout, renderWorkoutApp, cleanupViewTest } from '../test/view-harness.jsx'

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

function removeButton() {
  return inEditSheet('Remove exercise')
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

describe('removing an exercise from the screen', () => {
  it('disables removal for the whole duration of a timed hold', () => {
    view = renderWorkoutApp([entry('1001')])
    expect(removeButton()).toBeTruthy()
    expect(removeButton().disabled).toBe(false)

    act(() => useUI.getState().startWork(30, 'Hold', vi.fn()))

    expect(removeButton().disabled).toBe(true)
  })

  it('asks before removing, saying logged sets will be lost when there are some, then removes the exercise', () => {
    view = renderWorkoutApp([entry('1001', [{ w: 0, r: 1, done: true }]), entry('1002')])
    const remove = removeButton()
    act(() => { remove.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    const dialog = document.querySelector('[role="alertdialog"]')
    expect(dialog.textContent).toContain('The sets you logged for this exercise in this session will be lost.')
    expect(useStore.getState().S.active.entries).toHaveLength(2)

    act(() => { [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Remove').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(useStore.getState().S.active.entries.map(e => e.id)).toEqual(['1002'])
  })

  it('asks with the plain message when nothing is logged yet', () => {
    view = renderWorkoutApp([entry('1001'), entry('1002')])
    const remove = removeButton()
    act(() => { remove.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(document.querySelector('[role="alertdialog"]').textContent).toContain('This removes the exercise from your current session.')
  })

  it('hides the remove control for an empty freestyle session', () => {
    view = renderWorkout([])
    expect(removeButton()).toBeUndefined()
  })
})

describe('remove-exercise prompt strings', () => {
  const required = [
    'Remove {0}?',
    'The sets you logged for this exercise in this session will be lost.',
    'This removes the exercise from your current session.',
    'Remove',
    'Which exercise in this superset do you want to remove?'
  ]
  const strings = import.meta.glob('./Workout.jsx', { eager: true, query: '?raw', import: 'default' })

  it('keeps every remove-flow string in the source that renders it', () => {
    expect(Object.keys(strings)).toHaveLength(1)
    const src = Object.values(strings)[0]
    required.forEach(key => {
      const esc = key.replace(/[{}?]/g, '\\$&')
      expect(src).toMatch(new RegExp(`['"\`]${esc}['"\`]`))
    })
  })
})
