// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { useStore, DEF } from './store/useStore.js'
import { buildCompletedWorkout } from './lib/active-workout.js'
import { fatigueOf, strengthOf } from './lib/recovery.js'
import { EXIDX } from './lib/exercises.js'
import {
  FILTER_MUSCLES,
  primaryMuscleOf,
  secondaryMusclesOf,
  matchesMuscleFilter,
  loadOfWorkouts,
  bodypartForMuscle,
  musclesOf,
} from './lib/muscles.js'
import { buildPlanBundle, parsePlan, mergePlan } from './lib/plan-share.js'
import { ExercisePicker } from './sheets.jsx'

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

describe('Ticket 05 — End-to-End Integration & Stats Diagram Parity', () => {
  it('passes the end-to-end user journey: boot -> custom exercises -> library & picker filtering -> routine -> workout -> stats body diagram parity -> export -> wipe -> import -> plan share -> legacy fallbacks -> theme', async () => {
    const consoleSpy = vi.spyOn(console, 'error')

    // 1. Boot to empty Sky log
    await boot()
    expect(useStore.getState().ready).toBe(true)
    expect(useStore.getState().S.workouts).toHaveLength(0)
    expect(useStore.getState().S.routines).toHaveLength(0)
    expect(useStore.getState().S.favorites).toEqual([])
    expect(useStore.getState().S.customEx).toEqual([])
    expect(document.querySelector('#tabbar')).toBeTruthy()

    // 2. Create custom exercises with canonical primary and secondary muscles
    const customExercise = {
      id: 'c-incline-curl',
      n: 'Incline Hammer Curl',
      bp: bodypartForMuscle('biceps'),
      tg: 'biceps',
      sm: ['forearm'],
      desc: 'Seat set to 45 degrees',
      eq: 'custom',
      custom: true,
    }

    const cardioCustom = {
      id: 'c-sprint-hiit',
      n: 'Sprint Intervals',
      bp: 'cardio',
      tg: 'cardio',
      sm: [],
      desc: 'Treadmill sprints',
      eq: 'custom',
      custom: true,
    }

    act(() => {
      useStore.getState().update(s => {
        s.customEx.push(customExercise, cardioCustom)
        s.favorites = ['0025', 'c-incline-curl']
      })
    })

    expect(useStore.getState().S.customEx).toHaveLength(2)
    expect(EXIDX['c-incline-curl']).toBeTruthy()
    expect(primaryMuscleOf('c-incline-curl')).toBe('biceps')
    expect(secondaryMusclesOf('c-incline-curl')).toEqual(['forearm'])
    expect(primaryMuscleOf('c-sprint-hiit')).toBe('cardio')
    expect(secondaryMusclesOf('c-sprint-hiit')).toEqual([])

    // 3. Verify Library filter chips and secondary badges in DOM
    const exercisesTab = Array.from(document.querySelectorAll('#tabbar button')).find(b => b.textContent.includes('Exercises'))
    expect(exercisesTab).toBeTruthy()
    await act(async () => {
      exercisesTab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Filter chips row should contain Favorites, All, 19 canonical muscles in anatomical order, and Cardio
    const filterChips = Array.from(document.querySelectorAll('.chips button.chip'))
    const chipLabels = filterChips.map(c => c.textContent.trim())
    expect(chipLabels).toContain('Biceps')
    expect(chipLabels).toContain('Forearms')
    expect(chipLabels).toContain('Cardio')

    // Helper to click filter chips
    const clickChip = async (scope, label) => {
      const chip = Array.from(scope.querySelectorAll('.chips button.chip')).find(c => c.textContent.trim() === label)
      expect(chip, `Expected chip with label ${label}`).toBeTruthy()
      await act(async () => {
        chip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    }

    // Filter by Biceps -> c-incline-curl appears as primary match (no secondary badge)
    await clickChip(document, 'Biceps')
    const bicepsListItems = Array.from(document.querySelectorAll('.list .item'))
    const inclineItemPrimary = bicepsListItems.find(it => it.textContent.includes('Incline Hammer Curl'))
    expect(inclineItemPrimary).toBeTruthy()
    expect(inclineItemPrimary.querySelector('.ss .tag')).toBeNull()

    // Filter by Forearms -> c-incline-curl appears with inline secondary badge
    await clickChip(document, 'Forearms')
    const forearmsListItems = Array.from(document.querySelectorAll('.list .item'))
    const inclineItemSecondary = forearmsListItems.find(it => it.textContent.includes('Incline Hammer Curl'))
    expect(inclineItemSecondary).toBeTruthy()
    expect(inclineItemSecondary.querySelector('.ss .tag')?.textContent).toContain('Secondary: Forearms')

    // Filter by Cardio -> c-sprint-hiit appears
    await clickChip(document, 'Cardio')
    const cardioListItems = Array.from(document.querySelectorAll('.list .item'))
    const sprintItem = cardioListItems.find(it => it.textContent.includes('Sprint Intervals'))
    expect(sprintItem).toBeTruthy()

    // Filter by Quads -> neither appears
    await clickChip(document, 'Quads')
    const quadsListItems = Array.from(document.querySelectorAll('.list .item'))
    expect(quadsListItems.some(it => it.textContent.includes('Incline Hammer Curl'))).toBe(false)
    expect(quadsListItems.some(it => it.textContent.includes('Sprint Intervals'))).toBe(false)

    // 4. Verify ExercisePicker sheet filtering parity
    const pickerContainer = document.createElement('div')
    document.body.appendChild(pickerContainer)
    const pickerRoot = createRoot(pickerContainer)
    const onPick = vi.fn()
    await act(async () => {
      pickerRoot.render(<ExercisePicker onPick={onPick} close={vi.fn()} />)
    })

    // Filter picker by Biceps
    await clickChip(pickerContainer, 'Biceps')
    const pickerBicepsItems = Array.from(pickerContainer.querySelectorAll('.list .item'))
    expect(pickerBicepsItems.some(it => it.textContent.includes('Incline Hammer Curl'))).toBe(true)

    // Filter picker by Forearms -> secondary badge rendered
    await clickChip(pickerContainer, 'Forearms')
    const pickerForearmsItems = Array.from(pickerContainer.querySelectorAll('.list .item'))
    const pickerInclineSec = pickerForearmsItems.find(it => it.textContent.includes('Incline Hammer Curl'))
    expect(pickerInclineSec).toBeTruthy()
    expect(pickerInclineSec.querySelector('.ss .tag')?.textContent).toContain('Secondary: Forearms')

    await act(async () => {
      pickerRoot.unmount()
    })
    pickerContainer.remove()

    // 5. Create routine and log a workout containing built-in (0025 Bench Press) and custom exercise (c-incline-curl)
    const routine = {
      id: 'routine-push-pull-1',
      name: 'Push Pull Day',
      ex: [
        { id: '0025', sets: 2, reps: 10, weight: 80 },
        { id: 'c-incline-curl', sets: 2, reps: 12, weight: 16 },
      ],
    }
    act(() => {
      useStore.getState().update(s => {
        s.routines.push(routine)
      })
    })

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

    // 6. Stats & body diagram parity verification:
    // Custom exercise with 2 sets contributes 1.0 load per set (2.0 sets total) to primary (biceps)
    // and 0.4 load per set (0.8 sets total) to secondary (forearm).
    // Bench press with 2 sets contributes 2.0 to primary (chest) and 0.8 to secondaries (triceps, deltoids).
    const workouts = useStore.getState().S.workouts
    const load = loadOfWorkouts(workouts, null)
    expect(load.biceps).toBeCloseTo(2.0, 5)
    expect(load.forearm).toBeCloseTo(0.8, 5)
    expect(load.chest).toBeCloseTo(2.0, 5)
    expect(load.triceps).toBeCloseTo(0.8, 5)
    expect(load.deltoids).toBeCloseTo(0.8, 5)

    const fatigue = fatigueOf(workouts, Date.now())
    const strength = strengthOf(workouts, Date.now())
    expect(fatigue.chest).toBeGreaterThan(0)
    expect(fatigue.triceps).toBeGreaterThan(0)
    expect(fatigue.deltoids).toBeGreaterThan(0)
    expect(fatigue.biceps).toBeGreaterThan(0)
    expect(fatigue.forearm).toBeGreaterThan(0)
    expect(strength.chest).toBe(1)
    expect(strength.triceps).toBe(1)
    expect(strength.deltoids).toBe(1)
    expect(strength.biceps).toBe(1)
    expect(strength.forearm).toBe(1)

    // Navigate to Stats view and assert Muscle balance card
    const statsTab = Array.from(document.querySelectorAll('#tabbar button')).find(b => b.textContent.includes('Stats'))
    expect(statsTab).toBeTruthy()
    await act(async () => {
      statsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const statsText = document.body.textContent
    expect(statsText).toContain('Muscle balance')
    expect(statsText).toContain('Workouts')

    // 7. Full profile JSON export preserving tg/sm metadata and favorites
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
    expect(exportedState.customEx).toHaveLength(2)
    const exportedIncline = exportedState.customEx.find(c => c.id === 'c-incline-curl')
    expect(exportedIncline.tg).toBe('biceps')
    expect(exportedIncline.sm).toEqual(['forearm'])

    // 8. Wipe storage
    act(() => {
      useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
    })
    expect(useStore.getState().S.workouts).toHaveLength(0)
    expect(useStore.getState().S.routines).toHaveLength(0)
    expect(useStore.getState().S.favorites).toEqual([])
    expect(useStore.getState().S.customEx).toEqual([])

    // 9. Restore JSON backup to recreate data including favorites and custom exercise tg/sm fields
    act(() => {
      useStore.getState().replaceState(Object.assign(JSON.parse(JSON.stringify(DEF)), exportedState))
    })
    expect(useStore.getState().S.workouts).toHaveLength(1)
    expect(useStore.getState().S.workouts[0].name).toBe('Push Pull Day')
    expect(useStore.getState().S.routines).toHaveLength(1)
    expect(useStore.getState().S.favorites).toEqual(['0025', 'c-incline-curl'])
    expect(useStore.getState().S.customEx).toHaveLength(2)
    expect(EXIDX['c-incline-curl']).toBeTruthy()
    expect(primaryMuscleOf('c-incline-curl')).toBe('biceps')
    expect(secondaryMusclesOf('c-incline-curl')).toEqual(['forearm'])
    expect(matchesMuscleFilter('c-incline-curl', 'biceps')).toBe(true)
    expect(matchesMuscleFilter('c-incline-curl', 'forearm')).toBe(true)

    // 10. Plan bundle sharing isolation & preservation
    const planBundle = buildPlanBundle(useStore.getState().S, 'Push Pull Plan')
    expect(planBundle.opengym_plan).toBe(1)
    expect(planBundle.customEx.length).toBe(1) // only referenced c-incline-curl included
    expect(planBundle.customEx[0].tg).toBe('biceps')
    expect(planBundle.customEx[0].sm).toEqual(['forearm'])
    expect(planBundle.favorites).toBeUndefined()
    expect(planBundle.workouts).toBeUndefined()

    const parsedBundle = parsePlan(JSON.stringify(planBundle))
    expect(parsedBundle.routineCount).toBe(1)
    expect(parsedBundle.customEx[0].tg).toBe('biceps')
    expect(parsedBundle.customEx[0].sm).toEqual(['forearm'])

    const targetState = { routines: [], customEx: [], week: {} }
    mergePlan(targetState, parsedBundle)
    expect(targetState.customEx[0].tg).toBe('biceps')
    expect(targetState.customEx[0].sm).toEqual(['forearm'])

    // 11. Legacy JSON restore without explicit tg/sm defaults gracefully to BY_BODYPART fallbacks
    const legacyBackup = {
      workouts: [{ id: 'w-legacy' }],
      routines: [{ id: 'r-legacy', name: 'Legacy Routine' }],
      customEx: [
        { id: 'c-legacy-legs', n: 'Old Leg Extension', bp: 'upper legs', eq: 'custom', custom: true },
        { id: 'c-legacy-back', n: 'Old Lat Pull', bp: 'back', eq: 'custom', custom: true },
      ],
    }
    act(() => {
      useStore.getState().replaceState(Object.assign(JSON.parse(JSON.stringify(DEF)), legacyBackup))
    })
    expect(useStore.getState().S.favorites).toEqual([])
    expect(useStore.getState().S.routines).toHaveLength(1)
    expect(useStore.getState().S.customEx).toHaveLength(2)

    // Legacy custom exercises resolve primary and secondary muscles via BY_BODYPART fallbacks
    expect(primaryMuscleOf('c-legacy-legs')).toBe('quadriceps')
    expect(secondaryMusclesOf('c-legacy-legs')).toEqual(['hamstring', 'gluteal'])
    expect(matchesMuscleFilter('c-legacy-legs', 'quadriceps')).toBe(true)
    expect(matchesMuscleFilter('c-legacy-legs', 'hamstring')).toBe(true)
    expect(matchesMuscleFilter('c-legacy-legs', 'gluteal')).toBe(true)
    expect(matchesMuscleFilter('c-legacy-legs', 'chest')).toBe(false)
    expect(musclesOf(EXIDX['c-legacy-legs'])).toEqual({
      quadriceps: 0.4,
      hamstring: 0.35,
      gluteal: 0.25,
    })

    expect(primaryMuscleOf('c-legacy-back')).toBe('lats')
    expect(secondaryMusclesOf('c-legacy-back')).toEqual(['upper-back', 'lower-back'])
    expect(matchesMuscleFilter('c-legacy-back', 'lats')).toBe(true)
    expect(matchesMuscleFilter('c-legacy-back', 'upper-back')).toBe(true)
    expect(matchesMuscleFilter('c-legacy-back', 'lower-back')).toBe(true)
    // 12. Theme toggle
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
  }, 30000)
})

