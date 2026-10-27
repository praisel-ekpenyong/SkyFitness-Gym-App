// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'
import RestTimer from '../components/RestTimer.jsx'
import Modals from '../components/Modals.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

vi.mock('../lib/sound.js', () => ({
  beep: vi.fn(),
  vibrate: vi.fn(),
  playSetComplete: vi.fn(),
  playTimerWarning: vi.fn(),
  playTimerComplete: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = value => JSON.parse(JSON.stringify(value))
const entry = (id, sets = [{ w: 0, r: 1, done: false }]) => ({
  id,
  target: { sets: sets.length, reps: 1 },
  sets,
})

let root
let container

function seed(entries, { restSec = 90, cur = 0 } = {}) {
  const S = clone(DEF)
  S.restSec = restSec
  if (entries) {
    S.active = {
      id: 'manual-rest-test', d: '2026-08-11', start: Date.now(), routineId: null,
      name: 'Manual rest test', bw: null, cur, entries
    }
  }
  useStore.setState({ S })
}

function renderApp(entries, options) {
  seed(entries, options)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(
    <MemoryRouter>
      <Workout />
      <RestTimer />
      <Modals />
    </MemoryRouter>
  ))
}

function restControl() {
  return [...container.querySelectorAll('button')]
    .find(button => /^Rest \d+:\d{2}$/.test(button.textContent.trim()))
}

function buttonNamed(name) {
  return [...container.querySelectorAll('button')]
    .find(button => (button.getAttribute('aria-label') || button.textContent.trim()) === name)
}

function timerBarText() {
  const bar = container.querySelector('#timer')
  return bar ? bar.textContent.trim() : null
}

function click(button) {
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useUI.getState().stopRest()
  useUI.getState().stopWork()
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  useStore.setState({ S: clone(DEF) })
  document.body.className = ''
  root = null
  container = null
})

afterEach(() => {
  if (root) act(() => root.unmount())
  if (container) container.remove()
  useUI.getState().stopRest()
  useUI.getState().stopWork()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('manual rest control', () => {
  it('shows the Rest duration on the exercise-position line', () => {
    renderApp([entry('1001')])

    expect(container.textContent).toContain('Exercise 1 / 1')
    expect(restControl()).toBeTruthy()
    expect(restControl().disabled).toBe(false)
    expect(restControl().getAttribute('aria-label') || restControl().textContent.trim()).toBe('Rest 1:30')
  })

  it('updates the label and the countdown length when the Rest duration changes', () => {
    renderApp([entry('1001')])

    act(() => { useStore.getState().update(S => { S.restSec = 120 }) })

    expect(restControl().textContent.trim()).toBe('Rest 2:00')
    click(restControl())
    expect(timerBarText()).toMatch(/^2:00/)
    act(() => vi.advanceTimersByTime(5000))
    expect(timerBarText()).toMatch(/^1:55/)
  })

  it('starts the Rest timer at the shown duration and counts down', () => {
    renderApp([entry('1001')])

    click(restControl())

    expect(timerBarText()).toMatch(/^1:30/)
    act(() => vi.advanceTimersByTime(3000))
    expect(timerBarText()).toMatch(/^1:27/)
  })

  it('sits on the superset-position line too', () => {
    renderApp([
      { ...entry('1001'), sg: 'g1' },
      { ...entry('1002'), sg: 'g1' },
    ])

    expect(container.textContent).toContain('Superset 1 / 1')
    expect(restControl()).toBeTruthy()
    expect(restControl().textContent.trim()).toBe('Rest 1:30')
  })

  it('does not offer a rest in an empty freestyle workout', () => {
    renderApp([])

    expect(container.textContent).toContain('Freestyle workout — add your first exercise.')
    expect(restControl()).toBeUndefined()
  })

  it('does not offer a rest when no Active workout exists', () => {
    renderApp(null)

    expect(container.textContent).toContain('Start workout')
    expect(restControl()).toBeUndefined()
  })

  it('is disabled while a rest runs and is available again after Skip', () => {
    renderApp([entry('1001')])

    click(restControl())
    expect(restControl().disabled).toBe(true)

    click(buttonNamed('Skip'))
    expect(timerBarText()).toBeNull()
    expect(restControl().disabled).toBe(false)
  })

  it('is disabled while a Hold timer runs and is available again when the hold ends', () => {
    renderApp([entry('1001')])

    act(() => { useUI.getState().startWork(3, 'Hold', vi.fn()) })
    expect(timerBarText()).toMatch(/^0:03/)
    expect(restControl().disabled).toBe(true)

    act(() => vi.advanceTimersByTime(3000))
    expect(timerBarText()).toBeNull()
    expect(restControl().disabled).toBe(false)
  })

  it('still starts a rest automatically after a performed set', () => {
    renderApp([entry('1001', [{ w: 0, r: 1, done: false }, { w: 0, r: 1, done: false }])])

    click(container.querySelector('[role="checkbox"]'))

    expect(timerBarText()).toMatch(/^1:30/)
    expect(restControl().disabled).toBe(true)
  })

  it('offers the same −15, +15 and Skip on a manual rest', () => {
    renderApp([entry('1001')])
    click(restControl())

    const fifteens = [...container.querySelectorAll('#timer button')]
      .filter(button => button.textContent.trim() === '15s')
    expect(fifteens).toHaveLength(2)

    click(fifteens[0])
    expect(timerBarText()).toMatch(/^1:15/)
    click(fifteens[1])
    expect(timerBarText()).toMatch(/^1:30/)

    click(buttonNamed('Skip'))
    expect(timerBarText()).toBeNull()
    expect(restControl().disabled).toBe(false)
  })

  it('removes the bar when the workout is finished while resting', () => {
    renderApp([entry('1001', [{ w: 0, r: 1, done: true }])])
    click(restControl())
    expect(timerBarText()).toMatch(/^1:30/)

    click(buttonNamed('Finish'))

    expect(timerBarText()).toBeNull()
    expect(restControl()).toBeUndefined()
  })

  it('removes the bar when the workout is discarded while resting', () => {
    renderApp([entry('1001')])
    click(restControl())
    expect(timerBarText()).toMatch(/^1:30/)

    click(buttonNamed('Discard'))
    const dialog = container.querySelector('[role="alertdialog"]')
    expect(dialog).toBeTruthy()
    click([...dialog.querySelectorAll('button')].find(button => button.textContent.trim() === 'Discard'))

    expect(timerBarText()).toBeNull()
    expect(restControl()).toBeUndefined()
  })
})
