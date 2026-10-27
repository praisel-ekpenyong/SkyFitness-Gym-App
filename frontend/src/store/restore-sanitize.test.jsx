// @vitest-environment happy-dom
// Audit-fixes 03: Restore skips bad Entries.
// Seam: store-plus-restore — drive the public Restore entry point the way a
// lifter does (load a backup file), assert the persisted Profile outcome
// (good Workout and Routine records survive) plus the visible notice
// (skipped count), and assert a stale Day override falls back to the week
// schedule with no Rescheduled badge. Vocabulary follows GLOSSARY.md
// (Workout, Entry, Day override as Rescheduled, Restore).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore, DEF } from './useStore.js'
import { useUI } from './useUI.js'
import { __setSinksForTests, __setLocalWriteForTests, flush, LOCAL_KEY } from '../lib/storage.js'
import { todayISO } from '../lib/format.js'

vi.mock('../lib/sound.js', () => ({
  beep: vi.fn(),
  vibrate: vi.fn(),
  playSetComplete: vi.fn(),
  playTimerWarning: vi.fn(),
  playTimerComplete: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))
vi.mock('../lib/mobile.js', () => ({
  MOBILE: false,
  nativeLoad: vi.fn(async () => null),
  nativeSave: vi.fn(async () => {}),
  syncReminder: vi.fn(async () => true),
  shareExport: vi.fn(async () => {}),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

const cloneDef = () => JSON.parse(JSON.stringify(DEF))

function goodWorkout(id) {
  return {
    id, d: todayISO(), start: 1, end: 2, name: 'Push',
    entries: [{ id: 'ex-push', sets: [{ w: 50, r: 8, done: true }] }],
  }
}

function goodRoutine(id) {
  return { id, name: 'Push ' + id, ex: [{ id: 'ex-push' }] }
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  __setSinksForTests([{ id: 'fake', read: async () => null, write: () => {} }])
  __setLocalWriteForTests()
  useStore.getState().replaceState(cloneDef())
  useStore.setState({ storageBlocked: false })
  useUI.setState({ toastMsg: '' })
  flush()
})

afterEach(() => {
  vi.restoreAllMocks()
  __setSinksForTests()
  __setLocalWriteForTests()
  flush()
})

describe('Restore skips bad Entries', () => {
  it('one malformed Entry never sinks a Restore; good Workouts and Routines land with a skipped count', async () => {
    const { restoreFromBackup } = await import('../lib/restore.js')
    const backup = {
      ...cloneDef(),
      workouts: [
        goodWorkout('w-good'),
        // One hand-edited Workout whose second Entry is malformed (null) and
        // third Entry has no sets array — the good Entry must still import.
        {
          id: 'w-mixed', d: todayISO(), start: 1, end: 2, name: 'Pull',
          entries: [
            { id: 'ex-pull', sets: [{ w: 60, r: 8, done: true }] },
            null,
            { id: 'ex-bad' },
          ],
        },
      ],
      routines: [
        goodRoutine('r-good'),
        // One hand-edited Routine with malformed ex Elements mixed in.
        { id: 'r-mixed', name: 'Pull', ex: [{ id: 'ex-pull' }, null, {}] },
      ],
    }
    let skipped = null
    expect(() => { skipped = restoreFromBackup(backup) }).not.toThrow()
    expect(skipped).toBeGreaterThan(0)
    // Persisted Profile outcome: every good Workout and Routine is present.
    const S = useStore.getState().S
    expect(S.workouts.map(w => w.id)).toEqual(expect.arrayContaining(['w-good', 'w-mixed']))
    expect(S.routines.map(r => r.id)).toEqual(expect.arrayContaining(['r-good', 'r-mixed']))
    // The malformed Entries are stripped, not imported.
    const mixedW = S.workouts.find(w => w.id === 'w-mixed')
    expect(mixedW.entries).toHaveLength(1)
    expect(mixedW.entries[0].id).toBe('ex-pull')
    const mixedR = S.routines.find(r => r.id === 'r-mixed')
    expect(mixedR.ex).toHaveLength(1)
    // Same good records reached durable storage.
    const persisted = JSON.parse(localStorage.getItem(LOCAL_KEY))
    expect(persisted.workouts.map(w => w.id)).toEqual(expect.arrayContaining(['w-good', 'w-mixed']))
    // Visible notice: skipped count is announced, not silent.
    expect(useUI.getState().toastMsg).toMatch(/skipped/i)
    expect(useUI.getState().toastMsg).toMatch(String(skipped))
    // The restored Profile renders — the tab is not killed.
    const { default: Home } = await import('../views/Home.jsx')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(React.createElement(Home)) })
    expect(container.textContent).toBeTruthy()
    await act(async () => { root.unmount() })
    container.remove()
  })

  it('a wholly malformed Workout element is skipped while good Workouts still land', async () => {
    const { restoreFromBackup } = await import('../lib/restore.js')
    const backup = {
      ...cloneDef(),
      workouts: [goodWorkout('w-good'), { id: 'w-bad', d: todayISO() }],
      routines: [goodRoutine('r-good')],
    }
    let skipped = null
    expect(() => { skipped = restoreFromBackup(backup) }).not.toThrow()
    expect(skipped).toBeGreaterThan(0)
    const S = useStore.getState().S
    expect(S.workouts.map(w => w.id)).toContain('w-good')
    expect(S.workouts.map(w => w.id)).not.toContain('w-bad')
    expect(useUI.getState().toastMsg).toMatch(/skipped/i)
  })
})

describe('stale Day override falls back without badge', () => {
  let root
  let container

  afterEach(async () => {
    if (root) await act(async () => { root.unmount() })
    if (container) container.remove()
    root = null
    container = null
  })

  it('a Day override pointing at a deleted Routine shows the week schedule with no Rescheduled badge', async () => {
    const today = todayISO()
    const wd = new Date(today + 'T12:00:00').getDay()
    useStore.getState().update(s => {
      s.routines = [{ id: 'r-week', name: 'Push', emoji: 'pushup', ex: [{ id: 'ex-push' }] }]
      s.week = { [wd]: 'r-week' }
      // Points at a Routine that no longer exists (deleted after the override).
      s.dayPlan = { [today]: 'r-deleted' }
      s.workouts = []
      s.active = null
      s.bodyweight = []
    })
    const { default: Home } = await import('../views/Home.jsx')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => { root.render(React.createElement(Home)) })
    // Falls back to the week schedule …
    expect(container.textContent).toContain('Push')
    // … with no Rescheduled badge claiming a reschedule to something deleted.
    expect(container.textContent).not.toMatch(/Rescheduled/i)
    expect(container.textContent).toMatch(/Scheduled today/)
  })
})

/* Reset (GLOSSARY.md): replacing the Profile with factory defaults wholesale —
   Restore with no backup loaded. The seam under test is the shared replace
   path, so the same normalization/persistence behavior applies. */

describe('Reset replaces the Profile through the Restore path', () => {
  it('clears planted data, never aliases DEF into the atom, and keeps DEF pristine', async () => {
    const { resetProfile } = await import('../lib/restore.js')
    useStore.getState().update(s => {
      s.workouts = [{ id: 'w-x', d: todayISO() }]
      s.favorites = ['ex-push']
    })
    resetProfile()

    const S = useStore.getState().S
    expect(S.workouts).toEqual([])
    expect(S.favorites).toEqual([])
    // the store atom is a fresh clone — mutating it must never reach the
    // shipped factory-defaults object
    expect(S).not.toBe(DEF)
    const defBefore = JSON.stringify(DEF)
    useStore.getState().update(s => { s.unit = 'lb' })
    expect(JSON.stringify(DEF)).toBe(defBefore)
  })
})
