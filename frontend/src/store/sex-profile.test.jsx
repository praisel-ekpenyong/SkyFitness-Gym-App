// @vitest-environment happy-dom
// Strength levels: the sex profile field travels with Export and Restore, Reset clears it,
// the plan file never carries it, and an invalid stored value reads as not set.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore, DEF, normalizeState } from './useStore.js'
import { __setSinksForTests, __setLocalWriteForTests, flush } from '../platform/storage.js'
import { restoreFromBackup, resetProfile } from '../platform/restore.js'
import { buildPlanBundle } from '../lib/plan-share.js'

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

beforeEach(() => {
  localStorage.clear()
  __setSinksForTests([{ id: 'fake', read: async () => null, write: () => {} }])
  __setLocalWriteForTests()
  useStore.getState().replaceState(cloneDef())
  flush()
})

afterEach(() => {
  vi.restoreAllMocks()
  __setSinksForTests()
  __setLocalWriteForTests()
  flush()
})

describe('sex survives Export and Restore', () => {
  it('a backup carries sex and a Restore puts it back', () => {
    useStore.setState({ S: { ...useStore.getState().S, sex: 'female' } })
    const backup = JSON.parse(JSON.stringify(useStore.getState().S))
    useStore.getState().replaceState(cloneDef())
    expect(useStore.getState().S.sex).toBeNull()

    restoreFromBackup(backup)
    expect(useStore.getState().S.sex).toBe('female')
  })

  it('a backup from before the field existed restores as not set', () => {
    const { sex, ...older } = cloneDef()
    restoreFromBackup({ ...older, workouts: [], routines: [] })
    expect(useStore.getState().S.sex).toBeNull()
  })

  it('a Restore with an invalid sex reads as not set', () => {
    restoreFromBackup({ ...cloneDef(), workouts: [], routines: [], sex: 'robot' })
    expect(useStore.getState().S.sex).toBeNull()
  })
})

describe('Reset clears sex', () => {
  it('resetProfile returns sex to not set', () => {
    useStore.setState({ S: { ...useStore.getState().S, sex: 'male' } })
    resetProfile()
    expect(useStore.getState().S.sex).toBeNull()
  })
})

describe('invalid stored values read as not set', () => {
  it('normalizeState keeps male and female and drops anything else', () => {
    expect(normalizeState({ sex: 'male' }).sex).toBe('male')
    expect(normalizeState({ sex: 'female' }).sex).toBe('female')
    expect(normalizeState({ sex: 'other' }).sex).toBeNull()
    expect(normalizeState({ sex: 42 }).sex).toBeNull()
    expect(normalizeState({}).sex).toBeNull()
  })
})

describe('the plan file never carries sex', () => {
  it('buildPlanBundle leaves sex out', () => {
    const S = { ...cloneDef(), sex: 'male', routines: [], customEx: [], week: {} }
    const bundle = buildPlanBundle(S, 'Push')
    expect(JSON.stringify(bundle)).not.toContain('"sex"')
    expect(bundle).not.toHaveProperty('sex')
  })
})
