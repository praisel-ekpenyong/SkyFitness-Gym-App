// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FinishSummary, finishWorkout, configureSessionSheets } from './session.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { setNav } from '../lib/nav.js'

let container
let root
let navTarget = null

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  navTarget = null
  setNav(dest => { navTarget = dest })

  useStore.setState({
    S: {
      ...DEF,
      routines: [
        {
          id: 'routine-push',
          name: 'Push Day',
          ex: [
            { id: '0025', sets: 3 },
          ],
        },
      ],
      workouts: [],
      exWeights: {},
      active: null,
    },
  })
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })

  configureSessionSheets({
    bwSheet: vi.fn(),
    confirmSheet: vi.fn(),
    WeightInput: () => null,
  })

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('FinishSummary Routine Sync UI Integration', () => {
  const dummyWorkout = {
    id: 'w-1',
    d: '2026-10-29',
    start: 1000,
    end: 2000,
    entries: [
      { id: '0025', sets: [{ w: 80, r: 5, done: true }] },
    ],
  }

  const routineSyncWithDiff = {
    hasDiff: true,
    routineId: 'routine-push',
    routineName: 'Push Day',
    changes: [
      '+ Incline Dumbbell Press',
      'Bench Press: 3 → 4 sets',
    ],
    syncedEx: [
      { id: '0025', sets: 4 },
      { id: '0026', sets: 3 },
    ],
  }

  it('renders routine update card with accessible toggle and change badges when routine diff is present', async () => {
    const close = vi.fn()
    await act(async () => {
      root.render(<FinishSummary w={dummyWorkout} prs={[]} routineSync={routineSyncWithDiff} close={close} />)
    })

    // The update card should be rendered
    const card = container.querySelector('.card')
    expect(card).not.toBeNull()

    // Title / label inside card
    expect(card.textContent).toContain('Update routine “Push Day”')

    // Switch toggle button
    const toggle = card.querySelector('button[role="switch"]')
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('aria-label')).toBe('Update routine “Push Day”')
    expect(toggle.getAttribute('aria-checked')).toBe('false') // Default unchecked

    // Badges beneath toggle
    const badges = Array.from(card.querySelectorAll('.tag'))
    expect(badges.length).toBe(2)
    expect(badges[0].textContent).toBe('+ Incline Dumbbell Press')
    expect(badges[1].textContent).toBe('Bench Press: 3 → 4 sets')

    // Card sits above the primary dismissal button
    const niceBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Nice!'))
    expect(niceBtn).not.toBeNull()
    expect(niceBtn.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it('omits routine update card entirely when routineSync is null or hasDiff is false', async () => {
    const close = vi.fn()
    await act(async () => {
      root.render(<FinishSummary w={dummyWorkout} prs={[]} routineSync={null} close={close} />)
    })

    const switchBtn = container.querySelector('button[role="switch"]')
    expect(switchBtn).toBeNull()

    // Also with { hasDiff: false }
    await act(async () => {
      root.render(<FinishSummary w={dummyWorkout} prs={[]} routineSync={{ hasDiff: false }} close={close} />)
    })
    expect(container.querySelector('button[role="switch"]')).toBeNull()
  })

  it('leaves routines untouched when dismissed with toggle off', async () => {
    const close = vi.fn()
    await act(async () => {
      root.render(<FinishSummary w={dummyWorkout} prs={[]} routineSync={routineSyncWithDiff} close={close} />)
    })

    const niceBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Nice!'))
    await act(async () => {
      niceBtn.click()
    })

    // Routine remains unchanged
    const routine = useStore.getState().S.routines.find(r => r.id === 'routine-push')
    expect(routine.ex).toEqual([{ id: '0025', sets: 3 }])

    // Sheet closed and navigated home
    expect(close).toHaveBeenCalledTimes(1)
    expect(navTarget).toBe('/home')

    // No update toast emitted
    expect(useUI.getState().toastMsg).not.toContain('Push Day')
  })

  it('commits routine update and emits confirmation toast when dismissed with toggle turned on', async () => {
    const close = vi.fn()
    await act(async () => {
      root.render(<FinishSummary w={dummyWorkout} prs={[]} routineSync={routineSyncWithDiff} close={close} />)
    })

    // Turn toggle ON
    const toggle = container.querySelector('button[role="switch"]')
    await act(async () => {
      toggle.click()
    })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    // Tap "Nice!"
    const niceBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Nice!'))
    await act(async () => {
      niceBtn.click()
    })

    // Routine is updated in store
    const routine = useStore.getState().S.routines.find(r => r.id === 'routine-push')
    expect(routine.ex).toEqual([
      { id: '0025', sets: 4 },
      { id: '0026', sets: 3 },
    ])

    // Toast emitted
    expect(useUI.getState().toastMsg).toBe('Routine “Push Day” updated')

    // Sheet closed and navigated
    expect(close).toHaveBeenCalledTimes(1)
    expect(navTarget).toBe('/home')
  })

  it('integrates with finishWorkout(): computes routineSync and surfaces toggle in opened sheet', async () => {
    // Setup active session attached to 'routine-push' with 4 performed sets (routine had 3)
    useStore.setState({
      S: {
        ...useStore.getState().S,
        active: {
          id: 'active-1',
          d: '2026-10-29',
          start: 1000,
          routineId: 'routine-push',
          name: 'Push Day',
          bw: null,
          unit: 'kg',
          cur: 0,
          entries: [
            {
              id: '0025',
              sets: [
                { w: 80, r: 5, done: true },
                { w: 80, r: 5, done: true },
                { w: 80, r: 5, done: true },
                { w: 80, r: 5, done: true },
              ],
              target: { sets: 3, reps: 5 },
            },
          ],
        },
      },
    })

    // Finish the workout
    await act(async () => {
      finishWorkout()
    })

    // A sheet should have been opened
    const sheets = useUI.getState().sheets
    expect(sheets.length).toBe(1)

    // Render the sheet contents into our test root
    const closeSheet = vi.fn()
    await act(async () => {
      root.render(sheets[0].render(closeSheet))
    })

    // Verify update toggle exists
    const toggle = container.querySelector('button[role="switch"]')
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('aria-label')).toBe('Update routine “Push Day”')
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    // Badges reflect the change (3 -> 4 sets)
    const badge = container.querySelector('.card .tag')
    expect(badge?.textContent).toContain('4 sets')

    // Tapping switch then "Nice!" commits
    await act(async () => {
      toggle.click()
    })
    const niceBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Nice!'))
    await act(async () => {
      niceBtn.click()
    })

    const updated = useStore.getState().S.routines.find(r => r.id === 'routine-push')
    expect(updated.ex[0].sets).toBe(4)
    expect(useUI.getState().toastMsg).toBe('Routine “Push Day” updated')
    expect(closeSheet).toHaveBeenCalled()
    expect(navTarget).toBe('/home')
  })

  it('detects in-session note updates as note updated in FinishSummary change tags, and committing updates S.routines', async () => {
    useStore.setState({
      S: {
        ...DEF,
        routines: [
          {
            id: 'routine-push',
            name: 'Push Day',
            ex: [
              { id: '0025', sets: 3, notes: 'Seat height 5' },
            ],
          },
        ],
        workouts: [],
        exWeights: {},
        active: {
          id: 'active-1',
          d: '2026-10-29',
          start: 1000,
          routineId: 'routine-push',
          name: 'Push Day',
          bw: null,
          unit: 'kg',
          cur: 0,
          entries: [
            {
              id: '0025',
              notes: 'Seat height 6, pin 8',
              sets: [
                { w: 80, r: 5, done: true },
                { w: 80, r: 5, done: true },
                { w: 80, r: 5, done: true },
              ],
              target: { sets: 3, reps: 5, notes: 'Seat height 6, pin 8' },
            },
          ],
        },
      },
    })

    await act(async () => {
      finishWorkout()
    })

    const sheets = useUI.getState().sheets
    expect(sheets.length).toBe(1)

    const closeSheet = vi.fn()
    await act(async () => {
      root.render(sheets[0].render(closeSheet))
    })

    const badge = container.querySelector('.card .tag')
    expect(badge).not.toBeNull()
    expect(badge.textContent).toBe('Barbell Bench Press: note updated')

    const toggle = container.querySelector('button[role="switch"]')
    await act(async () => {
      toggle.click()
    })
    const niceBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Nice!'))
    await act(async () => {
      niceBtn.click()
    })

    const updated = useStore.getState().S.routines.find(r => r.id === 'routine-push')
    expect(updated.ex[0].notes).toBe('Seat height 6, pin 8')
    expect(useUI.getState().toastMsg).toBe('Routine “Push Day” updated')
    expect(closeSheet).toHaveBeenCalled()
    expect(navTarget).toBe('/home')
  })

  it('detects in-session note removal as note removed in FinishSummary change tags, and committing removes note in S.routines', async () => {
    useStore.setState({
      S: {
        ...DEF,
        routines: [
          {
            id: 'routine-push',
            name: 'Push Day',
            ex: [
              { id: '0025', sets: 3, notes: 'Old cue to remove' },
            ],
          },
        ],
        workouts: [],
        exWeights: {},
        active: {
          id: 'active-1',
          d: '2026-10-29',
          start: 1000,
          routineId: 'routine-push',
          name: 'Push Day',
          bw: null,
          unit: 'kg',
          cur: 0,
          entries: [
            {
              id: '0025',
              sets: [
                { w: 80, r: 5, done: true },
                { w: 80, r: 5, done: true },
                { w: 80, r: 5, done: true },
              ],
              target: { sets: 3, reps: 5 },
            },
          ],
        },
      },
    })

    await act(async () => {
      finishWorkout()
    })

    const sheets = useUI.getState().sheets
    expect(sheets.length).toBe(1)

    const closeSheet = vi.fn()
    await act(async () => {
      root.render(sheets[0].render(closeSheet))
    })

    const badge = container.querySelector('.card .tag')
    expect(badge).not.toBeNull()
    expect(badge.textContent).toBe('Barbell Bench Press: note removed')

    const toggle = container.querySelector('button[role="switch"]')
    await act(async () => {
      toggle.click()
    })
    const niceBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Nice!'))
    await act(async () => {
      niceBtn.click()
    })

    const updated = useStore.getState().S.routines.find(r => r.id === 'routine-push')
    expect(updated.ex[0].notes).toBeUndefined()
    expect('notes' in updated.ex[0]).toBe(false)
  })
})

