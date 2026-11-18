// @vitest-environment happy-dom
// ADR 0027: a Profile written by a newer Sky is never admitted, at boot, from another tab or on Restore.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './useStore.js'
import { useUI } from './useUI.js'
import { DEF, SCHEMA_VERSION } from '../lib/profile/index.js'
import { LOCAL_KEY, __setSinksForTests, __setLocalWriteForTests, flush } from '../platform/storage.js'

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

const cloneDef = () => JSON.parse(JSON.stringify(DEF))

function newerProfile(ts) {
  return {
    _ts: ts,
    schemaVersion: SCHEMA_VERSION + 1,
    unit: 'kg',
    routines: [],
    workouts: [{ id: 'w-newer', d: '2026-01-01', start: 1, end: 2, name: 'Push', entries: [] }],
  }
}

let sinkWrites

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  sinkWrites = []
  __setSinksForTests([{ id: 'fake', read: async () => null, write: s => { sinkWrites.push(s) } }])
  __setLocalWriteForTests()
  useStore.setState({ newerProfile: false })
  useStore.getState().replaceState(cloneDef())
  useStore.setState({ ready: false })
  useUI.setState({ toastMsg: '' })
  flush()
  sinkWrites = []
})

afterEach(() => {
  useStore.setState({ newerProfile: false })
  __setSinksForTests()
  __setLocalWriteForTests()
  flush()
})

describe('boot', () => {
  it('does not admit a newer Profile from localStorage, and leaves it on disk as it was', async () => {
    const onDisk = JSON.stringify(newerProfile(Date.now() + 60_000))
    localStorage.setItem(LOCAL_KEY, onDisk)

    await useStore.getState().boot()
    flush()

    expect(useStore.getState().newerProfile).toBe(true)
    expect(useStore.getState().ready).toBe(true)
    expect(useStore.getState().S.workouts).toEqual([])
    expect(localStorage.getItem(LOCAL_KEY)).toBe(onDisk)
    expect(sinkWrites).toEqual([])
  })

  it('does not admit a newer Profile from the mirror', async () => {
    __setSinksForTests([{ id: 'fake', read: async () => newerProfile(Date.now() + 60_000), write: s => { sinkWrites.push(s) } }])
    const local = localStorage.getItem(LOCAL_KEY)

    await useStore.getState().boot()
    flush()

    expect(useStore.getState().newerProfile).toBe(true)
    expect(useStore.getState().S.workouts).toEqual([])
    expect(localStorage.getItem(LOCAL_KEY)).toBe(local)
    expect(sinkWrites).toEqual([])
  })
})

describe('another tab', () => {
  it('does not admit a newer Profile, and this tab stops writing over it', () => {
    useStore.getState().update(s => { s.displayName = 'Mine' })
    const before = useStore.getState().S
    const theirs = JSON.stringify(newerProfile(before._ts + 1))
    localStorage.setItem(LOCAL_KEY, theirs)

    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_KEY, newValue: theirs }))

    expect(useStore.getState().newerProfile).toBe(true)
    expect(useStore.getState().S).toBe(before)
    useStore.getState().update(s => { s.displayName = 'Later' })
    expect(localStorage.getItem(LOCAL_KEY)).toBe(theirs)
  })

  it('refuses a newer Profile even when its timestamp is older', () => {
    useStore.setState({ S: { ...cloneDef(), _ts: 10 } })
    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_KEY, newValue: JSON.stringify(newerProfile(1)) }))
    expect(useStore.getState().newerProfile).toBe(true)
  })

  it('still admits a current Profile', () => {
    useStore.setState({ S: { ...cloneDef(), _ts: 1 } })
    const theirs = { ...cloneDef(), _ts: 2, displayName: 'Theirs' }
    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_KEY, newValue: JSON.stringify(theirs) }))
    expect(useStore.getState().newerProfile).toBe(false)
    expect(useStore.getState().S.displayName).toBe('Theirs')
  })
})

describe('Restore', () => {
  it('refuses a newer backup with a clear message and changes nothing', async () => {
    const { restoreFromBackup } = await import('../platform/restore.js')
    useStore.getState().update(s => { s.displayName = 'Mine' })
    const before = useStore.getState().S
    const onDisk = localStorage.getItem(LOCAL_KEY)

    expect(() => restoreFromBackup(newerProfile(1))).toThrow(/newer version of Sky/)

    expect(useStore.getState().S).toBe(before)
    expect(localStorage.getItem(LOCAL_KEY)).toBe(onDisk)
    expect(useStore.getState().newerProfile).toBe(false)
    expect(useUI.getState().toastMsg).toBe('')
  })

  it('upgrades a version-0 backup from 0 and stamps it', async () => {
    const { restoreFromBackup } = await import('../platform/restore.js')
    restoreFromBackup({
      routines: [],
      workouts: [{ id: 'w', d: '2026-01-01', start: 1, entries: [{ id: 'e', sets: [{ warmup: true, w: 20 }] }] }],
    })
    const S = useStore.getState().S
    expect(S.schemaVersion).toBe(SCHEMA_VERSION)
    expect(S.workouts[0].entries[0].sets[0]).toEqual({ w: 20, phase: 'warmup' })
  })
})

describe('the notice', () => {
  let root
  let container

  afterEach(async () => {
    if (root) await act(async () => { root.unmount() })
    if (container) container.remove()
    root = null
    container = null
  })

  it('replaces the app with a reload notice', async () => {
    useStore.setState({ newerProfile: true })
    const { default: App } = await import('../App.jsx')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => { root.render(React.createElement(App)) })
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    expect(container.textContent).toMatch(/newer version of Sky/)
    expect(container.textContent).toMatch(/Reload Sky/)
    expect(container.querySelector('#tabbar')).toBeNull()
  })
})

// Last in the file: it resets the module registry, so later dynamic imports would load a second store.
describe('store creation', () => {
  it('refuses a newer Profile already in localStorage when the store is created', async () => {
    const onDisk = JSON.stringify(newerProfile(5))
    localStorage.setItem(LOCAL_KEY, onDisk)
    vi.resetModules()
    const fresh = (await import('./useStore.js')).useStore

    expect(fresh.getState().newerProfile).toBe(true)
    expect(fresh.getState().S.workouts).toEqual([])
    await fresh.getState().boot()
    expect(fresh.getState().ready).toBe(true)
    fresh.getState().update(s => { s.unit = 'lb' })
    expect(localStorage.getItem(LOCAL_KEY)).toBe(onDisk)
  })
})
