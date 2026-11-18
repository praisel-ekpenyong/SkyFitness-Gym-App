// @vitest-environment happy-dom
// ADR 0027: every way a Profile comes in — boot, another tab, Restore, CSV import — runs admit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './useStore.js'
import { DEF } from '../lib/profile/index.js'
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

function legacyProfile(ts) {
  return {
    _ts: ts,
    unit: 'kg',
    workouts: [{
      id: 'w-legacy', d: '2026-01-01', start: 1, end: 2, name: 'Push',
      entries: [{
        id: '0025',
        sets: [
          { warmup: true, w: 40, r: 5, done: true },
          { w: 60, r: 5, done: true },
        ],
      }],
    }],
  }
}

const firstSet = () => useStore.getState().S.workouts[0].entries[0].sets[0]

beforeEach(() => {
  localStorage.clear()
  __setSinksForTests([{ id: 'fake', read: async () => null, write: () => {} }])
  __setLocalWriteForTests()
  useStore.getState().replaceState(cloneDef())
  useStore.setState({ ready: false })
  flush()
})

afterEach(() => {
  __setSinksForTests()
  __setLocalWriteForTests()
  flush()
})

describe('a Profile entering the store runs admit', () => {
  it('upgrades a legacy warm-up shape on boot', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(legacyProfile(Date.now() + 60_000)))

    await useStore.getState().boot()

    expect(firstSet()).toEqual({ w: 40, r: 5, done: true, phase: 'warmup' })
    expect(firstSet().warmup).toBeUndefined()
  })

  it('upgrades a legacy warm-up shape written by another tab', () => {
    useStore.setState({ S: { ...cloneDef(), _ts: 1 } })

    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_KEY, newValue: JSON.stringify(legacyProfile(2)) }))

    expect(firstSet()).toEqual({ w: 40, r: 5, done: true, phase: 'warmup' })
    expect(firstSet().warmup).toBeUndefined()
  })
})
