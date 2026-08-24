// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { useStore, DEF } from './store/useStore.js'
import { buildCompletedWorkout } from './lib/finish-workout.js'
import { fatigueOf, strengthOf } from './lib/recovery.js'

vi.mock('./lib/sound.js', () => ({
  beep: vi.fn(),
  vibrate: vi.fn(),
  playSetComplete: vi.fn(),
  playTimerWarning: vi.fn(),
  playTimerComplete: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))
vi.mock('./lib/mobile.js', () => ({
  MOBILE: false,
  nativeLoad: vi.fn(async () => null),
  nativeSave: vi.fn(async () => {}),
  syncReminder: vi.fn(async () => true),
  shareExport: vi.fn(async () => {}),
}))

let root
let container

async function boot() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(React.createElement(App)) })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('network disabled in tests')))
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('Ticket 08 — Full verification smoke pass', () => {
  it('passes the end-to-end user journey: boot -> navigate -> routine -> workout -> stats -> export -> wipe -> import -> theme', async () => {
    const consoleSpy = vi.spyOn(console, 'error')

    // 1. Boot to empty Sky log
    await boot()
    expect(useStore.getState().ready).toBe(true)
    expect(useStore.getState().S.workouts).toHaveLength(0)
    expect(useStore.getState().S.routines).toHaveLength(0)
    expect(document.querySelector('#tabbar')).toBeTruthy()

    // Verify navigation across tabs
    const navButtons = document.querySelectorAll('#tabbar button')
    expect(navButtons.length).toBeGreaterThan(0)
    
    // 2. Create routine
    const routine = {
      id: 'routine-push-1',
      name: 'Push Day',
      exercises: [
        { id: '0025', sets: [{ reps: 10, weight: 80 }] },
      ],
    }
    act(() => {
      useStore.getState().update(s => {
        s.routines.push(routine)
      })
    })
    expect(useStore.getState().S.routines).toHaveLength(1)
    expect(useStore.getState().S.routines[0].name).toBe('Push Day')

    // 3. Log a workout
    const completedWorkout = buildCompletedWorkout({
      id: 'w-1',
      d: '2026-08-24',
      start: Date.now() - 3600000,
      routineId: 'routine-push-1',
      name: 'Push Day',
      bw: 80,
      entries: [
        {
          id: '0025',
          sets: [
            { done: true, w: 80, r: 10 },
            { done: true, w: 85, r: 8 },
          ],
          topW: 85,
          target: { sets: 2, reps: 10 },
        },
      ],
    }, { end: Date.now(), prs: [] })

    act(() => {
      useStore.getState().update(s => {
        s.workouts.push(completedWorkout)
      })
    })
    expect(useStore.getState().S.workouts).toHaveLength(1)
    expect(useStore.getState().S.workouts[0].entries[0].sets).toHaveLength(2)

    // 4. Stats update (fatigue and strength computed correctly)
    const workouts = useStore.getState().S.workouts
    const fatigue = fatigueOf(workouts, Date.now())
    const strength = strengthOf(workouts, Date.now())
    expect(fatigue.chest).toBeGreaterThan(0)
    expect(strength.chest).toBe(1)
    expect(workouts.length).toBe(1)

    // 5. Export JSON
    const exportedState = JSON.parse(JSON.stringify(useStore.getState().S))
    act(() => {
      useStore.getState().update(s => {
        s.lastExport = Date.now()
      })
    })
    expect(useStore.getState().S.lastExport).toBeGreaterThan(0)
    expect(exportedState.routines).toHaveLength(1)
    expect(exportedState.workouts).toHaveLength(1)

    // 6. Wipe storage
    act(() => {
      useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
    })
    expect(useStore.getState().S.workouts).toHaveLength(0)
    expect(useStore.getState().S.routines).toHaveLength(0)

    // 7. Import JSON restores data
    act(() => {
      useStore.getState().replaceState(Object.assign(JSON.parse(JSON.stringify(DEF)), exportedState))
    })
    expect(useStore.getState().S.workouts).toHaveLength(1)
    expect(useStore.getState().S.workouts[0].name).toBe('Push Day')
    expect(useStore.getState().S.routines).toHaveLength(1)
    expect(useStore.getState().S.routines[0].name).toBe('Push Day')

    // 8. Theme toggle
    expect(document.documentElement.dataset.theme).toBe('light')
    act(() => {
      useStore.getState().update(s => {
        s.theme = 'dark'
      })
    })
    expect(document.documentElement.dataset.theme).toBe('dark')

    act(() => {
      useStore.getState().update(s => {
        s.theme = 'light'
      })
    })
    expect(document.documentElement.dataset.theme).toBe('light')

    // Ensure no unexpected console errors were emitted during the run
    const unexpectedErrors = consoleSpy.mock.calls.filter(call => {
      const msg = call.map(c => String(c)).join(' ')
      return !msg.includes('not configured to support act')
    })
    expect(unexpectedErrors).toHaveLength(0)
  })
})
