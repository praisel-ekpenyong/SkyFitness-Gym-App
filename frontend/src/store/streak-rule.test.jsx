// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './useStore.js'
import { DEF, normalizeState } from '../lib/profile/index.js'
import { __setSinksForTests, __setLocalWriteForTests, flush, LOCAL_KEY } from '../platform/storage.js'
import { restoreFromBackup, resetProfile } from '../platform/restore.js'
import { buildPlanBundle } from '../lib/plan-share.js'
import { streakOf } from '../lib/streak.js'

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
const trained = d => ({ id: `w-${d}`, d, start: 1, end: 2, name: 'Push', entries: [{ id: 'lift', sets: [{ done: true, w: 60, r: 5 }] }] })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  __setSinksForTests([{ id: 'fake', read: async () => null, write: () => {} }])
  __setLocalWriteForTests()
  useStore.getState().replaceState(cloneDef())
  useStore.setState({ storageBlocked: false })
  flush()
})

afterEach(() => {
  vi.restoreAllMocks()
  __setSinksForTests()
  __setLocalWriteForTests()
  flush()
})

describe('legacy streakRule', () => {
  it('is no longer a default: a new or reset Profile has none', () => {
    expect(DEF).not.toHaveProperty('streakRule')
    expect(normalizeState({}, Date.now())).not.toHaveProperty('streakRule')
    resetProfile()
    expect(useStore.getState().S).not.toHaveProperty('streakRule')
  })

  it('an old Profile keeps it unchanged through a normal load, even a value the old rule picker never had', () => {
    expect(normalizeState({ ...cloneDef(), streakRule: 'generous' }, Date.now()).streakRule).toBe('generous')
    expect(normalizeState({ ...cloneDef(), streakRule: 'bogus' }, Date.now()).streakRule).toBe('bogus')
  })

  it('an old backup restores with it unchanged in the store and in storage, and the streak reads the same', () => {
    const workouts = ['2026-06-01', '2026-06-08', '2026-06-22'].map(trained)
    const today = new Date(2026, 5, 24, 12).getTime()
    restoreFromBackup({ ...cloneDef(), workouts, routines: [] })
    const plain = streakOf(useStore.getState().S, today)

    restoreFromBackup({ ...cloneDef(), workouts, routines: [], streakRule: 'generous' })
    const S = useStore.getState().S
    expect(S.streakRule).toBe('generous')
    expect(streakOf(S, today)).toEqual(plain)
    flush()
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)).streakRule).toBe('generous')
  })

  it('a plan file never carries it', () => {
    const S = { ...cloneDef(), streakRule: 'generous', routines: [] }
    const bundle = buildPlanBundle(S, 'Push pull')
    expect('streakRule' in bundle).toBe(false)
    expect(JSON.stringify(bundle)).not.toContain('streakRule')
  })
})
