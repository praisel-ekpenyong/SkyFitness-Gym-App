// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './useStore.js'
import { DEF, normalizeState } from '../lib/profile/index.js'
import { useUI } from './useUI.js'
import { __setSinksForTests, __setLocalWriteForTests, flush, LOCAL_KEY } from '../platform/storage.js'

vi.mock('../platform/sound.js', async orig => (await import('../test/platform-mocks.js')).mockSound(await orig()))
vi.mock('../platform/mobile.js', async orig => (await import('../test/platform-mocks.js')).mockMobile(await orig()))

const cloneDef = () => JSON.parse(JSON.stringify(DEF))
const RETIRED = ['gold', 'red', 'orange']
const KEPT = ['lime', 'sky', 'violet', 'pink', 'teal']

beforeEach(() => {
  localStorage.clear()
  __setSinksForTests([{ id: 'fake', read: async () => null, write: () => {} }])
  __setLocalWriteForTests()
  useStore.getState().replaceState(cloneDef())
  useStore.setState({ storageBlocked: false, ready: false })
  useUI.setState({ toastMsg: '' })
  flush()
})

afterEach(() => {
  __setSinksForTests()
  __setLocalWriteForTests()
  flush()
})

describe('a retired accent reads as lime', () => {
  it.each(RETIRED)('normalizing a Profile with accent "%s" gives lime, without touching the stored object', accent => {
    const stored = { ...cloneDef(), accent }
    expect(normalizeState(stored, Date.now()).accent).toBe('lime')
    expect(stored.accent).toBe(accent)
  })

  it.each(KEPT)('accent "%s" is kept', accent => {
    expect(normalizeState({ ...cloneDef(), accent }, Date.now()).accent).toBe(accent)
  })

  it('a missing or junk accent is lime', () => {
    expect(normalizeState({ workouts: [] }, Date.now()).accent).toBe('lime')
    expect(normalizeState({ accent: 'constructor' }, Date.now()).accent).toBe('lime')
    expect(normalizeState({ accent: 42 }, Date.now()).accent).toBe('lime')
  })

  it('seals a legacy showRir flag onto effort', () => {
    const { schemaVersion, ...version0 } = cloneDef()
    const stored = { ...version0, showRir: true }
    const S = normalizeState(stored, Date.now())
    expect(S.effort).toBe('rir')
    expect(S.showRir).toBeUndefined()
    expect(stored.showRir).toBe(true)
    expect(normalizeState({ ...version0, effort: 'rpe', showRir: true }, Date.now()).effort).toBe('rpe')
  })

  it('restoring a backup that chose orange lands on lime', async () => {
    const { restoreFromBackup } = await import('../platform/restore.js')
    restoreFromBackup({ ...cloneDef(), accent: 'orange' })
    expect(useStore.getState().S.accent).toBe('lime')
  })

  it('booting from a newer mirror copy that chose gold lands on lime', async () => {
    const mirror = { ...cloneDef(), accent: 'gold', bodyweight: [{ d: '2026-01-01', w: 80 }], _ts: Date.now() + 60_000 }
    __setSinksForTests([{ id: 'fake', read: async () => mirror, write: () => {} }])
    await useStore.getState().boot()
    expect(useStore.getState().S.accent).toBe('lime')
    expect(mirror.accent).toBe('gold')
  })

  it('opening the app on a localStorage Profile that chose red lands on lime', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...cloneDef(), accent: 'red', _ts: 1 }))
    vi.resetModules()
    const fresh = await import('./useStore.js')
    expect(fresh.useStore.getState().S.accent).toBe('lime')
  })
})
