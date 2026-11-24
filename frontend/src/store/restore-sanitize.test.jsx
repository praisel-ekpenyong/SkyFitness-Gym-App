// @vitest-environment happy-dom
// Audit-fixes 03: Restore skips bad Entries.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './useStore.js'
import { DEF } from '../lib/profile/index.js'
import { useUI } from './useUI.js'
import { __setSinksForTests, __setLocalWriteForTests, flush, LOCAL_KEY } from '../platform/storage.js'
import { todayISO } from '../lib/dates.js'

vi.mock('../platform/sound.js', () => ({
  beep: vi.fn(),
  vibrate: vi.fn(),
  playSetComplete: vi.fn(),
  playTimerWarning: vi.fn(),
  playTimerComplete: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))
vi.mock('../platform/mobile.js', () => ({
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
    const { restoreFromBackup } = await import('../platform/restore.js')
    const backup = {
      ...cloneDef(),
      workouts: [
        goodWorkout('w-good'),
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
        { id: 'r-mixed', name: 'Pull', ex: [{ id: 'ex-pull' }, null, {}] },
      ],
    }
    let skipped = null
    expect(() => { skipped = restoreFromBackup(backup) }).not.toThrow()
    expect(skipped).toBeGreaterThan(0)
    const S = useStore.getState().S
    expect(S.workouts.map(w => w.id)).toEqual(expect.arrayContaining(['w-good', 'w-mixed']))
    expect(S.routines.map(r => r.id)).toEqual(expect.arrayContaining(['r-good', 'r-mixed']))
    const mixedW = S.workouts.find(w => w.id === 'w-mixed')
    expect(mixedW.entries).toHaveLength(1)
    expect(mixedW.entries[0].id).toBe('ex-pull')
    const mixedR = S.routines.find(r => r.id === 'r-mixed')
    expect(mixedR.ex).toHaveLength(1)
    const persisted = JSON.parse(localStorage.getItem(LOCAL_KEY))
    expect(persisted.workouts.map(w => w.id)).toEqual(expect.arrayContaining(['w-good', 'w-mixed']))
    expect(useUI.getState().toastMsg).toMatch(/skipped/i)
    expect(useUI.getState().toastMsg).toMatch(String(skipped))
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
    const { restoreFromBackup } = await import('../platform/restore.js')
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

describe('Restore of an old backup carrying exWeights and stamped prs', () => {
  it('loads, shows the same Best and Records as a backup without them, and keeps both fields unchanged in storage', async () => {
    const { restoreFromBackup } = await import('../platform/restore.js')
    const { best, records } = await import('../lib/training-log.js')
    const wk = (id, d, w, extra = {}) => ({ id, d, start: 1, end: 2, name: 'Push', entries: [{ id: '0025', sets: [{ w, r: 5, done: true }] }], ...extra })
    const legacyCache = { '0025': { w: 999, d: '2026-01-01', unit: 'kg' }, gone: { w: 5 } }
    const clean = { ...cloneDef(), unit: 'kg', workouts: [wk('w1', '2026-01-01', 100), wk('w2', '2026-01-08', 110)] }
    const old = { ...clean, exWeights: legacyCache, workouts: [wk('w1', '2026-01-01', 100, { prs: ['0025'] }), wk('w2', '2026-01-08', 110, { prs: ['zzz'] })] }

    restoreFromBackup(clean)
    const S0 = useStore.getState().S
    const expected = { best: best(S0, '0025'), records: records(S0, S0.workouts[1]) }

    restoreFromBackup(JSON.parse(JSON.stringify(old)))
    const S = useStore.getState().S
    expect(best(S, '0025')).toBe(expected.best)
    expect(best(S, '0025')).toBe(110)
    expect(records(S, S.workouts[1])).toEqual(expected.records)
    expect(S.exWeights).toEqual(legacyCache)
    expect(S.workouts.map(w => w.prs)).toEqual([['0025'], ['zzz']])
    flush()
    const persisted = JSON.parse(localStorage.getItem(LOCAL_KEY))
    expect(persisted.exWeights).toEqual(legacyCache)
    expect(persisted.workouts.map(w => w.prs)).toEqual([['0025'], ['zzz']])
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
    expect(container.textContent).toContain('Push')
    expect(container.querySelector('.home-badge').textContent).toBe('Scheduled today')
    expect(container.textContent).not.toMatch(/\bRescheduled/i)
  })
})


describe('Reset replaces the Profile through the Restore path', () => {
  it('clears planted data, never aliases DEF into the atom, and keeps DEF pristine', async () => {
    const { resetProfile } = await import('../platform/restore.js')
    useStore.getState().update(s => {
      s.workouts = [{ id: 'w-x', d: todayISO() }]
      s.favorites = ['ex-push']
    })
    resetProfile()

    const S = useStore.getState().S
    expect(S.workouts).toEqual([])
    expect(S.favorites).toEqual([])
    expect(S).not.toBe(DEF)
    const defBefore = JSON.stringify(DEF)
    useStore.getState().update(s => { s.unit = 'lb' })
    expect(JSON.stringify(DEF)).toBe(defBefore)
  })
})

describe('Restore keeps every DEF key and puts the Training log in order', () => {
  it('copies every DEF key except the Active workout, plus the legacy exWeights and streakRule', async () => {
    const { restoreFromBackup } = await import('../platform/restore.js')
    const legacyCache = { '0025': { w: 999, d: '2026-01-01', unit: 'kg' } }
    const backup = {
      schemaVersion: DEF.schemaVersion,
      unit: 'lb', restSec: 45, sound: false, keepAwake: false, theme: 'light', accent: 'sky',
      body: 'female', targetW: 78,
      bodyweight: [{ d: '2026-01-01', w: 78, t: 1 }],
      routines: [goodRoutine('r-keep')],
      week: { 1: 'r-keep' },
      dayPlan: { '2026-01-05': 'r-keep' },
      workouts: [goodWorkout('w-keep')],
      active: { id: 'never-restored', entries: [{ id: 'ex-push', sets: [] }] },
      customEx: [{ id: 'cx-keep', n: 'Cable Thing', bp: 'chest', custom: true }],
      gifSize: 'small', favorites: ['ex-push'],
      reminder: { on: true, time: '07:00', tz: 'Europe/Berlin' },
      effort: 'rpe', lastExport: 1234, displayName: 'Sky',
      sex: 'female', birthYear: 1990,
      trainingStyle: 'high', volumeRanges: { chest: [5, 12] }, streakRule: 'strict',
      exWeights: legacyCache,
    }

    restoreFromBackup(backup)

    const S = useStore.getState().S
    expect(S.active).toBeNull()
    for (const key of Object.keys(DEF)) {
      if (key === 'active') continue
      if (key === 'routines') {
        expect(S.routines.map(r => ({ ...r, ex: r.ex.map(({ rowId, ...e }) => e) })), 'DEF key routines').toEqual(backup.routines)
        expect(S.routines.every(r => r.ex.every(e => typeof e.rowId === 'string' && e.rowId))).toBe(true)
        continue
      }
      expect(S[key], `DEF key ${key}`).toEqual(backup[key])
    }
    expect(S.exWeights).toEqual(legacyCache)
    expect(S.streakRule).toBe('strict')
  })

  it('cleans a restored sex and birth year once, through normalizeState, with the same result as before', async () => {
    const { restoreFromBackup } = await import('../platform/restore.js')
    const { sanitizeRestorePayload } = await import('../lib/profile/index.js')
    const year = new Date().getFullYear()

    restoreFromBackup({ ...cloneDef(), sex: 'male', birthYear: 1966 })
    expect(useStore.getState().S).toMatchObject({ sex: 'male', birthYear: 1966 })

    restoreFromBackup({ ...cloneDef(), sex: 'robot', birthYear: year + 1 })
    expect(useStore.getState().S).toMatchObject({ sex: null, birthYear: null })

    restoreFromBackup({ ...cloneDef(), sex: 42, birthYear: '1990' })
    expect(useStore.getState().S).toMatchObject({ sex: null, birthYear: null })

    // The restore cleaner itself leaves field values to normalizeState.
    expect(sanitizeRestorePayload({ workouts: [], routines: [], sex: 'robot' }).clean.sex).toBe('robot')
  })

  it('sorts an unsorted backup by date, then start, then original position', async () => {
    const { restoreFromBackup } = await import('../platform/restore.js')
    const wk = (id, d, start) => ({ id, d, start, end: start + 1, name: 'Push', entries: [] })
    restoreFromBackup({
      ...cloneDef(),
      workouts: [
        wk('late', '2026-02-01', 1),
        wk('early-second', '2026-01-01', 50),
        wk('early-first', '2026-01-01', 10),
        wk('first-tie', '2026-01-01', 10),
      ],
    })
    const S = useStore.getState().S
    expect(S.workouts.map(w => w.id)).toEqual(['early-first', 'first-tie', 'early-second', 'late'])
  })

  it('upgrades a legacy warm-up shape on restore, the same way boot does', async () => {
    const { restoreFromBackup } = await import('../platform/restore.js')
    // A backup with warm-up flags predates the schema version: version 0.
    const { schemaVersion, ...version0 } = cloneDef()
    const backup = {
      ...version0,
      workouts: [{
        id: 'w-legacy', d: todayISO(), start: 1, end: 2, name: 'Push',
        entries: [{ id: 'ex-push', sets: [{ warmup: true, w: 40, r: 5, done: true }, { w: 60, r: 5, done: true }] }],
      }],
    }
    restoreFromBackup(backup)
    expect(useStore.getState().S.workouts[0].entries[0].sets[0]).toEqual({ w: 40, r: 5, done: true, phase: 'warmup' })
  })

  it('restores a pre-effort backup with showRir: true as effort rir, the same way boot does', async () => {
    const { restoreFromBackup } = await import('../platform/restore.js')
    const { schemaVersion, effort, ...version0 } = cloneDef()
    restoreFromBackup({ ...version0, showRir: true })
    const S = useStore.getState().S
    expect(S.effort).toBe('rir')
    expect(S).not.toHaveProperty('showRir')
  })
})

describe('Normal load of a Profile carrying exWeights and stamped prs', () => {
  it('keeps both unchanged through normalizeState', async () => {
    const { normalizeState } = await import('../lib/profile/index.js')
    const legacyCache = { '0025': { w: 999, d: '2026-01-01', unit: 'kg' } }
    const w = { id: 'w1', d: '2026-01-01', start: 1, end: 2, name: 'Push', prs: ['0025'], entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }] }
    const S = normalizeState({ ...cloneDef(), exWeights: legacyCache, workouts: [w] })
    expect(S.exWeights).toEqual(legacyCache)
    expect(S.workouts[0].prs).toEqual(['0025'])
  })
})
