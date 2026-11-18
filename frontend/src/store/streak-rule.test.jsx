// @vitest-environment happy-dom
// Week streak 03: the freeze rule travels in Restore and Export, Reset puts it back to Gentle, and the plan file never carries it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './useStore.js'
import { DEF } from '../lib/profile/index.js'
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
const ruleNow = () => useStore.getState().S.streakRule
const setRule = rule => useStore.getState().update(s => { s.streakRule = rule })

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

describe('freeze rule in Export, Restore and Reset', () => {
  it('a backup taken on Strict restores as Strict', () => {
    setRule('strict')
    const exported = JSON.parse(JSON.stringify(useStore.getState().S))
    resetProfile()
    expect(ruleNow()).toBe('gentle')
    restoreFromBackup(exported)
    expect(ruleNow()).toBe('strict')
  })

  it('a backup carrying Generous restores as Generous', () => {
    restoreFromBackup({ ...cloneDef(), workouts: [], routines: [], streakRule: 'generous' })
    expect(ruleNow()).toBe('generous')
  })

  it('a backup with no rule, or an unknown one, restores as Gentle', () => {
    restoreFromBackup({ ...cloneDef(), workouts: [], routines: [] })
    expect(ruleNow()).toBe('gentle')
    restoreFromBackup({ ...cloneDef(), workouts: [], routines: [], streakRule: 'bogus' })
    expect(ruleNow()).toBe('gentle')
  })

  it('Reset puts the rule back to Gentle', () => {
    setRule('generous')
    resetProfile()
    expect(ruleNow()).toBe('gentle')
  })
})

describe('freeze rule in the plan file', () => {
  it('a plan file never carries the rule', () => {
    const S = { ...cloneDef(), streakRule: 'generous', routines: [] }
    const bundle = buildPlanBundle(S, 'Push pull')
    expect('streakRule' in bundle).toBe(false)
    expect(JSON.stringify(bundle)).not.toContain('streakRule')
  })
})
