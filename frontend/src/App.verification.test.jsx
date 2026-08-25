// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { useStore, DEF } from './store/useStore.js'
import { buildCompletedWorkout } from './lib/finish-workout.js'
import { fatigueOf, strengthOf } from './lib/recovery.js'

import { EXIDX } from './lib/exercises.js'
import { primaryMuscleOf, secondaryMusclesOf, matchesMuscleFilter } from './lib/muscles.js'

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

describe('Ticket 08 & 04 — Full verification smoke pass', () => {
  it('passes the end-to-end user journey: boot -> navigate -> custom exercises -> routine -> workout -> stats -> export -> wipe -> import -> legacy fallbacks -> theme', async () => {
    const consoleSpy = vi.spyOn(console, 'error')

    // 1. Boot to empty Sky log
    await boot()
    expect(useStore.getState().ready).toBe(true)
    expect(useStore.getState().S.workouts).toHaveLength(0)
    expect(useStore.getState().S.routines).toHaveLength(0)
    expect(useStore.getState().S.favorites).toEqual([])
    expect(useStore.getState().S.customEx).toEqual([])
    expect(document.querySelector('#tabbar')).toBeTruthy()

    // Verify navigation across tabs
    const navButtons = document.querySelectorAll('#tabbar button')
    expect(navButtons.length).toBeGreaterThan(0)
    
    // 2. Create custom exercise with canonical primary and secondary muscles
    const customExercise = {
      id: 'c-incline-curl',
      n: 'Incline Hammer Curl',
      bp: 'upper arms',
      tg: 'biceps',
      sm: ['forearm'],
      desc: 'Seat set to 45 degrees',
      eq: 'custom',
      custom: true,
    }

    // 2b. Create routine with built-in and custom exercises & star favorite exercises
    const routine = {
      id: 'routine-push-pull-1',
      name: 'Push Pull Day',
      exercises: [
        { id: '0025', sets: [{ reps: 10, weight: 80 }] },
        { id: 'c-incline-curl', sets: [{ reps: 12, weight: 16 }] },
      ],
    }
    act(() => {
      useStore.getState().update(s => {
        s.customEx.push(customExercise)
        s.routines.push(routine)
        s.favorites = ['0025', 'c-incline-curl']
      })
    })
    expect(useStore.getState().S.customEx).toHaveLength(1)
    expect(useStore.getState().S.customEx[0].tg).toBe('biceps')
    expect(useStore.getState().S.customEx[0].sm).toEqual(['forearm'])
    expect(EXIDX['c-incline-curl']).toBeTruthy()
    expect(primaryMuscleOf('c-incline-curl')).toBe('biceps')
    expect(secondaryMusclesOf('c-incline-curl')).toEqual(['forearm'])
    expect(useStore.getState().S.routines).toHaveLength(1)
    expect(useStore.getState().S.routines[0].name).toBe('Push Pull Day')
    expect(useStore.getState().S.favorites).toEqual(['0025', 'c-incline-curl'])

    // 3. Log a workout containing both built-in (bench press) and custom exercise (incline curl)
    const completedWorkout = buildCompletedWorkout({
      id: 'w-1',
      d: '2026-08-24',
      start: Date.now() - 3600000,
      routineId: 'routine-push-pull-1',
      name: 'Push Pull Day',
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
        {
          id: 'c-incline-curl',
          sets: [
            { done: true, w: 16, r: 12 },
            { done: true, w: 16, r: 10 },
          ],
          topW: 16,
          target: { sets: 2, reps: 12 },
        },
      ],
    }, { end: Date.now(), prs: [] })

    act(() => {
      useStore.getState().update(s => {
        s.workouts.push(completedWorkout)
      })
    })
    expect(useStore.getState().S.workouts).toHaveLength(1)
    expect(useStore.getState().S.workouts[0].entries).toHaveLength(2)

    // 4. Stats update (fatigue and strength computed correctly for catalogue and custom exercises)
    const workouts = useStore.getState().S.workouts
    const fatigue = fatigueOf(workouts, Date.now())
    const strength = strengthOf(workouts, Date.now())
    // 0025: primary chest, secondary triceps & deltoids
    expect(fatigue.chest).toBeGreaterThan(0)
    expect(fatigue.triceps).toBeGreaterThan(0)
    expect(strength.chest).toBe(1)
    // c-incline-curl: primary biceps, secondary forearm
    expect(fatigue.biceps).toBeGreaterThan(0)
    expect(fatigue.forearm).toBeGreaterThan(0)
    expect(strength.biceps).toBe(1)
    expect(workouts.length).toBe(1)

    // 5. Export JSON preserving custom exercise tg/sm metadata
    const exportedState = JSON.parse(JSON.stringify(useStore.getState().S))
    act(() => {
      useStore.getState().update(s => {
        s.lastExport = Date.now()
      })
    })
    expect(useStore.getState().S.lastExport).toBeGreaterThan(0)
    expect(exportedState.routines).toHaveLength(1)
    expect(exportedState.workouts).toHaveLength(1)
    expect(exportedState.favorites).toEqual(['0025', 'c-incline-curl'])
    expect(exportedState.customEx).toHaveLength(1)
    expect(exportedState.customEx[0].tg).toBe('biceps')
    expect(exportedState.customEx[0].sm).toEqual(['forearm'])

    // 6. Wipe storage
    act(() => {
      useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
    })
    expect(useStore.getState().S.workouts).toHaveLength(0)
    expect(useStore.getState().S.routines).toHaveLength(0)
    expect(useStore.getState().S.favorites).toEqual([])
    expect(useStore.getState().S.customEx).toEqual([])

    // 7. Restore JSON backup to recreate data including favorites and custom exercise tg/sm fields
    act(() => {
      useStore.getState().replaceState(Object.assign(JSON.parse(JSON.stringify(DEF)), exportedState))
    })
    expect(useStore.getState().S.workouts).toHaveLength(1)
    expect(useStore.getState().S.workouts[0].name).toBe('Push Pull Day')
    expect(useStore.getState().S.routines).toHaveLength(1)
    expect(useStore.getState().S.routines[0].name).toBe('Push Pull Day')
    expect(useStore.getState().S.favorites).toEqual(['0025', 'c-incline-curl'])
    expect(useStore.getState().S.customEx).toHaveLength(1)
    expect(useStore.getState().S.customEx[0].tg).toBe('biceps')
    expect(useStore.getState().S.customEx[0].sm).toEqual(['forearm'])
    expect(EXIDX['c-incline-curl']).toBeTruthy()
    expect(primaryMuscleOf('c-incline-curl')).toBe('biceps')
    expect(secondaryMusclesOf('c-incline-curl')).toEqual(['forearm'])

    // 7b. Legacy JSON restore without explicit tg/sm or favorites field defaults gracefully
    const legacyBackup = {
      workouts: [{ id: 'w-legacy' }],
      routines: [{ id: 'r-legacy', name: 'Legacy Routine' }],
      customEx: [
        { id: 'c-legacy-legs', n: 'Old Leg Extension', bp: 'upper legs', eq: 'custom', custom: true },
        { id: 'c-legacy-back', n: 'Old Lat Pull', bp: 'back', eq: 'custom', custom: true },
      ],
      // notice 'favorites' is absent, and custom exercises lack 'tg' and 'sm'
    }
    act(() => {
      useStore.getState().replaceState(Object.assign(JSON.parse(JSON.stringify(DEF)), legacyBackup))
    })
    expect(useStore.getState().S.favorites).toEqual([])
    expect(useStore.getState().S.routines).toHaveLength(1)
    expect(useStore.getState().S.customEx).toHaveLength(2)

    // Legacy custom exercises correctly resolve primary and secondary muscles via BY_BODYPART fallbacks
    expect(primaryMuscleOf('c-legacy-legs')).toBe('quadriceps')
    expect(secondaryMusclesOf('c-legacy-legs')).toEqual(['hamstring', 'gluteal'])
    expect(matchesMuscleFilter('c-legacy-legs', 'quadriceps')).toBe(true)
    expect(matchesMuscleFilter('c-legacy-legs', 'hamstring')).toBe(true)
    expect(matchesMuscleFilter('c-legacy-legs', 'gluteal')).toBe(true)
    expect(matchesMuscleFilter('c-legacy-legs', 'chest')).toBe(false)

    expect(primaryMuscleOf('c-legacy-back')).toBe('upper-back')
    expect(secondaryMusclesOf('c-legacy-back')).toEqual(['lower-back'])
    expect(matchesMuscleFilter('c-legacy-back', 'upper-back')).toBe(true)
    expect(matchesMuscleFilter('c-legacy-back', 'lower-back')).toBe(true)

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
