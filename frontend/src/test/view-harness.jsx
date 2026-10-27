// Test-only helpers for the Workout view tests. Production code never imports this module.
//
// The harness deliberately leaves timers and mocks to each test file: fake timers and the
// hoisted `vi.mock` factories are per-file concerns, so the files stay in charge of them and
// only the store/DOM lifecycle lives here.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import Workout from '../views/Workout.jsx'
import RestTimer from '../components/RestTimer.jsx'
import Modals from '../components/Modals.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

/** Deep-copies a state value. */
const clone = value => JSON.parse(JSON.stringify(value))

/**
 * Builds one Active-workout entry with a single default set.
 * Supersets are expressed by spreading the entry and adding `sg`.
 */
export const entry = (id, sets = [{ w: 0, r: 1, done: false }]) => ({
  id,
  target: { sets: sets.length, reps: 1 },
  sets,
})

/** Returns store/UI/DOM state to a clean baseline without touching timers or mocks. */
export function resetViewTestState() {
  localStorage.clear()
  useUI.getState().stopRest()
  useUI.getState().stopWork()
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  useStore.setState({ S: clone(DEF) })
  document.body.className = ''
}

/**
 * Seeds one Active workout, or clears it when `entries` is null.
 * Returns the seeded state atom; callers that only care about the store may ignore it.
 */
export function seedActiveWorkout(entries, { restSec, cur = 0, start = Date.now() } = {}) {
  const S = clone(DEF)
  if (restSec !== undefined) S.restSec = restSec
  S.active = entries
    ? {
        id: 'view-test',
        d: '2026-08-11',
        name: 'View test',
        start,
        routineId: null,
        bw: null,
        cur,
        entries,
      }
    : null
  useStore.setState({ S })
  return S
}

/** Mounts the Workout route for an Active workout seeded through `seedActiveWorkout`. */
export function renderWorkout(entries, options) {
  seedActiveWorkout(entries, options)
  return mount(<Workout />)
}

/** Mounts Workout plus the rest bar and modals, for tests that exercise those surfaces. */
export function renderWorkoutApp(entries, options) {
  seedActiveWorkout(entries, options)
  return mount(<><Workout /><RestTimer /><Modals /></>)
}

/** Unmounts and removes a rendered view, then stops timers and restores real timers. */
export function cleanupViewTest(view) {
  if (view?.root) act(() => view.root.unmount())
  if (view?.container) view.container.remove()
  useUI.getState().stopRest()
  useUI.getState().stopWork()
  vi.clearAllTimers()
  vi.useRealTimers()
}

function mount(ui) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(<MemoryRouter>{ui}</MemoryRouter>))
  return { root, container }
}
