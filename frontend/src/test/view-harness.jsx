import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import Workout from '../views/Workout.jsx'
import RestTimer from '../components/RestTimer.jsx'
import Modals from '../components/Modals.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { useUI } from '../store/useUI.js'

const clone = value => JSON.parse(JSON.stringify(value))


export const entry = (id, sets = [{ w: 0, r: 1, done: false }]) => ({
  id,
  target: { sets: sets.length, reps: 1 },
  sets,
})

export function resetViewTestState() {
  localStorage.clear()
  useUI.getState().stopRest()
  useUI.getState().stopWork()
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  useStore.setState({ S: clone(DEF) })
  document.body.className = ''
}

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

export function renderWorkout(entries, options) {
  seedActiveWorkout(entries, options)
  return mount(<Workout />)
}

export function renderWorkoutApp(entries, options) {
  seedActiveWorkout(entries, options)
  return mount(<><Workout /><RestTimer /><Modals /></>)
}

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
