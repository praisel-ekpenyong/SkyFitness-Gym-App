// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './useStore.js'
import { DEF, normalizeState } from '../lib/profile/index.js'
import { __setSinksForTests, __setLocalWriteForTests, flush } from '../platform/storage.js'
import { restoreFromBackup, resetProfile } from '../platform/restore.js'
import { buildPlanBundle } from '../lib/plan-share.js'

vi.mock('../platform/sound.js', async orig => (await import('../test/platform-mocks.js')).mockSound(await orig()))
vi.mock('../platform/mobile.js', async orig => (await import('../test/platform-mocks.js')).mockMobile(await orig()))
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

describe('birth year survives Export and Restore', () => {
  it('a backup carries birth year and a Restore puts it back', () => {
    useStore.setState({ S: { ...useStore.getState().S, birthYear: 1966 } })
    const backup = JSON.parse(JSON.stringify(useStore.getState().S))
    useStore.getState().replaceState(cloneDef())
    expect(useStore.getState().S.birthYear).toBeNull()

    restoreFromBackup(backup)
    expect(useStore.getState().S.birthYear).toBe(1966)
  })

  it('a backup from before the field existed restores as not set', () => {
    const { birthYear, ...older } = cloneDef()
    restoreFromBackup({ ...older, workouts: [], routines: [] })
    expect(useStore.getState().S.birthYear).toBeNull()
  })

  it('a Restore with an invalid birth year reads as not set', () => {
    for (const bad of ['robot', 99, 12345, 2999, 1990.5, '1990']) {
      restoreFromBackup({ ...cloneDef(), workouts: [], routines: [], birthYear: bad })
      expect(useStore.getState().S.birthYear).toBeNull()
    }
  })
})

describe('Reset clears birth year', () => {
  it('resetProfile returns birth year to not set', () => {
    useStore.setState({ S: { ...useStore.getState().S, birthYear: 1966 } })
    resetProfile()
    expect(useStore.getState().S.birthYear).toBeNull()
  })
})

describe('invalid stored birth years read as not set', () => {
  it('normalizeState keeps a four-digit year that is not in the future', () => {
    expect(normalizeState({ birthYear: 1966 }, Date.now()).birthYear).toBe(1966)
    expect(normalizeState({ birthYear: 2999 }, Date.now()).birthYear).toBeNull()
    expect(normalizeState({ birthYear: 'robot' }, Date.now()).birthYear).toBeNull()
    expect(normalizeState({}, Date.now()).birthYear).toBeNull()
  })
})

describe('the plan file never carries birth year', () => {
  it('buildPlanBundle leaves birth year out', () => {
    const S = { ...cloneDef(), birthYear: 1966, routines: [], customEx: [], week: {} }
    const bundle = buildPlanBundle(S, 'Push')
    expect(JSON.stringify(bundle)).not.toContain('"birthYear"')
    expect(bundle).not.toHaveProperty('birthYear')
  })
})
