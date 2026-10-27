// Test-only helpers for the Workout view tests. Production code never imports this module.
//
// Timer installation and the hoisted `vi.mock` factories are per-file concerns, so each test
// file stays in charge of them; cleanup here restores real timers so fake time cannot leak.
import { act } from 'react'
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

// `entry` and `seedActiveWorkout` are deliberately plain test fixtures. Production Row and
// Active-workout construction lives in `makeRow`/`beginSession` (ADR-0006, ADR-0007).

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

/** Seeds one Active workout, or clears it when `entries` is null. */
export function seedActiveWorkout(entries, { cur = 0, start = Date.now() } = {}) {
  const S = clone(DEF)
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
